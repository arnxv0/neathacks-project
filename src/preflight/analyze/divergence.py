"""First divergence between a passing and a failing run of the same attack, or vs the safe-behavior spec."""
from __future__ import annotations
from ..ledger import Ledger
from ..models import AttackSpec, Cluster, Divergence, RunRecord, Step
from ..traces import neatlogs_client

def _key(s: Step) -> tuple:
    return (s.type, s.tool, s.result_kind)

def _desc(s: Step | None) -> str:
    if s is None:
        return "(run ended)"
    if s.type == "tool_call":
        return f"tool `{s.tool}` args={s.args} -> {s.result_kind}"
    if s.type == "llm_call":
        return f"model -> {'tool calls: ' + (s.tool or '') if s.result_kind == 'tool_calls' else 'final answer'}"
    return f"{s.type}" + (f": {s.result_excerpt[:120]}" if s.result_excerpt else "")

def first_divergence(pass_steps: list[Step], fail_steps: list[Step]) -> int:
    # compare only decision/action steps
    p = [s for s in pass_steps if s.type in ("llm_call", "tool_call", "reply")]
    f = [s for s in fail_steps if s.type in ("llm_call", "tool_call", "reply")]
    for a, b in zip(p, f):
        if _key(a) != _key(b):
            return b.i
    if len(f) > len(p):
        return f[len(p)].i
    return f[-1].i if f else 0

def compute(ledger: Ledger, cluster: Cluster, runs_by_id: dict[str, RunRecord], spec: AttackSpec) -> tuple[Divergence, str]:
    fail_id = cluster.run_ids[0]
    fail_run = runs_by_id[fail_id]
    fail_steps = ledger.read_steps(fail_id)
    passing = [r for r in runs_by_id.values() if r.attack_id == fail_run.attack_id and not r.failed and r.kind == "attack"]
    links = [l for l in (fail_run.neatlogs_url,) if l]
    if passing:
        p = passing[0]
        p_steps = ledger.read_steps(p.run_id)
        idx = first_divergence(p_steps, fail_steps)
        s_fail = next((s for s in fail_steps if s.i == idx), None)
        fail_actions = [s for s in fail_steps if s.type in ("llm_call", "tool_call", "reply")]
        pass_actions = [s for s in p_steps if s.type in ("llm_call", "tool_call", "reply")]
        pos = next((n for n, s in enumerate(fail_actions) if s.i == idx), None)
        s_pass = pass_actions[pos] if pos is not None and pos < len(pass_actions) else None
        if p.neatlogs_url:
            links.append(p.neatlogs_url)
        div = Divergence(run_pass=p.run_id, run_fail=fail_id, step_index=idx, mode="pass_vs_fail",
                         step_desc=f"PASS: {_desc(s_pass)}  |  FAIL: {_desc(s_fail)}", trace_links=links)
        md = _render(cluster, spec, div, fail_steps, p_steps, idx)
    else:
        viol = min([v.violation_step for v in fail_run.verdicts.values() if not v.passed and v.violation_step is not None], default=None)
        if viol is None:
            viol = next((s.i for s in reversed(fail_steps) if s.type == "reply"), 0)
        s_fail = next((s for s in fail_steps if s.i == viol), None)
        div = Divergence(run_fail=fail_id, step_index=viol, mode="vs_spec",
                         step_desc=f"SAFE: {spec.safe_behavior.strip()[:160]}  |  FAIL: {_desc(s_fail)}", trace_links=links)
        md = _render(cluster, spec, div, fail_steps, None, viol)
    return div, md

def _render(cluster: Cluster, spec: AttackSpec, div: Divergence, fail_steps: list[Step], pass_steps: list[Step] | None, idx: int) -> str:
    lines = [f"# Divergence for cluster `{cluster.cluster_id}`", "",
             f"- attack: **{spec.id} {spec.name}**  graders failing: {', '.join(cluster.failing_graders)}",
             f"- mode: {div.mode}  divergent step: **{idx}**",
             f"- failing run: `{div.run_fail}`" + (f"  passing run: `{div.run_pass}`" if div.run_pass else ""), ""]
    if div.trace_links:
        lines += ["neatlogs: " + "  ".join(f"[{'fail' if i == 0 else 'pass'}]({l})" for i, l in enumerate(div.trace_links)), ""]
    lines += ["## Safe behavior", "", spec.safe_behavior.strip(), ""]
    lines += ["## Failing run around the divergent step", ""]
    for s in fail_steps:
        if s.type in ("llm_call", "tool_call", "reply", "user_message") and idx - 4 <= s.i <= idx + 3:
            mark = "**>>**" if s.i == idx else "  "
            lines.append(f"{mark} [{s.i}] {_desc(s)[:300]}")
    if pass_steps:
        lines += ["", "## Passing run, same window", ""]
        for s in pass_steps:
            if s.type in ("llm_call", "tool_call", "reply", "user_message") and s.i <= idx + 3:
                lines.append(f"   [{s.i}] {_desc(s)[:300]}")
    return "\n".join(lines) + "\n"
