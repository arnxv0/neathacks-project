"""`preflight db stats` / `db.stats()` against a throwaway SQLite store."""
from __future__ import annotations
import json
import pytest
from typer.testing import CliRunner

from preflight import db
from preflight.cli import app
from preflight.models import Cluster, FixAttempt, RunRecord

AID = "20261011-000000-test"


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("PREFLIGHT_DB", str(tmp_path / "preflight.sqlite"))
    return tmp_path / "preflight.sqlite"


def _run(run_id: str, kind: str, failed: bool, aid: str = AID) -> RunRecord:
    return RunRecord(run_id=run_id, assessment_id=aid, attack_id="A1", seed_id="s1", started_at="2026-10-11T00:00:00", failed=failed, kind=kind)


def _seed(aid: str = AID, after: bool = True) -> None:
    db.upsert_assessment(aid, {"state": "DONE", "mode": "full", "label": "demo"})
    for i, failed in enumerate([True, True, False]):
        db.upsert_run(_run(f"A1-s{i}-{aid}", "attack", failed, aid))
    for i, failed in enumerate([False, True, False, False]):
        db.upsert_run(_run(f"replay-{i}-{aid}", "replay", failed, aid))
    if after:
        for i in range(2):
            db.upsert_run(_run(f"after-A1-s{i}-{aid}", "regression", False, aid))
    db.upsert_run(_run(f"regress-c1-{aid}", "regression", True, aid))   # regression-suite run, not an after run
    for cid, status in (("c1", "merged"), ("c2", "merged"), ("c3", "needs_human")):
        db.upsert_cluster(aid, Cluster(cluster_id=cid, signature=cid, family="A", attack_ids=["A1"], run_ids=[], failing_graders=["canary"], status=status))
    db.upsert_attempt(aid, FixAttempt(cluster_id="c1", n=1, branch="fix/c1", status="approved", cost_usd=1.5))
    db.upsert_attempt(aid, FixAttempt(cluster_id="c3", n=1, branch="fix/c3", status="failed", cost_usd=1.0))
    db.upsert_attempt(aid, FixAttempt(cluster_id="c3", n=2, author="human", branch="fix/c3", status="approved", cost_usd=0.0))
    db.insert_event(aid, {"seq": 1, "ts": 1.0, "type": "recovery", "cluster_id": "c3"})
    db.insert_event(aid, {"seq": 2, "ts": 2.0, "type": "run.started"})
    db.upsert_regressions(aid, [{"cluster_id": "c1", "passed": True}, {"cluster_id": "c2", "passed": False}])


def test_stats_aggregates(store):
    _seed()
    s = db.stats(AID)
    assert (s["assessment_id"], s["state"], s["mode"], s["label"]) == (AID, "DONE", "full", "demo")
    assert s["before"] == {"total": 3, "attack_succeeded": 2}
    assert s["after"] == {"total": 2, "attack_succeeded": 0}
    assert s["clusters"] == {"total": 3, "by_status": {"merged": 2, "needs_human": 1}}
    assert s["fixes"] == {"attempts": 3, "approved": 2, "by_author": {"fixer": 2, "human": 1}, "total_cost_usd": 2.5}
    assert s["replays"] == {"runs": 4, "failed": 1}
    assert s["regressions"] == {"suites": 2, "regressed": 1}
    assert s["recoveries"] == 1


def test_stats_defaults_to_latest_and_after_is_none_without_after_runs(store):
    _seed("older", after=False)
    _seed("newer", after=False)
    assert db.stats()["assessment_id"] == "newer"
    assert db.stats("older")["after"] is None
    with pytest.raises(LookupError):
        db.stats("missing")


def test_stats_reads_an_exported_store(store, tmp_path, monkeypatch):
    """`db export` copies the file without its -wal/-shm; a read-only open of that copy must still work."""
    import shutil
    _seed()
    with db.connect() as c:
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    exported = tmp_path / "export.sqlite"
    shutil.copy(store, exported)
    monkeypatch.setenv("PREFLIGHT_DB", str(exported))
    assert db.stats()["before"] == {"total": 3, "attack_succeeded": 2}
    with pytest.raises(Exception, match="readonly"):
        with db.connect(readonly=True) as c:
            c.execute("DELETE FROM runs")


def test_cli_json_and_empty_store(store):
    runner = CliRunner()
    res = runner.invoke(app, ["db", "stats"])
    assert res.exit_code == 1 and "no assessments" in res.output
    _seed()
    res = runner.invoke(app, ["db", "stats", AID, "--json"])
    assert res.exit_code == 0, res.output
    assert json.loads(res.output)["before"] == {"total": 3, "attack_succeeded": 2}
    res = runner.invoke(app, ["db", "stats"])
    assert res.exit_code == 0 and "before" in res.output and "attack_succeeded=2" in res.output


def test_stats_after_counts_only_the_latest_pass_per_seed(store):
    db.upsert_assessment(AID, {"state": "DONE", "mode": "full"})
    db.upsert_run(_run(f"A1-s1-{AID}", "attack", True))
    first = _run(f"after-A1-s1-old-{AID}", "regression", True); first.started_at = "2026-10-11T08:19:00"
    second = _run(f"after-A1-s1-new-{AID}", "regression", False); second.started_at = "2026-10-11T08:33:00"
    db.upsert_run(first); db.upsert_run(second)
    assert db.stats(AID)["after"] == {"total": 1, "attack_succeeded": 0}
