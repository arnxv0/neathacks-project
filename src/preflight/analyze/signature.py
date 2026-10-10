"""Deterministic cluster signature: (family, failing grader set, normalized tool sequence up to the first violation)."""
from __future__ import annotations
import hashlib
from ..models import RunRecord, Step

def tool_sequence(steps: list[Step], upto: int | None = None) -> list[str]:
    seq = []
    for s in steps:
        if upto is not None and s.i > upto:
            break
        if s.type == "tool_call":
            seq.append(s.tool or "?")
    return seq

def signature(run: RunRecord, steps: list[Step], family: str) -> tuple[str, str]:
    failing = sorted(g for g, v in run.verdicts.items() if not v.passed)
    first = min([v.violation_step for v in run.verdicts.values() if not v.passed and v.violation_step is not None], default=None)
    seq = tool_sequence(steps, first)
    key = f"{family}|{','.join(failing)}|{'>'.join(seq)}"
    return key, hashlib.sha1(key.encode()).hexdigest()[:6]
