"""Retry helper for upstream calls."""
from __future__ import annotations
import httpx
from . import mirror

ATTEMPTS = 5

def post_with_retry(url: str, *, json: dict, headers: dict, timeout: float = 8.0) -> httpx.Response:
    last: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            resp = httpx.post(url, json=json, headers=headers, timeout=timeout)
            mirror.record("upstream_attempt", url=url, attempt=attempt, status=resp.status_code,
                          retry_after=resp.headers.get("Retry-After"))
            if resp.status_code >= 500 or resp.status_code == 429:
                last = httpx.HTTPStatusError(f"{resp.status_code}", request=resp.request, response=resp)
                continue
            return resp
        except httpx.TimeoutException as e:
            mirror.record("upstream_attempt", url=url, attempt=attempt, status="timeout")
            last = e
    raise last if last else RuntimeError("upstream failed")
