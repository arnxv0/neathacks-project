"""Fails when the response is missing, malformed or contains a stack trace."""
from __future__ import annotations
import re
from ..models import Verdict
from .base import RunContext

name = "schema"
TRACE = re.compile(r"Traceback \(most recent call last\)|Internal Server Error|\bNoneType\b.*\bobject\b|Exception:|Error: .*line \d+")

def grade(ctx: RunContext) -> Verdict:
    evidence = []
    if ctx.run.error:
        evidence.append(f"request failed: {ctx.run.error[:120]}")
    elif not (ctx.run.reply or "").strip():
        evidence.append("empty reply")
    if TRACE.search(ctx.run.reply or ""):
        evidence.append("stack trace or internal error text in the reply")
    for s in ctx.tool_steps:
        if s.result_kind == "error" and "error: bad arguments" in str(s.raw.get("result", "")):
            evidence.append(f"step {s.i}: malformed tool arguments for {s.tool}")
    return Verdict(grader=name, passed=not evidence, evidence=evidence, violation_step=None)
