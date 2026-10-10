"""Local JSONL mirror of every step in a run. Preflight reads it via GET /preflight/runs/{run_id}."""
from __future__ import annotations
import json, time
from typing import Any
from . import config
from .context import get_context

def record(step_type: str, **payload: Any) -> None:
    ctx = get_context()
    config.MIRROR_DIR.mkdir(parents=True, exist_ok=True)
    row = {"ts": time.time(), "run_id": ctx.run_id, "session_id": ctx.session_id, "tenant_id": ctx.tenant_id,
           "component": "copilot", "type": step_type, **payload}
    with (config.MIRROR_DIR / f"{ctx.run_id}.jsonl").open("a") as f:
        f.write(json.dumps(row, default=str) + "\n")

def read(run_id: str) -> list[dict]:
    p = config.MIRROR_DIR / f"{run_id}.jsonl"
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]
