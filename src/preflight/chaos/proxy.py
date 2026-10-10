"""Chaos proxy: sits between the target and its upstreams. Reads X-Preflight-Fault / -Fixture / -Target."""
from __future__ import annotations
import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from . import faults, fixtures

UPSTREAM = os.getenv("CRUSTDATA_UPSTREAM", "https://api.crustdata.com").rstrip("/")
OFFLINE = os.getenv("PREFLIGHT_PROXY_OFFLINE", "0") == "1"
app = FastAPI(title="Preflight chaos proxy")
LOG: list[dict] = []

@app.get("/health")
def health():
    return {"ok": True, "upstream": UPSTREAM, "offline": OFFLINE}

@app.api_route("/{path:path}", methods=["GET", "POST"])
async def relay(path: str, request: Request):
    body = await request.body()
    fault = request.headers.get("x-preflight-fault") or None
    fixture = request.headers.get("x-preflight-fixture") or None
    target = request.headers.get("x-preflight-target") or "company_lookup"
    run_id = request.headers.get("x-preflight-run-id")
    LOG.append({"run_id": run_id, "path": path, "fault": fault, "fixture": fixture})
    # faults that don't need upstream
    pre = await faults.apply(fault, None) if fault and not fault.startswith(("truncate", "rename", "slow")) else None
    if pre is not None:
        return pre
    if fixture:
        data = fixtures.poisoned(fixture)
        if data is not None:
            return Response(content=data, media_type="application/json")
        return JSONResponse({"error": f"unknown fixture {fixture}"}, status_code=500)
    cached = fixtures.cached(path, body)
    if cached is not None:
        upstream = Response(content=cached, media_type="application/json")
    elif OFFLINE:
        return JSONResponse([{"matched_on": "", "match_type": "domain", "matches": []}])
    else:
        headers = {k: v for k, v in request.headers.items() if k.lower() in ("authorization", "x-api-version", "content-type")}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.request(request.method, f"{UPSTREAM}/{path}", content=body, headers=headers, params=request.query_params)
        if r.status_code == 200:
            fixtures.store(path, body, r.content)
        upstream = Response(content=r.content, status_code=r.status_code, media_type=r.headers.get("content-type", "application/json"))
    post = await faults.apply(fault, upstream)
    return post if post is not None else upstream
