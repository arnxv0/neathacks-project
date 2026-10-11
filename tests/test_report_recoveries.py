"""report.recoveries reads events.jsonl back into the human-facing recovery list."""
from __future__ import annotations
import json

from preflight.ledger import Ledger
from preflight.report.report import recoveries


def _write_events(led: Ledger, events: list[dict | str]) -> None:
    lines = [e if isinstance(e, str) else json.dumps(e) for e in events]
    (led.root / "events.jsonl").write_text("\n".join(lines) + "\n")


def test_recoveries_empty_without_events_file(tmp_path):
    assert recoveries(Ledger("a1", base=tmp_path / "ledger")) == []


def test_recoveries_extracts_each_kind_and_skips_noise(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    _write_events(led, [
        {"seq": 1, "ts": 1.0, "type": "state", "state": "ATTACK"},
        {"seq": 2, "ts": 2.0, "type": "recovery", "kind": "replay_retry", "cluster_id": "c1", "attempt": 1, "detail": "1/3 -> retry"},
        {"seq": 3, "ts": 3.0, "type": "trace.fallback", "run_id": "r1", "reason": "neatlogs 404"},
        {"seq": 4, "ts": 4.0, "type": "fix.attempt.done", "cluster_id": "c1", "attempt": 1, "ok": True, "tests_green": True},
        {"seq": 5, "ts": 5.0, "type": "fix.attempt.done", "cluster_id": "c1", "attempt": 2, "ok": True, "tests_green": False},
        {"seq": 6, "ts": 6.0, "type": "fix.attempt.done", "cluster_id": "c2", "attempt": 1, "ok": False, "error": "no commit produced"},
        "{this is not json",
        {"seq": 7, "ts": 7.0, "type": "fix.error", "error": "assessment cap reached"},
    ])
    out = recoveries(led)
    assert [r["kind"] for r in out] == ["replay_retry", "trace_fallback", "fixer_attempt_failed", "fixer_attempt_failed", "stopped"]
    assert out[0] == {"kind": "replay_retry", "cluster_id": "c1", "attempt": 1, "detail": "1/3 -> retry", "ts": 2.0}
    assert out[1]["run_id"] == "r1" and out[1]["detail"] == "neatlogs 404"
    assert out[2]["attempt"] == 2 and out[2]["detail"].startswith("tests red on the fix branch")
    assert out[3]["cluster_id"] == "c2" and out[3]["detail"] == "no commit produced"
    assert out[4] == {"kind": "stopped", "detail": "assessment cap reached", "ts": 7.0}


def test_recoveries_prefers_detail_over_reason_for_trace_fallback(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    _write_events(led, [{"seq": 1, "ts": 1.0, "type": "trace.fallback", "run_id": "r1", "detail": "mirror", "reason": "ignored"}])
    assert recoveries(led)[0]["detail"] == "mirror"


def test_recoveries_reads_what_the_ledger_eventbus_wrote(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    led.events.emit("recovery", kind="merge_conflict", cluster_id="c1", attempt=1, detail="re-checked main")
    led.events.emit("state", state="DONE")
    out = recoveries(led)
    assert len(out) == 1 and out[0]["kind"] == "merge_conflict" and out[0]["ts"] > 0
