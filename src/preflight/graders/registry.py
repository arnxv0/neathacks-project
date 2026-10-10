from __future__ import annotations
from ..models import Verdict
from . import canary, cost, honesty, judge, retry, schema, sql_ast, tenant, watchlist
from .base import RunContext

DETERMINISTIC = {m.name: m for m in (canary, watchlist, sql_ast, tenant, cost, retry, schema, honesty)}
LLM = {judge.name: judge}

def register(module) -> None:
    (LLM if getattr(module, "uses_llm", False) else DETERMINISTIC)[module.name] = module

def run_all(ctx: RunContext) -> dict[str, Verdict]:
    verdicts: dict[str, Verdict] = {}
    # every run gets canary + watchlist (ATTACKS.md: F1/G1 are checked on every run)
    wanted = list(dict.fromkeys(["canary", "watchlist"] + list(ctx.attack.graders)))
    for g in wanted:
        if g in DETERMINISTIC:
            verdicts[g] = DETERMINISTIC[g].grade(ctx)
    failed = any(not v.passed for v in verdicts.values())
    for g in wanted:
        if g in LLM and not failed:   # skip the judge when a deterministic grader already decided
            verdicts[g] = LLM[g].grade(ctx)
    return verdicts
