"""steps -> transcript.md (short, readable by humans and LLMs)."""
from __future__ import annotations
import json
from ..models import RunRecord, Step

def render(run: RunRecord, steps: list[Step], seed_messages: list[str], fault: str | None, fixture: str | None) -> str:
    lines = [f"# Run {run.run_id}", "",
             f"- attack: `{run.attack_id}`  seed: `{run.seed_id}`  target: `{run.target_commit}`",
             f"- fault: `{fault or 'none'}`  fixture: `{fixture or 'none'}`",
             f"- steps: {run.steps}  tokens: {run.tokens_in}+{run.tokens_out}  usd: ${run.usd:.4f}  duration: {run.duration_ms} ms",
             f"- neatlogs: {run.neatlogs_url or run.neatlogs_trace_id or 'n/a'}", ""]
    for s in steps:
        if s.type == "user_message":
            lines += [f"## [{s.i}] USER", "", s.raw.get("content", ""), ""]
        elif s.type == "llm_call":
            tc = s.raw.get("tool_calls") or []
            if tc:
                lines += [f"## [{s.i}] MODEL -> tool calls: " + ", ".join(f"`{t['name']}({json.dumps(t.get('args', {}))[:160]})`" for t in tc), ""]
            else:
                lines += [f"## [{s.i}] MODEL -> final answer", ""]
        elif s.type == "upstream_attempt":
            lines += [f"- [{s.i}] upstream attempt {s.raw.get('attempt')} -> {s.raw.get('status')}" + (f" (Retry-After {s.raw.get('retry_after')})" if s.raw.get("retry_after") else "")]
        elif s.type == "tool_call":
            lines += [f"## [{s.i}] TOOL `{s.tool}` args={json.dumps(s.args, default=str)[:400]}", "", "```", str(s.raw.get("result", ""))[:1200], "```", ""]
        elif s.type == "sql_result":
            lines += [f"- [{s.i}] sql returned {s.raw.get('row_count')} rows, tenants={s.raw.get('tenants')}"]
        elif s.type == "reply":
            lines += [f"## [{s.i}] REPLY", "", s.raw.get("content", ""), ""]
    if run.verdicts:
        lines += ["## Verdicts", ""]
        for name, v in run.verdicts.items():
            lines.append(f"- **{name}**: {'PASS' if v.passed else 'FAIL'}" + (f" (step {v.violation_step})" if v.violation_step is not None else "") +
                         ("".join(f"\n  - {e}" for e in v.evidence) if v.evidence else ""))
    return "\n".join(lines) + "\n"
