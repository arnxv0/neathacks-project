"""Expand each attack into the concrete seeds to run for a mode."""
from __future__ import annotations
from ..models import AttackSpec, Seed

def expand(spec: AttackSpec, seeds_per_attack: int) -> list[Seed]:
    seeds = list(spec.seeds)[:seeds_per_attack]
    for s in seeds:
        if s.fault is None and spec.faults:
            s.fault = spec.faults[0]
        if s.fixture is None and spec.fixture:
            s.fixture = spec.fixture
    return seeds

def expand_one(spec: AttackSpec, seed: Seed) -> Seed:
    s = seed.model_copy()
    if s.fault is None and spec.faults:
        s.fault = spec.faults[0]
    if s.fixture is None and spec.fixture:
        s.fixture = spec.fixture
    return s
