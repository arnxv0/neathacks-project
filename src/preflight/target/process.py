"""Boot, health-check and verify ownership of every component."""
from __future__ import annotations
import subprocess, time
import httpx
from .loader import ComponentSpec, SystemSpec

class TargetError(RuntimeError): ...

def healthy(comp: ComponentSpec, timeout: float = 3.0) -> bool:
    try:
        return httpx.get(comp.healthcheck, timeout=timeout).status_code == 200
    except Exception:
        return False

def wait_healthy(comp: ComponentSpec, timeout_s: float = 60) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if healthy(comp):
            return
        time.sleep(1)
    raise TargetError(f"{comp.name}: not healthy at {comp.healthcheck} after {timeout_s}s")

def ensure_running(comp: ComponentSpec, log_path=None, env: dict[str, str] | None = None) -> subprocess.Popen | None:
    if healthy(comp):
        return None
    if not comp.start:
        raise TargetError(f"{comp.name}: not running and no `start:` command")
    log = open(log_path, "a") if log_path else subprocess.DEVNULL
    proc = subprocess.Popen(comp.start, shell=True, cwd=comp.repo_path, stdout=log, stderr=subprocess.STDOUT, env=env)
    wait_healthy(comp)
    return proc

def verify_ownership(spec: SystemSpec) -> None:
    for comp in spec.components.values():
        url = comp.healthcheck.rsplit("/", 1)[0] + "/preflight-verify"
        try:
            tok = httpx.get(url, timeout=5).json().get("ownership_token")
        except Exception as e:
            raise TargetError(f"{comp.name}: /preflight-verify failed: {e}")
        if not spec.ownership_token or tok != spec.ownership_token:
            raise TargetError(f"{comp.name}: ownership token mismatch; refusing to attack")

def target_version(comp: ComponentSpec) -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=comp.repo_path, text=True).strip()
    except Exception:
        return "unknown"
