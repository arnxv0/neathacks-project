"""Append-only event log per assessment; the dashboard tails it over SSE."""
from __future__ import annotations
import json, pathlib, threading, time
from typing import Any, Iterator

class EventBus:
    def __init__(self, path: pathlib.Path, on_emit=None):
        self.path = path
        self.on_emit = on_emit   # mirror into the SQLite store (preflight.db); never allowed to break an emit
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._seq = sum(1 for _ in self.path.open()) if self.path.exists() else 0

    def emit(self, type: str, **payload: Any) -> dict:
        with self._lock:
            self._seq += 1
            ev = {"seq": self._seq, "ts": time.time(), "type": type, **payload}
            with self.path.open("a") as f:
                f.write(json.dumps(ev, default=str) + "\n")
        if self.on_emit is not None:
            try:
                self.on_emit(ev)
            except Exception:
                pass
        return ev

def read_events(path: pathlib.Path, since: int = 0) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        ev = json.loads(line)
        if ev.get("seq", 0) > since:
            out.append(ev)
    return out

def tail(path: pathlib.Path, since: int = 0, poll: float = 0.5) -> Iterator[dict]:
    seq = since
    while True:
        for ev in read_events(path, seq):
            seq = ev["seq"]
            yield ev
        time.sleep(poll)
