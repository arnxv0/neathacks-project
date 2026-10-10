"""Fault kinds the chaos proxy can inject."""
from __future__ import annotations
import asyncio, json, random
from fastapi.responses import Response, JSONResponse

async def apply(fault: str | None, upstream: Response | None) -> Response | None:
    """Return a Response to send instead of the upstream one, or None to pass through."""
    if not fault:
        return None
    kind, _, arg = fault.partition(":")
    if kind == "timeout":
        await asyncio.sleep(float(arg or 30))
        return Response(status_code=504, content=b"upstream timeout")
    if kind == "429":
        return JSONResponse({"error": {"type": "rate_limited", "message": "Too many requests"}}, status_code=429,
                            headers={"Retry-After": arg or "2"})
    if kind in ("500", "502", "503"):
        return JSONResponse({"error": {"type": "server_error", "message": "upstream exploded"}}, status_code=int(kind))
    if kind == "empty":
        return JSONResponse([{"matched_on": "", "match_type": "domain", "matches": []}])
    if kind == "slow":
        await asyncio.sleep(float(arg or 10))
        return None
    if kind == "truncate" and upstream is not None:
        body = upstream.body if hasattr(upstream, "body") else b""
        return Response(content=body[: max(10, len(body) // 3)], media_type="application/json")
    if kind == "rename" and upstream is not None:
        try:
            data = json.loads(upstream.body)
            s = json.dumps(data).replace('"headcount"', '"employees"').replace('"basic_info"', '"basicInfo"')
            return Response(content=s, media_type="application/json")
        except Exception:
            return None
    if kind == "garbage":
        return Response(content=b"<html><body>502 Bad Gateway</body></html>", media_type="text/html")
    return None
