from __future__ import annotations
import pathlib
from dataclasses import dataclass, field
from typing import Protocol

@dataclass
class FixHandle:
    cluster_id: str
    branch: str
    worktree: pathlib.Path
    log_path: pathlib.Path
    session_id: str | None = None
    extra: dict = field(default_factory=dict)

@dataclass
class FixResult:
    ok: bool
    commit: str | None = None
    diff: str = ""
    summary: str = ""
    cost_usd: float = 0.0
    session_id: str | None = None
    error: str | None = None
    changed_files: list[str] = field(default_factory=list)

class Fixer(Protocol):
    name: str
    def start(self, brief_path: pathlib.Path, target_repo: pathlib.Path, branch: str, worktree: pathlib.Path, log_path: pathlib.Path,
              base_ref: str = "main") -> FixHandle: ...
    def wait(self, h: FixHandle, timeout_s: int = 900) -> FixResult: ...
    def send(self, h: FixHandle, message_path: pathlib.Path, timeout_s: int = 900) -> FixResult: ...
