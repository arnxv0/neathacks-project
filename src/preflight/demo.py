"""Demo reset: put the built-in target back on its unfixed tag and start Preflight from an empty ledger.

Nothing is deleted. The ledger and the regression suite are moved to `ledger-archive/<timestamp>/`, so a reset can be
undone by moving them back (the regression files are also in git). Same steps as scripts/demo-reset.sh, in Python so it
works on Windows and can be called from the API."""
from __future__ import annotations
import datetime, pathlib, shutil, subprocess, urllib.request, json
from . import config

UNFIXED_TAG = "v0-unfixed"
GRAPH_COMMIT = "a1111bb"          # entire-graph agent instructions, kept on top of the unfixed tag when it applies cleanly
ARCHIVE_DIR = config.ROOT / "ledger-archive"

class ResetError(RuntimeError): ...

def _git(repo: pathlib.Path, *args: str, check: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise ResetError(f"git {' '.join(args)}: {(r.stderr or r.stdout).strip()[:300]}")
    return r.stdout.strip()

def default_target() -> pathlib.Path:
    return (config.ROOT / ".." / "acmesales-copilot").resolve()

def available(target: pathlib.Path | None = None) -> bool:
    t = target or default_target()
    return (t / ".git").exists() and subprocess.run(["git", "rev-parse", "-q", "--verify", f"refs/tags/{UNFIXED_TAG}"], cwd=t, capture_output=True).returncode == 0

def _archive() -> tuple[pathlib.Path | None, int, int]:
    """Move every ledger entry and regression suite aside. Returns (archive dir, assessments moved, suites moved)."""
    entries = [p for p in config.LEDGER_DIR.iterdir() if p.name != ".gitkeep"] if config.LEDGER_DIR.exists() else []
    suites = sorted(config.REGRESSIONS_DIR.glob("*.yaml")) if config.REGRESSIONS_DIR.exists() else []
    if not entries and not suites:
        return None, 0, 0
    dest = ARCHIVE_DIR / datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    (dest / "ledger").mkdir(parents=True, exist_ok=True); (dest / "regressions").mkdir(exist_ok=True)
    for p in entries:
        shutil.move(str(p), str(dest / "ledger" / p.name))
    for p in suites:
        shutil.move(str(p), str(dest / "regressions" / p.name))
    return dest, sum(1 for p in entries if (dest / "ledger" / p.name).is_dir()), len(suites)

def _served_version(port: int) -> str | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as r:
            return str(json.load(r).get("version"))
    except Exception:
        return None

def _recycle_target(target: pathlib.Path, port: int) -> str:
    """The long-running target keeps the code it started with in memory, and its /health reads the commit from git at
    request time, so the version it reports says nothing about what it runs. Always stop it after a reset: systemd
    restarts it (deployed host) and `preflight run` boots it when it is missing (local)."""
    if _served_version(port) is None:
        return "not running"
    try:
        pids = subprocess.run(["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout.split()
    except FileNotFoundError:
        return "running; restart it by hand so it loads the reset code"
    for pid in pids:
        subprocess.run(["kill", pid], capture_output=True)
    return "stopped so it restarts on the reset code" if pids else "running; restart it by hand so it loads the reset code"

def reset(target: pathlib.Path | None = None) -> dict:
    t = target or default_target()
    if not available(t):
        raise ResetError(f"{t} is not a git checkout with the {UNFIXED_TAG} tag; run `make target-checkout` first")
    _git(t, "worktree", "prune")
    wt = t.parent / f"{t.name}-worktrees"
    if wt.exists():
        shutil.rmtree(wt, ignore_errors=True)
    _git(t, "worktree", "prune")
    _git(t, "merge", "--abort", check=False)
    _git(t, "checkout", "-q", "-f", "-B", "main", UNFIXED_TAG)
    branches = [b.strip(" *+") for b in _git(t, "branch", "--list", "fix/*").splitlines() if b.strip()]
    for b in branches:
        _git(t, "branch", "-D", b, check=False)
    if subprocess.run(["git", "cherry-pick", "-q", GRAPH_COMMIT], cwd=t, capture_output=True).returncode != 0:
        _git(t, "cherry-pick", "--abort", check=False)
    dest, n_assessments, n_suites = _archive()
    stop = config.ROOT / "STOP"
    if stop.exists():
        stop.unlink()
    config.LEDGER_DIR.mkdir(exist_ok=True)
    port = int(config.CFG.ports.get("target", 8100))
    return {"ok": True, "target": str(t), "target_commit": _git(t, "rev-parse", "--short", "HEAD"), "fix_branches_removed": len(branches),
            "assessments_archived": n_assessments, "regression_suites_archived": n_suites,
            "archive": str(dest) if dest else None, "target_process": _recycle_target(t, port)}
