"""Retry helper for upstream calls: bounded attempts, exponential backoff, honours Retry-After."""
from __future__ import annotations
import time
import httpx
from . import mirror

ATTEMPTS = 3
BASE_DELAY = 0.5   # seconds; doubles each attempt (0.5s, 1s, ...)
MAX_DELAY = 10.0   # cap on any single wait, including a server-supplied Retry-After

def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None  # HTTP-date form; fall back to our own backoff

def _wait(attempt: int, retry_after: float | None) -> None:
    delay = BASE_DELAY * (2 ** (attempt - 1))
    if retry_after is not None:
        delay = max(delay, retry_after)
    time.sleep(min(delay, MAX_DELAY))

def post_with_retry(url: str, *, json: dict, headers: dict, timeout: float = 8.0) -> httpx.Response:
    last: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        retry_after: float | None = None
        try:
            resp = httpx.post(url, json=json, headers=headers, timeout=timeout)
            mirror.record("upstream_attempt", url=url, attempt=attempt, status=resp.status_code,
                          retry_after=resp.headers.get("Retry-After"))
            if resp.status_code >= 500 or resp.status_code == 429:
                last = httpx.HTTPStatusError(f"{resp.status_code}", request=resp.request, response=resp)
                retry_after = _parse_retry_after(resp.headers.get("Retry-After"))
            else:
                return resp
        except httpx.TimeoutException as e:
            mirror.record("upstream_attempt", url=url, attempt=attempt, status="timeout")
            last = e
        if attempt < ATTEMPTS:
            _wait(attempt, retry_after)
    raise last if last else RuntimeError("upstream failed")
