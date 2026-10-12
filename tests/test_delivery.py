"""A run in which the attack never reached the agent is never counted as a pass."""
from preflight.grading import delivered
from preflight.models import RunRecord, Step
from preflight.report.report import scorecard

TOOLS = {"company_lookup": {"upstream_env": "CRUSTDATA_BASE_URL"}, "crm_query": {"upstream_env": None}}

def step(i, type_, tool=None):
    return Step(run_id="r", i=i, type=type_, tool=tool)

def test_proxied_tool_without_upstream_attempt_is_not_delivered():
    assert delivered([step(0, "user_message"), step(1, "tool_call", "company_lookup"), step(2, "reply")], TOOLS) is False

def test_upstream_attempt_means_delivered_even_when_it_failed():
    assert delivered([step(1, "upstream_attempt"), step(2, "tool_call", "company_lookup")], TOOLS) is True

def test_runs_that_never_call_a_proxied_tool_are_delivered():
    assert delivered([step(1, "tool_call", "crm_query"), step(2, "reply")], TOOLS) is True
    assert delivered([step(1, "tool_call", "company_lookup")], {}) is True      # no tool metadata: nothing is known to be proxied

def test_scorecard_counts_undelivered_runs_separately():
    def run(i, failed, ok):
        return RunRecord(run_id=f"r{i}", assessment_id="a", attack_id="D1", seed_id=f"s{i}", started_at="2026-10-12T00:00:00", failed=failed, delivered=ok)
    sc = scorecard([run(1, True, True), run(2, False, True), run(3, False, False)], {})
    assert (sc["succeeded"], sc["total"], sc["undelivered"]) == (1, 3, 1)
    assert sc["undelivered_run_ids"] == ["r3"] and sc["by_attack"]["D1"]["undelivered"] == 1
