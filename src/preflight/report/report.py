"""Scorecard + report.json."""
from __future__ import annotations
import collections, datetime as dt, json
from rich.console import Console
from rich.table import Table
from .. import config
from ..ledger import Ledger
from ..models import AttackSpec, RunRecord

def scorecard(runs: list[RunRecord], specs: dict[str, AttackSpec]) -> dict:
    by_attack: dict[str, dict] = {}
    for r in runs:
        a = by_attack.setdefault(r.attack_id, {"attack_id": r.attack_id, "family": specs[r.attack_id].family if r.attack_id in specs else r.attack_id[0],
                                                "owasp": specs[r.attack_id].owasp if r.attack_id in specs else None, "runs": 0, "succeeded": 0, "undelivered": 0, "run_ids": [], "failing_graders": collections.Counter()})
        a["runs"] += 1; a["run_ids"].append(r.run_id)
        if not r.failed and not r.delivered:
            a["undelivered"] += 1
        if r.failed:
            a["succeeded"] += 1
            for g, v in r.verdicts.items():
                if not v.passed:
                    a["failing_graders"][g] += 1
    for a in by_attack.values():
        a["failing_graders"] = dict(a["failing_graders"])
    by_family = collections.defaultdict(lambda: {"runs": 0, "succeeded": 0})
    by_owasp = collections.defaultdict(lambda: {"runs": 0, "succeeded": 0})
    for a in by_attack.values():
        by_family[a["family"]]["runs"] += a["runs"]; by_family[a["family"]]["succeeded"] += a["succeeded"]
        if a["owasp"]:
            by_owasp[a["owasp"]]["runs"] += a["runs"]; by_owasp[a["owasp"]]["succeeded"] += a["succeeded"]
    return {"total": len(runs), "succeeded": sum(1 for r in runs if r.failed), "by_attack": by_attack,
            "undelivered": sum(1 for r in runs if not r.failed and not r.delivered),
            "undelivered_run_ids": [r.run_id for r in runs if not r.failed and not r.delivered],
            "by_family": dict(by_family), "by_owasp": dict(by_owasp)}

def print_scorecard(sc: dict, title: str = "Scorecard", console: Console | None = None) -> None:
    console = console or Console()
    t = Table(title=f"{title}: {sc['succeeded']}/{sc['total']} attacks succeeded")
    for col in ("attack", "family", "OWASP", "runs", "succeeded", "failing graders"):
        t.add_column(col)
    for a in sorted(sc["by_attack"].values(), key=lambda x: x["attack_id"]):
        color = "red" if a["succeeded"] else "green"
        t.add_row(a["attack_id"], a["family"], a["owasp"] or "-", str(a["runs"]), f"[{color}]{a['succeeded']}[/{color}]",
                  ", ".join(f"{g}×{n}" for g, n in a["failing_graders"].items()) or "-")
    console.print(t)

def write(ledger: Ledger, specs: dict[str, AttackSpec], extra: dict | None = None) -> dict:
    runs = ledger.runs(kind="attack")
    sc = scorecard(runs, specs)
    report = {"assessment_id": ledger.assessment_id, "generated_at": dt.datetime.utcnow().isoformat(), "manifest": ledger.manifest(),
              "scorecard": sc, "runs": [r.model_dump() for r in runs],
              "clusters": [c.model_dump() for c in ledger.clusters()],
              "fixes": [a.model_dump() for c in ledger.clusters() for a in ledger.attempts(c.cluster_id)],
              "cost": {"target_usd": sum(r.usd for r in runs), "preflight_llm_usd": ledger.manifest().get("preflight_llm_usd", 0.0)},
              "recoveries": recoveries(ledger),
              **(extra or {})}
    from . import cost_report
    report["cost_report"] = cost_report.write(ledger)
    (ledger.root / "report" / "report.json").write_text(json.dumps(report, indent=2, default=str))
    import shutil
    (config.OUT_DIR).mkdir(exist_ok=True)
    shutil.copy(ledger.root / "report" / "report.json", config.OUT_DIR / "report.json")
    return report


def recoveries(ledger: Ledger) -> list[dict]:
    """Every point where the assessment hit a failed action and carried on: explicit `recovery` events (fixer retries after a
    failed replay, merge conflicts resolved by re-checking main), trace lookups that fell back, fixer attempts that ended without
    a usable commit or with red tests, and stop conditions. Read from events.jsonl so the report stands alone."""
    out = []
    path = ledger.root / "events.jsonl"
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        try:
            e = json.loads(line)
        except Exception:
            continue
        t = e.get("type")
        if t == "recovery":
            out.append({"kind": e.get("kind"), "cluster_id": e.get("cluster_id"), "attempt": e.get("attempt"), "detail": e.get("detail"), "ts": e.get("ts")})
        elif t == "trace.fallback":
            out.append({"kind": "trace_fallback", "run_id": e.get("run_id"), "detail": e.get("detail") or e.get("reason"), "ts": e.get("ts")})
        elif t == "fix.attempt.done" and (not e.get("ok") or e.get("tests_green") is False):
            out.append({"kind": "fixer_attempt_failed", "cluster_id": e.get("cluster_id"), "attempt": e.get("attempt"),
                        "detail": e.get("error") or "tests red on the fix branch; failure text sent back to the fixer", "ts": e.get("ts")})
        elif t == "fix.error":
            out.append({"kind": "stopped", "detail": e.get("error"), "ts": e.get("ts")})
    return out
