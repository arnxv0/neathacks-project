"""Cache of real upstream responses + poisoned fixtures served by the chaos proxy."""
from __future__ import annotations
import hashlib, json, pathlib
from .. import config

CACHE = config.FIXTURES_DIR / "cache"
POISONED = config.FIXTURES_DIR / "poisoned"

def key(path: str, body: bytes) -> str:
    return hashlib.sha1(path.encode() + b"|" + body).hexdigest()[:16]

def cached(path: str, body: bytes) -> bytes | None:
    # domain-keyed enrich cache first (human-readable), then hash cache
    try:
        d = json.loads(body or b"{}").get("domains", [None])[0]
        p = CACHE / f"enrich_{d}.json"
        if d and p.exists():
            return p.read_bytes()
    except Exception:
        pass
    p = CACHE / f"{key(path, body)}.json"
    return p.read_bytes() if p.exists() else None

def store(path: str, body: bytes, response: bytes) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    try:
        d = json.loads(body or b"{}").get("domains", [None])[0]
        if d:
            (CACHE / f"enrich_{d}.json").write_bytes(response); return
    except Exception:
        pass
    (CACHE / f"{key(path, body)}.json").write_bytes(response)

def poisoned(name: str) -> bytes | None:
    p = POISONED / f"{name}.json"
    return p.read_bytes() if p.exists() else None
