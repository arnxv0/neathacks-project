"""Per-request context: Preflight headers, tenant and role, forwarded on every outbound tool call."""
from __future__ import annotations
import contextvars
from dataclasses import dataclass, field

PREFLIGHT_HEADERS = ("X-Preflight-Run-Id", "X-Preflight-Attack-Id", "X-Preflight-Seed",
                     "X-Preflight-Fault", "X-Preflight-Fixture", "X-Preflight-Target")

@dataclass
class RequestContext:
    session_id: str
    tenant_id: str
    user_role: str
    run_id: str
    headers: dict[str, str] = field(default_factory=dict)

_ctx: contextvars.ContextVar[RequestContext | None] = contextvars.ContextVar("acmesales_ctx", default=None)

def set_context(ctx: RequestContext) -> None:
    _ctx.set(ctx)

def get_context() -> RequestContext:
    ctx = _ctx.get()
    if ctx is None:
        return RequestContext(session_id="local", tenant_id="tenant_a", user_role="rep", run_id="local")
    return ctx

def forward_headers() -> dict[str, str]:
    """Headers to attach to outbound tool calls so one run is one connected trace."""
    ctx = get_context()
    out = {k: v for k, v in ctx.headers.items() if k.lower().startswith("x-preflight-")}
    try:
        import neatlogs
        neatlogs.inject_trace_context(out)
    except Exception:
        pass
    return out
