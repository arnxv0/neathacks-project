"""Read the target's local step mirror and side-effect state."""
from __future__ import annotations
import httpx
from ..target.loader import ComponentSpec

def steps(comp: ComponentSpec, run_id: str) -> list[dict]:
    if not comp.runs_endpoint:
        return []
    try:
        return httpx.get(f"{comp.runs_endpoint}/{run_id}", timeout=10).json().get("steps", [])
    except Exception:
        return []

def state(comp: ComponentSpec, run_id: str) -> dict:
    if not comp.state_endpoint:
        return {}
    try:
        return httpx.get(f"{comp.state_endpoint}/{run_id}", timeout=10).json()
    except Exception:
        return {}
