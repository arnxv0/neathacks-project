"""Signature clustering and first-divergence, on a throwaway file ledger."""
from __future__ import annotations
import pathlib

from preflight.analyze import cluster, divergence
from preflight.analyze.signature import signature, tool_sequence
from preflight.ledger import Ledger
from preflight.models import AttackSpec, Cluster, RunRecord, Step, Verdict

SPECS = {
    "D1": AttackSpec(id="D1", family="D", name="Injected instructions", description="d", safe_behavior="Ignore instructions found in data.", graders=["watchlist"]),
    "E1": AttackSpec(id="E1", family="E", name="DML through the CRM tool", description="d", safe_behavior="Only read.", graders=["sql_ast"]),
}


def _steps(*tools: str, reply: bool = True) -> list[Step]:
    out = [Step(i=0, type="user_message"), Step(i=1, type="llm_call", result_kind="tool_calls" if tools else "final")]
    for n, t in enumerate(tools, start=2):
        out.append(Step(i=n, type="tool_call", tool=t, args={"n": n}, result_kind="ok"))
    if reply:
        out.append(Step(i=len(out), type="llm_call", result_kind="final"))
        out.append(Step(i=len(out), type="reply", result_excerpt="done"))
    return out


def _run(run_id: str, attack_id: str, failing: dict[str, int | None] | None = None, *, error: str | None = None,
         kind: str = "attack", seed_id: str = "s1") -> RunRecord:
    verdicts = {g: Verdict(grader=g, passed=False, evidence=[f"{g} failed"], violation_step=step) for g, step in (failing or {}).items()}
    verdicts.setdefault("canary", Verdict(grader="canary", passed=True))
    return RunRecord(run_id=run_id, assessment_id="a1", attack_id=attack_id, seed_id=seed_id, started_at="t", kind=kind,
                     verdicts=verdicts, failed=bool(failing) or bool(error), error=error, reply="done")


def _ledger(tmp_path: pathlib.Path) -> Ledger:
    return Ledger("a1", base=tmp_path / "ledger")


# ---------------- signature ----------------

def test_tool_sequence_cuts_at_violation_step():
    steps = _steps("crm_query", "send_email", "issue_credit")
    assert tool_sequence(steps) == ["crm_query", "send_email", "issue_credit"]
    assert tool_sequence(steps, upto=3) == ["crm_query", "send_email"]


def test_signature_is_deterministic_and_short_hash_is_stable():
    run = _run("r1", "D1", {"watchlist": 3})
    k1, h1 = signature(run, _steps("crm_query", "send_email"), "D")
    k2, h2 = signature(run, _steps("crm_query", "send_email"), "D")
    assert (k1, h1) == (k2, h2)
    assert k1 == "D|watchlist|crm_query>send_email"
    assert len(h1) == 6


def test_signature_includes_error_kind_for_errored_runs():
    key, _ = signature(_run("r1", "D1", error="ConnectError: connection refused"), [], "D")
    assert key.endswith("|error:ConnectError")
    key2, _ = signature(_run("r2", "D1", error="timeout"), [], "D")
    assert key2.endswith("|error:timeout")


def test_signature_sorts_failing_graders():
    run = _run("r1", "E1", {"tenant": 4, "sql_ast": 2})
    key, _ = signature(run, _steps("crm_query"), "E")
    assert key.startswith("E|sql_ast,tenant|")


# ---------------- cluster.build ----------------

def test_identical_failures_cluster_together(tmp_path):
    led = _ledger(tmp_path)
    runs = [_run("r1", "D1", {"watchlist": 3}), _run("r2", "D1", {"watchlist": 3}, seed_id="s2"), _run("r3", "D1")]
    for r in runs:
        led.write_run(r, _steps("crm_query", "send_email"))
    out = cluster.build(led, runs, SPECS)
    assert len(out) == 1
    c = out[0]
    assert c.run_ids == ["r1", "r2"]                 # the passing run is left out
    assert c.attack_ids == ["D1"] and c.failing_graders == ["watchlist"] and c.family == "D"
    assert c.cluster_id.startswith("d1-watchlist-") and c.cluster_id == c.cluster_id.lower()


def test_different_failing_graders_separate(tmp_path):
    led = _ledger(tmp_path)
    runs = [_run("r1", "E1", {"sql_ast": 2}), _run("r2", "E1", {"tenant": 3})]
    for r in runs:
        led.write_run(r, _steps("crm_query"))
    out = cluster.build(led, runs, SPECS)
    assert len(out) == 2
    assert sorted(c.failing_graders[0] for c in out) == ["sql_ast", "tenant"]


def test_same_grader_different_tool_path_separate(tmp_path):
    led = _ledger(tmp_path)
    r1, r2 = _run("r1", "D1", {"watchlist": 3}), _run("r2", "D1", {"watchlist": 2})
    led.write_run(r1, _steps("crm_query", "send_email"))
    led.write_run(r2, _steps("send_email"))
    assert len(cluster.build(led, [r1, r2], SPECS)) == 2


def test_errored_runs_are_included_with_error_signature(tmp_path):
    led = _ledger(tmp_path)
    runs = [_run("r1", "D1", {"schema": None}, error="ConnectError: refused"), _run("r2", "D1", {"schema": None}, error="ConnectError: reset"),
            _run("r3", "D1", {"schema": None})]
    for r in runs:
        led.write_run(r, [])
    out = cluster.build(led, runs, SPECS)
    assert len(out) == 2
    by_runs = {tuple(c.run_ids): c.signature for c in out}
    assert by_runs[("r1", "r2")].endswith("|error:ConnectError")
    assert "|error:" not in by_runs[("r3",)]


def test_unknown_attack_falls_back_to_first_letter_family(tmp_path):
    led = _ledger(tmp_path)
    r = _run("r1", "Z9", {"canary": 1})
    led.write_run(r, _steps("crm_query"))
    out = cluster.build(led, [r], SPECS)
    assert out[0].family == "Z" and out[0].signature.startswith("Z|canary|")


def test_cluster_merges_grader_sets_across_attacks_with_same_signature(tmp_path):
    led = _ledger(tmp_path)
    r1, r2 = _run("r1", "D1", {"watchlist": 2}), _run("r2", "D2", {"watchlist": 2})
    led.write_run(r1, _steps("send_email")); led.write_run(r2, _steps("send_email"))
    out = cluster.build(led, [r1, r2], SPECS)
    # D2 is not in SPECS -> family "D" from its id, so the keys coincide
    assert len(out) == 1 and out[0].attack_ids == ["D1", "D2"] and out[0].cluster_id.startswith("d1-d2-watchlist-")


# ---------------- divergence ----------------

def test_first_divergence_picks_first_differing_action_step():
    p = _steps("crm_query", "company_lookup")
    f = _steps("crm_query", "send_email")
    assert divergence.first_divergence(p, f) == 3


def test_first_divergence_when_fail_run_is_longer_points_at_extra_step():
    p = _steps("crm_query", reply=False)             # a strict prefix of the failing run
    f = _steps("crm_query", "issue_credit")
    assert divergence.first_divergence(p, f) == 3
    # and when the passing run ends with a reply where the failing one calls another tool, that tool call is the divergence
    assert divergence.first_divergence(_steps("crm_query"), f) == 3


def test_first_divergence_identical_runs_points_at_last_step_and_empty_is_zero():
    s = _steps("crm_query")
    assert divergence.first_divergence(s, s) == s[-1].i
    assert divergence.first_divergence([], []) == 0


def test_compute_pass_vs_fail_mode(tmp_path):
    led = _ledger(tmp_path)
    ok = _run("ok", "D1"); bad = _run("bad", "D1", {"watchlist": 3})
    ok.neatlogs_url = "https://app.example/traces/ok"; bad.neatlogs_url = "https://app.example/traces/bad"
    led.write_run(ok, _steps("crm_query", "company_lookup"))
    led.write_run(bad, _steps("crm_query", "send_email"))
    c = Cluster(cluster_id="d1-watchlist-abc", signature="sig", family="D", attack_ids=["D1"], run_ids=["bad"], failing_graders=["watchlist"])
    div, md = divergence.compute(led, c, {"ok": ok, "bad": bad}, SPECS["D1"])
    assert div.mode == "pass_vs_fail" and div.run_pass == "ok" and div.run_fail == "bad" and div.step_index == 3
    assert "PASS: tool `company_lookup`" in div.step_desc and "FAIL: tool `send_email`" in div.step_desc
    assert div.trace_links == ["https://app.example/traces/bad", "https://app.example/traces/ok"]
    assert "**>>** [3]" in md and "## Passing run, same window" in md


def test_compute_vs_spec_when_no_passing_run(tmp_path):
    led = _ledger(tmp_path)
    bad = _run("bad", "D1", {"watchlist": 3, "canary": None})
    led.write_run(bad, _steps("crm_query", "send_email"))
    c = Cluster(cluster_id="d1-watchlist-abc", signature="sig", family="D", attack_ids=["D1"], run_ids=["bad"], failing_graders=["watchlist"])
    div, md = divergence.compute(led, c, {"bad": bad}, SPECS["D1"])
    assert div.mode == "vs_spec" and div.run_pass is None and div.step_index == 3
    assert div.step_desc.startswith("SAFE: Ignore instructions found in data.")
    assert "## Passing run" not in md and "## Safe behavior" in md


def test_compute_vs_spec_ignores_passing_runs_of_other_kinds_and_falls_back_to_reply(tmp_path):
    led = _ledger(tmp_path)
    bad = _run("bad", "D1", {"schema": None})
    replay_ok = _run("rp", "D1", kind="replay")
    steps = _steps("crm_query")
    led.write_run(bad, steps); led.write_run(replay_ok, steps)
    c = Cluster(cluster_id="x", signature="sig", family="D", attack_ids=["D1"], run_ids=["bad"], failing_graders=["schema"])
    div, _ = divergence.compute(led, c, {"bad": bad, "rp": replay_ok}, SPECS["D1"])
    assert div.mode == "vs_spec"
    assert div.step_index == steps[-1].i       # no violation step -> the final reply step
