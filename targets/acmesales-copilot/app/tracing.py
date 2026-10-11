"""neatlogs tracing. Import this module before anything that imports `openai`."""
from __future__ import annotations
import os
import neatlogs
from . import config

_inited = False

def init() -> None:
    global _inited
    if _inited:
        return
    neatlogs.init(
        api_key=os.getenv("NEATLOGS_API_KEY"),
        workflow_name="acmesales-copilot",
        tags=["target", f"provider:{config.PROVIDER}", f"model:{config.MODEL}"],
    )
    _inited = True

def current_trace_id(span) -> str | None:
    """Best-effort hex trace id from a neatlogs/OTel span object."""
    try:
        ctx = span.get_span_context()
        return format(ctx.trace_id, "032x")
    except Exception:
        pass
    for attr in ("trace_id", "traceId"):
        v = getattr(span, attr, None)
        if v:
            return str(v)
    return None

init()
