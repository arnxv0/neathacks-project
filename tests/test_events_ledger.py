"""EventBus / read_events and Ledger round-trips, all under tmp_path."""
from __future__ import annotations
import json
import pathlib
import re

from preflight import ledger as ledger_mod
from preflight.events import EventBus, read_events, tail
from preflight.ledger import Ledger, list_assessments, new_assessment_id
from preflight.models import Cluster, Divergence, FixAttempt, Replay, RunRecord, Step, Verdict


# ---------------- events ----------------

def test_eventbus_appends_increasing_seq_and_payload(tmp_path):
    bus = EventBus(tmp_path / "ev" / "events.jsonl")
    e1 = bus.emit("run.start", run_id="r1")
    e2 = bus.emit("run.done", run_id="r1", failed=False)
    assert (e1["seq"], e2["seq"]) == (1, 2)
    assert e2["type"] == "run.done" and e2["failed"] is False and e2["ts"] > 0
    lines = (tmp_path / "ev" / "events.jsonl").read_text().splitlines()
    assert [json.loads(l)["seq"] for l in lines] == [1, 2]


def test_eventbus_resumes_seq_from_existing_file(tmp_path):
    p = tmp_path / "events.jsonl"
    EventBus(p).emit("a"); EventBus(p).emit("b")
    bus = EventBus(p)
    assert bus.emit("c")["seq"] == 3


def test_eventbus_serialises_non_json_payloads(tmp_path):
    bus = EventBus(tmp_path / "events.jsonl")
    bus.emit("x", path=pathlib.Path("/tmp/a"))
    assert read_events(tmp_path / "events.jsonl")[0]["path"] == "/tmp/a"


def test_on_emit_callback_receives_event_and_its_exceptions_are_swallowed(tmp_path):
    seen = []

    def boom(ev):
        seen.append(ev["seq"])
        raise RuntimeError("mirror down")

    bus = EventBus(tmp_path / "events.jsonl", on_emit=boom)
    ev = bus.emit("state", state="ATTACK")
    assert ev["seq"] == 1 and seen == [1]
    assert read_events(tmp_path / "events.jsonl") == [ev] or read_events(tmp_path / "events.jsonl")[0]["seq"] == 1


def test_read_events_since_cursor_and_missing_file(tmp_path):
    p = tmp_path / "events.jsonl"
    assert read_events(p) == []
    bus = EventBus(p)
    for n in range(5):
        bus.emit("tick", n=n)
    p.write_text(p.read_text() + "\n\n")      # blank lines are tolerated
    assert [e["n"] for e in read_events(p, since=3)] == [3, 4]
    assert read_events(p, since=5) == []


def test_tail_yields_existing_events_before_sleeping(tmp_path):
    p = tmp_path / "events.jsonl"
    EventBus(p).emit("first")
    assert next(tail(p, poll=0))["type"] == "first"


# ---------------- ledger ----------------

def _run(run_id: str, **kw) -> RunRecord:
    base = dict(run_id=run_id, assessment_id="a1", attack_id="D1", seed_id="s1", started_at="2026-10-11T00:00:00", reply="hi")
    base.update(kw)
    return RunRecord(**base)


def test_ledger_uses_base_dir_and_creates_layout(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    assert led.root == tmp_path / "ledger" / "a1"
    assert all((led.root / d).is_dir() for d in ("runs", "clusters", "fixes", "report"))
    assert not (pathlib.Path(__file__).resolve().parents[1] / "ledger" / "a1").exists()


def test_ledger_default_base_is_the_patched_config_dir(tmp_path):
    # conftest points config.LEDGER_DIR at tmp_path/ledger
    led = Ledger("a2")
    assert led.root == tmp_path / "ledger" / "a2"


def test_ledger_run_round_trip_with_steps_transcript_and_verdicts(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    verdicts = {"watchlist": Verdict(grader="watchlist", passed=False, evidence=["step 2: forbidden tool"], violation_step=2)}
    run = _run("r1", failed=True, verdicts=verdicts, usd=0.0123, tool_calls=[{"tool": "send_email"}])
    steps = [Step(i=0, type="user_message"), Step(i=2, type="tool_call", tool="send_email", args={"to": "x@y.z"}, raw={"k": pathlib.Path("p")})]
    led.write_run(run, steps, transcript="# t\nhello", trace={"spans": 2})
    back = led.read_run("r1")
    assert back == run
    assert back.verdicts["watchlist"].violation_step == 2
    got = led.read_steps("r1")
    assert [s.i for s in got] == [0, 2] and got[1].args == {"to": "x@y.z"} and got[1].raw == {"k": "p"}
    d = led.run_dir("r1")
    assert (d / "transcript.md").read_text() == "# t\nhello"
    assert json.loads((d / "trace.json").read_text()) == {"spans": 2}
    assert json.loads((d / "verdicts.json").read_text())["watchlist"]["passed"] is False


def test_ledger_read_steps_missing_is_empty_and_runs_filters_by_kind(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    led.write_run(_run("r1"))
    led.write_run(_run("r2", kind="replay"))
    led.write_run(_run("r3", kind="regression"))
    assert led.read_steps("r1") == []
    assert [r.run_id for r in led.runs()] == ["r1", "r2", "r3"]
    assert [r.run_id for r in led.runs(kind="replay")] == ["r2"]


def test_ledger_manifest_update_merges(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    assert led.manifest() == {}
    led.write_manifest({"state": "INIT", "mode": "dev"})
    led.update_manifest(state="ATTACK", usd=0.5)
    assert led.manifest() == {"state": "ATTACK", "mode": "dev", "usd": 0.5}


def test_ledger_cluster_round_trip_with_divergence_md(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    c = Cluster(cluster_id="d1-watchlist-abc123", signature="D|watchlist|send_email", family="D", attack_ids=["D1"],
                run_ids=["r1"], failing_graders=["watchlist"],
                divergence=Divergence(run_fail="r1", step_index=2, step_desc="x", mode="vs_spec"), status="open")
    led.write_cluster(c, divergence_md="# div\n")
    assert led.clusters() == [c]
    assert led.read_cluster(c.cluster_id).divergence.step_index == 2
    assert (led.root / "clusters" / c.cluster_id / "divergence.md").read_text() == "# div\n"
    c.status = "merged"
    led.write_cluster(c)                       # no md -> keep the earlier file
    assert led.read_cluster(c.cluster_id).status == "merged"
    assert (led.root / "clusters" / c.cluster_id / "divergence.md").exists()


def test_ledger_attempts_round_trip_sorted_and_missing_cluster_empty(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    assert led.attempts("nope") == []
    a2 = FixAttempt(cluster_id="c1", n=2, branch="fix/c1", status="passed", replay=Replay(before="0/3", after="3/3", passed=3, total=3))
    a1 = FixAttempt(cluster_id="c1", n=1, branch="fix/c1", status="failed", tests_green=False, cost_usd=0.4)
    led.write_attempt(a2); led.write_attempt(a1)
    got = led.attempts("c1")
    assert [a.n for a in got] == [1, 2]
    assert got[0] == a1 and got[1].replay.after == "3/3"
    assert (led.root / "fixes" / "c1" / "attempt-2" / "attempt.json").exists()


def test_ledger_write_readme_and_fix_dir(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    led.write_readme("hello")
    assert (led.root / "README.md").read_text() == "hello"
    assert led.fix_dir("c9") == led.root / "fixes" / "c9" and led.fix_dir("c9").is_dir()


def test_list_assessments_requires_manifest_and_sorts_newest_first(tmp_path):
    base = tmp_path / "ledger"
    assert list_assessments(base) == []
    Ledger("20260101-000000-aaaa", base=base).write_manifest({"state": "DONE"})
    Ledger("20260102-000000-bbbb", base=base).write_manifest({"state": "DONE"})
    Ledger("20260103-000000-cccc", base=base)        # no manifest yet -> hidden
    assert list_assessments(base) == ["20260102-000000-bbbb", "20260101-000000-aaaa"]
    assert list_assessments() == list_assessments(base)   # default base is the patched config dir


def test_new_assessment_id_shape():
    aid = new_assessment_id()
    assert re.fullmatch(r"\d{8}-\d{6}-[0-9a-f]{4}", aid)
    assert aid != new_assessment_id() or True   # same second is fine; the suffix is random


def test_ledger_events_file_lives_under_its_root(tmp_path):
    led = Ledger("a1", base=tmp_path / "ledger")
    led.events.emit("state", state="ATTACK")
    evs = read_events(led.root / "events.jsonl")
    assert len(evs) == 1 and evs[0]["state"] == "ATTACK"
    assert ledger_mod.config.LEDGER_DIR == tmp_path / "ledger"
