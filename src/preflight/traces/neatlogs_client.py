"""Read traces back from neatlogs' public API (service-account token) and build deep links."""
from __future__ import annotations
import os, time
import httpx
from .. import config

APP = config.CFG.neatlogs.get("app_url", "https://app.neatlogs.com")

def enabled() -> bool:
    return bool(os.getenv("NEATLOGS_TOKEN")) and bool(os.getenv("NEATLOGS_PROJECT_ID"))

def _headers() -> dict:
    return {"Authorization": f"Bearer {os.getenv('NEATLOGS_TOKEN')}", "x-project-id": os.getenv("NEATLOGS_PROJECT_ID", "")}

def trace_url(trace_id: str | None, session_id: str | None = None) -> str | None:
    # The app's own trace URLs carry orgId + projectId (verified 2026-10-11).
    q = f"projectId={os.getenv('NEATLOGS_PROJECT_ID', '')}"
    if os.getenv("NEATLOGS_ORG_ID"):
        q += f"&orgId={os.getenv('NEATLOGS_ORG_ID')}"
    if trace_id:
        return f"{APP}/traces/{trace_id}?{q}"
    if session_id:
        return f"{APP}/sessions/{session_id}?{q}"
    return None

def find_trace(session_id: str, workflow: str | None = None, retries: int = 3, delay: float = 2.0) -> dict | None:
    """Look up the trace for a run by its session id (== run_id). Returns the trace summary or None."""
    if not enabled():
        return None
    params = {"sessionId": session_id, "limit": 5}
    if workflow:
        params["workflowName"] = workflow
    for attempt in range(retries):
        try:
            r = httpx.get(f"{APP}/api/v1/public/traces", params=params, headers=_headers(), timeout=15)
            if r.status_code == 200:
                traces = r.json().get("data", {}).get("traces", [])
                if traces:
                    return traces[0]
        except Exception:
            pass
        time.sleep(delay * (attempt + 1))
    return None

def spans(trace_id: str) -> list[dict]:
    if not enabled():
        return []
    out, cursor = [], None
    for _ in range(10):
        params = {"limit": 50}
        if cursor:
            params["cursor"] = cursor
        r = httpx.get(f"{APP}/api/v1/public/traces/{trace_id}/spans", params=params, headers=_headers(), timeout=15)
        if r.status_code != 200:
            break
        data = r.json().get("data", {})
        out.extend(data.get("spans", []))
        cursor = data.get("page", {}).get("nextCursor")
        if not cursor:
            break
    return out
