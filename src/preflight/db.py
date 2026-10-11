"""SQLite ledger store.

The file ledger (`ledger/<assessment>/…`, see ARCHITECTURE §5) stays the write path the coordinator, fixers and dashboard
already use. Every write is mirrored here, into one SQLite file, so an assessment can be queried with SQL, copied as a
single artifact, served behind an API with access control, or rebuilt from the files with `preflight db sync`.

Path: `$PREFLIGHT_DB`, default `ledger/preflight.sqlite`. WAL mode, so the coordinator, parallel replay threads and the
approve/regress CLIs can write concurrently. Mirroring never raises: a store problem is logged, the file ledger is still
authoritative, and `db sync` rebuilds the table rows from the files.
"""
from __future__ import annotations
import json, os, pathlib, sqlite3, sys, threading, time
from typing import Any, Iterable

from . import config

_LOCK = threading.Lock()
_INITED: set[str] = set()

SCHEMA = """
CREATE TABLE IF NOT EXISTS assessments (
  assessment_id TEXT PRIMARY KEY, state TEXT, mode TEXT, kind TEXT, label TEXT, target_dir TEXT, target_commit TEXT,
  started_at TEXT, updated_at REAL, preflight_llm_usd REAL, manifest JSON);
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL, attack_id TEXT, seed_id TEXT, kind TEXT, failed INTEGER, error TEXT,
  target_commit TEXT, mode TEXT, started_at TEXT, duration_ms INTEGER, steps INTEGER, tokens_in INTEGER, tokens_out INTEGER,
  usd REAL, neatlogs_trace_id TEXT, neatlogs_url TEXT, reply TEXT, tool_calls JSON, record JSON);
CREATE INDEX IF NOT EXISTS runs_assessment ON runs(assessment_id, kind, attack_id);
CREATE TABLE IF NOT EXISTS verdicts (
  run_id TEXT NOT NULL, grader TEXT NOT NULL, passed INTEGER, violation_step INTEGER, evidence JSON,
  PRIMARY KEY (run_id, grader));
CREATE TABLE IF NOT EXISTS steps (
  run_id TEXT NOT NULL, i INTEGER NOT NULL, component TEXT, type TEXT, tool TEXT, result_kind TEXT, tokens INTEGER, usd REAL,
  duration_ms INTEGER, step JSON, PRIMARY KEY (run_id, i));
CREATE TABLE IF NOT EXISTS clusters (
  assessment_id TEXT NOT NULL, cluster_id TEXT NOT NULL, signature TEXT, family TEXT, status TEXT, attack_ids JSON, run_ids JSON,
  failing_graders JSON, hypothesis TEXT, divergence JSON, record JSON, PRIMARY KEY (assessment_id, cluster_id));
CREATE TABLE IF NOT EXISTS attempts (
  assessment_id TEXT NOT NULL, cluster_id TEXT NOT NULL, n INTEGER NOT NULL, author TEXT, backend TEXT, branch TEXT, commit_sha TEXT,
  entire_checkpoint_id TEXT, tests_green INTEGER, status TEXT, cost_usd REAL, replay_before TEXT, replay_after TEXT, summary TEXT,
  record JSON, PRIMARY KEY (assessment_id, cluster_id, n));
CREATE TABLE IF NOT EXISTS events (
  assessment_id TEXT NOT NULL, seq INTEGER NOT NULL, ts REAL, type TEXT, cluster_id TEXT, run_id TEXT, payload JSON,
  PRIMARY KEY (assessment_id, seq));
CREATE INDEX IF NOT EXISTS events_type ON events(assessment_id, type);
CREATE TABLE IF NOT EXISTS regressions (
  assessment_id TEXT NOT NULL, cluster_id TEXT NOT NULL, passed INTEGER, blame JSON, record JSON,
  PRIMARY KEY (assessment_id, cluster_id));
CREATE VIEW IF NOT EXISTS scorecard AS
  SELECT assessment_id, kind, attack_id, COUNT(*) AS runs, SUM(failed) AS attack_succeeded, ROUND(SUM(usd), 5) AS usd
  FROM runs GROUP BY assessment_id, kind, attack_id;
CREATE VIEW IF NOT EXISTS fixes AS
  SELECT a.assessment_id, a.cluster_id, c.family, c.status AS cluster_status, a.n, a.author, a.status, a.tests_green,
         a.replay_before, a.replay_after, a.commit_sha, a.entire_checkpoint_id, a.cost_usd
  FROM attempts a LEFT JOIN clusters c ON c.assessment_id = a.assessment_id AND c.cluster_id = a.cluster_id;
"""


def path() -> pathlib.Path:
    p = os.getenv("PREFLIGHT_DB")
    return pathlib.Path(p) if p else config.LEDGER_DIR / "preflight.sqlite"


def connect(db: pathlib.Path | None = None, readonly: bool = False) -> sqlite3.Connection:
    p = db or path()
    p.parent.mkdir(parents=True, exist_ok=True)
    if readonly:
        conn = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=30)
        try:
            conn.execute("SELECT 1 FROM sqlite_master LIMIT 1")
        except sqlite3.OperationalError:
            # A WAL store with no live -shm (an export, or no writer open): a mode=ro handle cannot create it and every
            # read fails with "unable to open database file". Open normally instead; query_only still refuses every write.
            conn.close()
            conn = sqlite3.connect(p, timeout=30)
        conn.execute("PRAGMA query_only = 1")
    else:
        conn = sqlite3.connect(p, timeout=30, check_same_thread=False)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        key = str(p.resolve())
        if key not in _INITED:
            with _LOCK:
                conn.executescript(SCHEMA)
                _INITED.add(key)
    conn.row_factory = sqlite3.Row
    return conn


def _j(x: Any) -> str:
    return json.dumps(x, default=str)


def _safe(fn):
    """Mirroring must never break a run; log and carry on (the file ledger is authoritative, `db sync` catches up)."""
    def wrapper(*a, **kw):
        try:
            return fn(*a, **kw)
        except Exception as e:  # pragma: no cover
            print(f"[preflight.db] {fn.__name__} skipped: {e}", file=sys.stderr)
    wrapper.__name__ = fn.__name__
    return wrapper


# ---- write-through ----
@_safe
def upsert_assessment(assessment_id: str, manifest: dict) -> None:
    with connect() as c:
        c.execute("""INSERT INTO assessments (assessment_id, state, mode, kind, label, target_dir, target_commit, started_at, updated_at,
                     preflight_llm_usd, manifest) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                     ON CONFLICT(assessment_id) DO UPDATE SET state=excluded.state, mode=excluded.mode, kind=excluded.kind, label=excluded.label,
                     target_dir=excluded.target_dir, target_commit=excluded.target_commit, started_at=COALESCE(excluded.started_at, assessments.started_at),
                     updated_at=excluded.updated_at, preflight_llm_usd=excluded.preflight_llm_usd, manifest=excluded.manifest""",
                  (assessment_id, manifest.get("state"), manifest.get("mode"), manifest.get("kind", "assessment"), manifest.get("label"),
                   manifest.get("target_dir"), manifest.get("target_commit"), manifest.get("started_at"), time.time(),
                   manifest.get("preflight_llm_usd"), _j(manifest)))


@_safe
def upsert_run(run, steps=None) -> None:
    r = run.model_dump()
    with connect() as c:
        c.execute("""INSERT OR REPLACE INTO runs (run_id, assessment_id, attack_id, seed_id, kind, failed, error, target_commit, mode, started_at,
                     duration_ms, steps, tokens_in, tokens_out, usd, neatlogs_trace_id, neatlogs_url, reply, tool_calls, record)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (r["run_id"], r["assessment_id"], r["attack_id"], r["seed_id"], r["kind"], int(bool(r["failed"])), r.get("error"),
                   r.get("target_commit"), r.get("mode"), r.get("started_at"), r.get("duration_ms"), r.get("steps"), r.get("tokens_in"),
                   r.get("tokens_out"), r.get("usd"), r.get("neatlogs_trace_id"), r.get("neatlogs_url"), r.get("reply"), _j(r.get("tool_calls")), _j(r)))
        c.execute("DELETE FROM verdicts WHERE run_id = ?", (r["run_id"],))
        c.executemany("INSERT INTO verdicts (run_id, grader, passed, violation_step, evidence) VALUES (?,?,?,?,?)",
                      [(r["run_id"], g, int(bool(v["passed"])), v.get("violation_step"), _j(v.get("evidence", []))) for g, v in (r.get("verdicts") or {}).items()])
        if steps is not None:
            c.execute("DELETE FROM steps WHERE run_id = ?", (r["run_id"],))
            c.executemany("INSERT INTO steps (run_id, i, component, type, tool, result_kind, tokens, usd, duration_ms, step) VALUES (?,?,?,?,?,?,?,?,?,?)",
                          [(r["run_id"], s.i, s.component, s.type, s.tool, s.result_kind, s.tokens, s.usd, s.duration_ms, _j(s.model_dump())) for s in steps])


@_safe
def upsert_cluster(assessment_id: str, cluster) -> None:
    d = cluster.model_dump()
    with connect() as c:
        c.execute("""INSERT OR REPLACE INTO clusters (assessment_id, cluster_id, signature, family, status, attack_ids, run_ids, failing_graders,
                     hypothesis, divergence, record) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                  (assessment_id, d["cluster_id"], d.get("signature"), d.get("family"), d.get("status"), _j(d.get("attack_ids")), _j(d.get("run_ids")),
                   _j(d.get("failing_graders")), d.get("hypothesis"), _j(d.get("divergence")), _j(d)))


@_safe
def upsert_attempt(assessment_id: str, attempt) -> None:
    d = attempt.model_dump()
    rep = d.get("replay") or {}
    with connect() as c:
        c.execute("""INSERT OR REPLACE INTO attempts (assessment_id, cluster_id, n, author, backend, branch, commit_sha, entire_checkpoint_id, tests_green,
                     status, cost_usd, replay_before, replay_after, summary, record) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (assessment_id, d["cluster_id"], d["n"], d.get("author"), d.get("backend"), d.get("branch"), d.get("commit"), d.get("entire_checkpoint_id"),
                   None if d.get("tests_green") is None else int(bool(d["tests_green"])), d.get("status"), d.get("cost_usd"),
                   rep.get("before") if isinstance(rep, dict) else None, rep.get("after") if isinstance(rep, dict) else None, d.get("summary"), _j(d)))


@_safe
def insert_event(assessment_id: str, ev: dict) -> None:
    with connect() as c:
        c.execute("INSERT OR REPLACE INTO events (assessment_id, seq, ts, type, cluster_id, run_id, payload) VALUES (?,?,?,?,?,?,?)",
                  (assessment_id, ev.get("seq"), ev.get("ts"), ev.get("type"), ev.get("cluster_id"), ev.get("run_id"), _j(ev)))


@_safe
def upsert_regressions(assessment_id: str, results: Iterable[dict]) -> None:
    with connect() as c:
        for r in results:
            c.execute("INSERT OR REPLACE INTO regressions (assessment_id, cluster_id, passed, blame, record) VALUES (?,?,?,?,?)",
                      (assessment_id, r.get("cluster_id"), int(bool(r.get("passed"))), _j(r.get("blame")), _j(r)))


# ---- rebuild from the file ledger ----
def sync_assessment(ledger) -> dict:
    """Rebuild every row of one assessment from its files. Idempotent."""
    from .events import read_events
    upsert_assessment(ledger.assessment_id, ledger.manifest())
    n_runs = 0
    for run in ledger.runs():
        upsert_run(run, ledger.read_steps(run.run_id)); n_runs += 1
    for cl in ledger.clusters():
        upsert_cluster(ledger.assessment_id, cl)
        for a in ledger.attempts(cl.cluster_id):
            upsert_attempt(ledger.assessment_id, a)
    evs = read_events(ledger.root / "events.jsonl")
    with connect() as c:
        c.executemany("INSERT OR REPLACE INTO events (assessment_id, seq, ts, type, cluster_id, run_id, payload) VALUES (?,?,?,?,?,?,?)",
                      [(ledger.assessment_id, e.get("seq"), e.get("ts"), e.get("type"), e.get("cluster_id"), e.get("run_id"), _j(e)) for e in evs])
    rep = ledger.root / "report" / "report.json"
    if rep.exists():
        try:
            upsert_regressions(ledger.assessment_id, json.loads(rep.read_text()).get("regressions") or [])
        except Exception:
            pass
    return {"assessment_id": ledger.assessment_id, "runs": n_runs, "events": len(evs)}


def sync_all(base: pathlib.Path | None = None) -> list[dict]:
    from .ledger import Ledger, list_assessments
    return [sync_assessment(Ledger(aid, base=base)) for aid in list_assessments(base)]


# ---- read ----
def query(sql: str, params: tuple = (), limit: int = 500) -> list[dict]:
    """Read-only SQL. Only a single SELECT/WITH statement is accepted; the connection itself is opened read-only."""
    head = sql.lstrip().split(None, 1)[0].upper() if sql.strip() else ""
    if head not in ("SELECT", "WITH", "EXPLAIN") or ";" in sql.rstrip().rstrip(";"):
        raise ValueError("only a single SELECT statement is allowed")
    with connect(readonly=True) as c:
        rows = c.execute(sql, params).fetchmany(limit)
        return [dict(r) for r in rows]


def schema() -> list[dict]:
    with connect(readonly=True) as c:
        return [dict(r) for r in c.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name")]


# The after pass (VERIFY_AFTER) is written with kind='regression' and an `after-` run_id prefix; accept a literal kind too.
_AFTER = "(kind = 'after' OR (kind = 'regression' AND run_id LIKE 'after-%'))"
# An assessment that finishes twice (e.g. after `resume`) has two after-passes; only the newest run per seed counts.
_LATEST_AFTER = f"""{_AFTER} AND NOT EXISTS (
    SELECT 1 FROM runs n WHERE n.assessment_id = runs.assessment_id AND n.attack_id = runs.attack_id AND n.seed_id = runs.seed_id
      AND (n.kind = 'after' OR (n.kind = 'regression' AND n.run_id LIKE 'after-%')) AND n.started_at > runs.started_at)"""


def _one(c: sqlite3.Connection, sql: str, params: tuple) -> sqlite3.Row:
    return c.execute(sql, params).fetchone()


def _counts(c: sqlite3.Connection, sql: str, params: tuple) -> dict[str, int]:
    """`SELECT key, COUNT(*) ... GROUP BY key` -> {key: n}."""
    return {str(r[0] or "unknown"): r[1] for r in c.execute(sql, params)}


def _runs(c: sqlite3.Connection, aid: str, where: str, keys: tuple[str, str] = ("total", "attack_succeeded")) -> dict | None:
    """{total, failed} over the runs matching `where`, or None when there are none."""
    r = _one(c, f"SELECT COUNT(*), COALESCE(SUM(failed), 0) FROM runs WHERE assessment_id = ? AND {where}", (aid,))
    return dict(zip(keys, (r[0], r[1]))) if r[0] else None


def stats(assessment_id: str | None = None) -> dict:
    """At-a-glance summary of one assessment (default: the most recently updated). Read-only; raises LookupError if absent."""
    if not path().exists():
        raise LookupError(f"no assessments: store {path()} does not exist (run `preflight db sync`)")
    with connect(readonly=True) as c:
        if assessment_id is None:
            a = _one(c, "SELECT assessment_id, state, mode, label FROM assessments ORDER BY updated_at DESC LIMIT 1", ())
        else:
            a = _one(c, "SELECT assessment_id, state, mode, label FROM assessments WHERE assessment_id = ?", (assessment_id,))
        if a is None:
            raise LookupError(f"no assessment {assessment_id!r} in {path()}" if assessment_id else f"no assessments in {path()}")
        aid = a["assessment_id"]
        fx = _one(c, """SELECT COUNT(*) AS attempts, COALESCE(SUM(status = 'approved'), 0) AS approved, ROUND(COALESCE(SUM(cost_usd), 0), 4) AS usd
                        FROM attempts WHERE assessment_id = ?""", (aid,))
        rg = _one(c, "SELECT COUNT(*) AS suites, COALESCE(SUM(passed = 0), 0) AS regressed FROM regressions WHERE assessment_id = ?", (aid,))
        return {
            "assessment_id": aid, "state": a["state"], "mode": a["mode"], "label": a["label"],
            "before": _runs(c, aid, "kind = 'attack'") or {"total": 0, "attack_succeeded": 0},
            "after": _runs(c, aid, _LATEST_AFTER),
            "clusters": {"total": _one(c, "SELECT COUNT(*) FROM clusters WHERE assessment_id = ?", (aid,))[0],
                         "by_status": _counts(c, "SELECT status, COUNT(*) FROM clusters WHERE assessment_id = ? GROUP BY status", (aid,))},
            "fixes": {"attempts": fx["attempts"], "approved": fx["approved"],
                      "by_author": _counts(c, "SELECT author, COUNT(*) FROM attempts WHERE assessment_id = ? GROUP BY author", (aid,)),
                      "total_cost_usd": fx["usd"]},
            "replays": _runs(c, aid, "kind = 'replay'", ("runs", "failed")) or {"runs": 0, "failed": 0},
            "regressions": {"suites": rg["suites"], "regressed": rg["regressed"]},
            "recoveries": _one(c, "SELECT COUNT(*) FROM events WHERE assessment_id = ? AND type = 'recovery'", (aid,))[0],
        }
