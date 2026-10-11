"""Clone a public GitHub repo into the sandbox. Nothing from the repo is executed: no hooks, no submodules, no LFS
smudge, no credential helpers, no user/system git config."""
from __future__ import annotations
import datetime as dt, os, pathlib, shutil, subprocess
from . import inspect as inspectmod, registry
from .registry import Entry, RegistryError

CLONE_TIMEOUT_S = 180
DEFAULT_MAX_MB = 300

def max_bytes() -> int:
    return int(float(os.getenv("PREFLIGHT_SANDBOX_MAX_MB", DEFAULT_MAX_MB)) * 1024 * 1024)

def git_env() -> dict[str, str]:
    """Minimal environment for every git call on third-party repos: no prompts, no global/system config (so no
    credential helper, no `url.insteadOf` rewrite to ssh, no LFS filter), no LFS download."""
    return {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": os.environ.get("HOME", "/"), "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1", "GIT_LFS_SKIP_SMUDGE": "1", "GIT_ASKPASS": "true", "LC_ALL": "C"}

def source_for(url: str) -> str:
    """What git is told to fetch for a validated URL. The only seam tests replace (with a local bare repo); the URL
    validation in registry.parse_url is never bypassed."""
    return registry.canonical_url(url)

def clone_argv(url: str, dest: pathlib.Path) -> list[str]:
    return ["git", "-c", "core.hooksPath=/dev/null", "clone", "--depth", "50", "--no-recurse-submodules", "--single-branch",
            source_for(url), str(dest)]

def safe_git(args: list[str], cwd: pathlib.Path, timeout: int = 60) -> subprocess.CompletedProcess:
    """git inside a clone with every config-driven way of running a program switched off."""
    return subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "diff.external=", "-c", "core.pager=cat",
                           *args], cwd=cwd, env=git_env(), capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)

def dir_size(path: pathlib.Path, stop_at: int | None = None) -> int:
    """Bytes on disk without following symlinks; stops early once `stop_at` is exceeded."""
    total = 0
    for base, dirs, files in os.walk(path, followlinks=False):
        for name in files + dirs:
            try:
                total += os.lstat(os.path.join(base, name)).st_size
            except OSError:
                pass
        if stop_at is not None and total > stop_at:
            break
    return total

def clone(url: str, dest: pathlib.Path) -> str:
    """Clone `url` into `dest` (must not exist). Returns the HEAD sha. Removes `dest` on any failure or size violation."""
    registry.parse_url(url)
    dest = pathlib.Path(dest)
    if dest.exists():
        raise RegistryError(f"{dest.name} already exists in the sandbox", "already_exists")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = subprocess.run(clone_argv(url, dest), env=git_env(), capture_output=True, text=True, timeout=CLONE_TIMEOUT_S, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        shutil.rmtree(dest, ignore_errors=True)
        raise RegistryError(f"clone timed out after {CLONE_TIMEOUT_S}s", "clone_failed")
    if r.returncode != 0:
        shutil.rmtree(dest, ignore_errors=True)
        raise RegistryError(f"git clone failed: {(r.stderr or r.stdout).strip()[-400:]}", "clone_failed")
    cap = max_bytes()
    size = dir_size(dest, stop_at=cap)
    if size > cap:
        shutil.rmtree(dest, ignore_errors=True)
        raise RegistryError(f"repository is larger than the {cap // (1024 * 1024)} MB sandbox cap", "too_large")
    safe_git(["remote", "set-url", "--push", "origin", "DISABLED-by-preflight"], dest)   # nothing is ever pushed from a sandbox clone
    return safe_git(["rev-parse", "HEAD"], dest).stdout.strip()

def fetch(slug: str) -> Entry:
    """Clone + static inspection for an entry in `cloning`. Never raises: failures land in the entry (status `error`)."""
    e = registry.get(slug)
    dest = registry.clone_dir(slug)
    try:
        sha = clone(e.url, dest)
        summary = inspectmod.inspect(dest)
    except Exception as ex:
        shutil.rmtree(dest, ignore_errors=True)
        return registry.set_status(slug, "error", error=str(ex), code=getattr(ex, "code", "clone_failed"))
    native = bool(summary.get("contract_native"))
    e = registry.set_status(slug, "cloned", head_sha=sha, cloned_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                            stack=summary, contract_native=native, manifest_path=str(dest / "preflight.yaml") if native else None)
    if native:   # it ships its own manifest: nothing to generate, but a human still has to read it before anything is started
        e = registry.set_status(slug, "needs_review", note="repo ships its own preflight.yaml; review it, then approve")
    return e

def add(url: str) -> Entry:
    """Validate, register, clone and inspect synchronously; a failed clone leaves nothing behind and raises.
    (The API's default path is create() + fetch() on a thread, with the failure kept on the entry for polling.)"""
    e = fetch(registry.create(url).slug)
    if e.status == "error":
        registry.remove(e.slug)
        raise RegistryError(e.last_error or "clone failed", e.error_code or "clone_failed")
    return e
