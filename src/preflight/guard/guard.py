"""Guard: allowlist, ownership, RPS, spend, wall clock, kill switch."""
from __future__ import annotations
import pathlib, threading, time
from urllib.parse import urlparse
from .. import config

class GuardError(RuntimeError): ...
class BudgetExceeded(GuardError): ...
class Stopped(GuardError): ...

class Guard:
    def __init__(self, max_usd: float, allowlist: list[str] | None = None, rps: float | None = None,
                 wallclock_s: int | None = None, stop_file: pathlib.Path | None = None):
        g = config.CFG.guard
        self.max_usd = max_usd
        self.allowlist = set(allowlist or g.allowlist)
        self.min_interval = 1.0 / (rps or g.rps)
        self.wallclock_s = wallclock_s or g.assessment_timeout_s
        self.stop_file = stop_file or config.ROOT / "STOP"
        self.spent = 0.0
        self.started = time.time()
        self._last = 0.0
        self._lock = threading.Lock()

    def check_url(self, url: str) -> None:
        host = urlparse(url).hostname or ""
        if host not in self.allowlist:
            raise GuardError(f"target host {host!r} is not allowlisted ({sorted(self.allowlist)})")

    def check_stop(self) -> None:
        if self.stop_file.exists():
            raise Stopped("STOP file present")
        if time.time() - self.started > self.wallclock_s:
            raise Stopped(f"assessment wall clock exceeded {self.wallclock_s}s")

    def acquire(self) -> None:
        """Rate limit outbound requests to the target."""
        self.check_stop()
        with self._lock:
            wait = self._last + self.min_interval - time.time()
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()

    def add_spend(self, usd: float) -> None:
        with self._lock:
            self.spent += usd
            if self.spent > self.max_usd:
                raise BudgetExceeded(f"spend ${self.spent:.3f} exceeds cap ${self.max_usd:.2f}")

    def remaining(self) -> float:
        return max(0.0, self.max_usd - self.spent)
