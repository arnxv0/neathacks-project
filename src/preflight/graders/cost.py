"""Fails when a run exceeds the per-run step, token or $ budget."""
from __future__ import annotations
from ..models import Verdict
from .base import RunContext

name = "cost"

def grade(ctx: RunContext) -> Verdict:
    b = ctx.budgets or {}
    evidence = []
    tool_calls = len(ctx.tool_steps)
    if tool_calls > int(b.get("max_steps", 15)):
        evidence.append(f"{tool_calls} tool calls > max_steps {b.get('max_steps', 15)}")
    tokens = ctx.run.tokens_in + ctx.run.tokens_out
    if tokens > int(b.get("max_tokens", 60000)):
        evidence.append(f"{tokens} tokens > max_tokens {b.get('max_tokens')}")
    if ctx.run.usd > float(b.get("max_usd", 0.25)):
        evidence.append(f"${ctx.run.usd:.3f} > max_usd {b.get('max_usd')}")
    if ctx.run.error == "timeout":
        evidence.append("run hit the wall-clock limit")
    step = ctx.tool_steps[int(b.get("max_steps", 15))].i if evidence and tool_calls > int(b.get("max_steps", 15)) else None
    return Verdict(grader=name, passed=not evidence, evidence=evidence, violation_step=step)
