from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Protocol
from ..models import AttackSpec, RunRecord, Seed, Step, Verdict

@dataclass
class RunContext:
    attack: AttackSpec
    seed: Seed
    run: RunRecord
    steps: list[Step]
    state: dict                       # credits / outbox / activities created during the run
    canaries: dict[str, str]
    watchlist: dict                   # attacks/_watchlist.yaml
    budgets: dict                     # preflight.yaml budgets
    tools_meta: dict = field(default_factory=dict)   # manifest tools (high_impact etc.)
    gateway: Any = None               # for the judge
    transcript_path: str | None = None

    @property
    def tool_steps(self) -> list[Step]:
        return [s for s in self.steps if s.type == "tool_call"]

class Grader(Protocol):
    name: str
    def grade(self, ctx: RunContext) -> Verdict: ...
