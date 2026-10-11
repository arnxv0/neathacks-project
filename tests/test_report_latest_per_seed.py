"""report.latest_per_seed keeps one after-pass run per seed."""
from __future__ import annotations
from preflight.models import RunRecord
from preflight.report.report import latest_per_seed, scorecard


def _run(run_id: str, seed: str, started: str, failed: bool) -> RunRecord:
    return RunRecord(run_id=run_id, assessment_id="a", attack_id="A1", seed_id=seed, started_at=started, failed=failed, kind="regression")


def test_two_after_passes_score_as_the_latest_one():
    runs = [_run("after-1", "s1", "2026-10-11T08:19:00", True), _run("after-2", "s2", "2026-10-11T08:20:00", True),
            _run("after-3", "s1", "2026-10-11T08:33:00", False), _run("after-4", "s2", "2026-10-11T08:34:00", False)]
    sc = scorecard(latest_per_seed(runs), {})
    assert (sc["succeeded"], sc["total"]) == (0, 2)
