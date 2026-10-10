"""Schemas (ARCHITECTURE §8)."""
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field

class Seed(BaseModel):
    id: str
    persona: str = "rep"                 # user_role
    tenant_id: str = "tenant_a"
    messages: list[str]                  # scripted user turns; persona attacker fills in beyond these if multi_turn
    fault: str | None = None             # chaos fault for this seed (overrides attack.faults)
    fixture: str | None = None           # poisoned fixture name
    expect: dict[str, Any] = Field(default_factory=dict)   # grader-specific expectations (e.g. forbidden tools)
    generated: bool = False

class AttackSpec(BaseModel):
    id: str
    family: str
    name: str
    owasp: str | None = None
    tier: Literal["P0", "P1", "P2"] = "P0"
    vector: str = "user"
    description: str
    safe_behavior: str
    multi_turn: bool = False
    max_turns: int = 1
    faults: list[str] = Field(default_factory=list)
    fixture: str | None = None
    graders: list[str]
    rubric: str | None = None
    seeds: list[Seed] = Field(default_factory=list)

class Step(BaseModel):
    i: int
    component: str = "copilot"
    type: str                            # user_message | llm_call | tool_call | upstream_attempt | sql_result | reply
    tool: str | None = None
    args: dict[str, Any] | None = None
    args_digest: str | None = None
    result_kind: str | None = None       # ok | error | empty | timeout | 429 | 5xx | text
    result_excerpt: str | None = None
    tokens: int = 0
    usd: float = 0.0
    duration_ms: int | None = None
    raw: dict[str, Any] = Field(default_factory=dict)

class Verdict(BaseModel):
    grader: str
    passed: bool
    evidence: list[str] = Field(default_factory=list)
    violation_step: int | None = None

class RunRecord(BaseModel):
    run_id: str
    assessment_id: str
    attack_id: str
    seed_id: str
    target_commit: str = ""
    mode: str = "dev"
    neatlogs_trace_id: str | None = None
    neatlogs_url: str | None = None
    started_at: str
    duration_ms: int = 0
    steps: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    usd: float = 0.0
    reply: str = ""
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    verdicts: dict[str, Verdict] = Field(default_factory=dict)
    failed: bool = False
    error: str | None = None
    kind: Literal["attack", "replay", "regression"] = "attack"

class Divergence(BaseModel):
    run_pass: str | None = None
    run_fail: str
    step_index: int
    step_desc: str
    trace_links: list[str] = Field(default_factory=list)
    mode: Literal["pass_vs_fail", "vs_spec"] = "vs_spec"

class Cluster(BaseModel):
    cluster_id: str
    signature: str
    family: str
    attack_ids: list[str]
    run_ids: list[str]
    failing_graders: list[str]
    divergence: Divergence | None = None
    hypothesis: str = ""
    suspected_paths: list[str] = Field(default_factory=list)
    component: str = "copilot"
    status: str = "open"                 # open | fixing | replaying | await_approval | merged | needs_human | rejected

class Replay(BaseModel):
    before: str = ""                     # "1/5"
    after: str = ""                      # "5/5"
    passed: int = 0
    total: int = 0
    run_ids: list[str] = Field(default_factory=list)

class FixAttempt(BaseModel):
    cluster_id: str
    n: int
    author: Literal["fixer", "human"] = "fixer"
    review_comment: str | None = None
    component: str = "copilot"
    backend: str = "claude"
    branch: str
    commit: str | None = None
    diff_path: str | None = None
    entire_checkpoint_id: str | None = None
    checkpoint_summary: str | None = None
    replay: Replay | None = None
    tests_green: bool | None = None
    cost_usd: float = 0.0
    status: str = "running"              # running | replaying | passed | failed | approved | rejected
    fixer_session_id: str | None = None
    log_path: str | None = None
    summary: str = ""

class Finding(BaseModel):
    signature: str
    cluster_id: str
    first_seen: str
    fixed_by_commit: str | None = None
    fixed_in_assessment: str | None = None
    last_seen: str
