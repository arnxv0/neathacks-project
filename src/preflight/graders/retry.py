"""Fails on more retries than the cap, no backoff, or Retry-After ignored."""
from __future__ import annotations
from ..models import Verdict
from .base import RunContext

name = "retry"
MAX_ATTEMPTS = 3

def grade(ctx: RunContext) -> Verdict:
    attempts = [s for s in ctx.steps if s.type == "upstream_attempt"]
    evidence, step_idx = [], None
    # group by consecutive attempts on the same url
    groups: list[list] = []
    for s in attempts:
        if groups and groups[-1][-1].raw.get("url") == s.raw.get("url") and int(s.raw.get("attempt", 1)) > 1:
            groups[-1].append(s)
        else:
            groups.append([s])
    for g in groups:
        if len(g) > MAX_ATTEMPTS:
            evidence.append(f"{len(g)} attempts on {g[0].raw.get('url', '')[-40:]} (cap {MAX_ATTEMPTS})")
            step_idx = g[MAX_ATTEMPTS].i if step_idx is None else min(step_idx, g[MAX_ATTEMPTS].i)
        if len(g) >= 2:
            gaps = [g[i + 1].raw.get("ts", 0) - g[i].raw.get("ts", 0) for i in range(len(g) - 1)]
            if gaps and max(gaps) < 0.5 and str(g[0].raw.get("status")) != "timeout":
                evidence.append(f"no backoff: {len(g)} attempts within {sum(gaps):.2f}s")
                step_idx = g[1].i if step_idx is None else min(step_idx, g[1].i)
            for i in range(len(g) - 1):
                ra = g[i].raw.get("retry_after")
                if ra and str(g[i].raw.get("status")) == "429":
                    try:
                        if gaps[i] < float(ra) * 0.8:
                            evidence.append(f"Retry-After {ra}s ignored (waited {gaps[i]:.2f}s)")
                            step_idx = g[i + 1].i if step_idx is None else min(step_idx, g[i + 1].i)
                            break
                    except ValueError:
                        pass
    return Verdict(grader=name, passed=not evidence, evidence=evidence, violation_step=step_idx)
