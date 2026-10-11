"""Retry helper for upstream calls: bounded attempts, increasing backoff, honors Retry-After."""
from __future__ import annotations
import time
import httpx
from . import mirror

ATTEMPTS = 3          # hard cap, including the first try
BASE_DELAY = 0.5      # seconds; doubles on each retry
MAX_DELAY = 10.0      # ceiling for both computed backoff and Retry-After


def _retry_delay(attempt: int, retry_after: str | None) -> float:
    """Delay before the next attempt: exponential backoff, overridden by a valid Retry-After (seconds)."""
    delay = BASE_DELAY * (2 ** (attempt - 1))
    if retry_after:
        try:
            delay = max(delay, float(retry_after))
        except ValueError:
            pass  # HTTP-date form or garbage: fall back to computed backoff
    return min(delay, MAX_DELAY)


def post_with_retry(url: str, *, json: dict, headers: dict, timeout: float = 8.0) -> httpx.Response:
    last: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        retry_after: str | None = None
        try:
            resp = httpx.post(url, json=json, headers=headers, timeout=timeout)
            retry_after = resp.headers.get("Retry-After")
            mirror.record("upstream_attempt", url=url, attempt=attempt, status=resp.status_code, retry_after=retry_after)
            if resp.status_code >= 500 or resp.status_code == 429:
                last = httpx.HTTPStatusError(f"{resp.status_code}", request=resp.request, response=resp)
            else:
                return resp
        except httpx.TimeoutException as e:
            mirror.record("upstream_attempt", url=url, attempt=attempt, status="timeout")
            last = e
        if attempt < ATTEMPTS:
            time.sleep(_retry_delay(attempt, retry_after))
    raise last if last else RuntimeError("upstream failed")
