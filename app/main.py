"""AcmeSales Copilot HTTP surface + the Preflight target contract (ARCHITECTURE §3.2)."""
from __future__ import annotations
import uuid
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from . import tracing  # noqa: F401  must come first
import neatlogs
from . import agent, config, mirror
from .context import RequestContext, set_context
from .db import connect, rows
from .tools import SCHEMAS

SESSIONS: dict[str, list[dict]] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not config.DB_PATH.exists():
        from .seed_db import seed
        seed()
    yield
    neatlogs.flush(); neatlogs.shutdown()

app = FastAPI(title="AcmeSales Copilot", version="0.1.0", lifespan=lifespan)

class ChatIn(BaseModel):
    session_id: str
    tenant_id: str = "tenant_a"
    user_role: str = "rep"
    message: str = ""   # missing/empty content gets a graceful "what do you need?" reply, not a 4xx/5xx

class Usage(BaseModel):
    input_tokens: int
    output_tokens: int
    usd: float

class ChatOut(BaseModel):
    reply: str
    tool_calls: list[dict[str, Any]]
    usage: Usage
    steps: int
    neatlogs_trace_id: str | None
    neatlogs_session_id: str

def _turn(body: ChatIn, headers: dict[str, str]) -> ChatOut:
    run_id = headers.get("x-preflight-run-id") or f"local-{uuid.uuid4().hex[:8]}"
    attack = headers.get("x-preflight-attack-id", "none")
    set_context(RequestContext(session_id=body.session_id, tenant_id=body.tenant_id, user_role=body.user_role,
                               run_id=run_id, headers={k: v for k, v in headers.items() if k.startswith("x-preflight-")}))
    history = SESSIONS.setdefault(body.session_id, [])
    trace_id = None
    with neatlogs.extract_trace_context(headers):
        with neatlogs.identify(session_id=run_id, end_user_id=f"{body.tenant_id}:{body.user_role}",
                               end_user_metadata={"tenant_id": body.tenant_id, "user_role": body.user_role}):
            with neatlogs.trace(f"chat {attack}", kind="AGENT", session_id=run_id,
                                run_id=run_id, attack_id=attack, seed=headers.get("x-preflight-seed", ""),
                                fault=headers.get("x-preflight-fault", ""), fixture=headers.get("x-preflight-fixture", ""),
                                target_version=config.version(), tenant_id=body.tenant_id) as span:
                trace_id = tracing.current_trace_id(span)
                try:
                    res = agent.run_turn(history, body.message)
                except Exception as e:
                    # Last-resort backstop: a turn must never surface as a 5xx or a stack trace to the caller.
                    mirror.record("turn_error", error=type(e).__name__)
                    res = agent.TurnResult(reply=agent.UNPROCESSABLE_MESSAGE_REPLY)
                    mirror.record("reply", content=res.reply, steps=0, usd=0.0, input_tokens=0, output_tokens=0)
    neatlogs.flush()
    return ChatOut(reply=res.reply, tool_calls=res.tool_calls, steps=res.steps,
                   usage=Usage(input_tokens=res.input_tokens, output_tokens=res.output_tokens, usd=round(res.usd, 6)),
                   neatlogs_trace_id=trace_id, neatlogs_session_id=run_id)

@app.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, request: Request):
    headers = {k.lower(): v for k, v in request.headers.items()}
    return await run_in_threadpool(_turn, body, headers)

@app.get("/health")
def health():
    return {"ok": True, "version": config.version(), "provider": config.PROVIDER, "model": config.MODEL,
            "upstreams": {"company_lookup": config.CRUSTDATA_BASE_URL}}

@app.get("/preflight/tools")
def tools():
    return [{"name": s["function"]["name"], "description": s["function"]["description"], "schema": s["function"]["parameters"]} for s in SCHEMAS]

@app.get("/preflight-verify")
def verify():
    return {"ownership_token": config.OWNERSHIP_TOKEN, "system": "acmesales", "component": "copilot"}

@app.get("/preflight/runs/{run_id}")
def run_steps(run_id: str):
    return {"run_id": run_id, "steps": mirror.read(run_id)}

@app.get("/preflight/state/{run_id}")
def run_state(run_id: str):
    """Side effects created during a run (for the `state` grader)."""
    conn = connect()
    out = {
        "credits": rows(conn.execute("SELECT * FROM credits WHERE run_id=?", (run_id,))),
        "outbox": rows(conn.execute("SELECT * FROM outbox WHERE run_id=?", (run_id,))),
        "activities": rows(conn.execute("SELECT * FROM activities WHERE run_id=?", (run_id,))),
    }
    conn.close()
    return out

@app.post("/preflight/reset")
def reset(x_preflight_ownership: str | None = Header(default=None)):
    if x_preflight_ownership != config.OWNERSHIP_TOKEN:
        raise HTTPException(403, "ownership token required")
    from .seed_db import reset_run_state
    reset_run_state(); SESSIONS.clear()
    return {"ok": True}
