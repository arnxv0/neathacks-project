"""Entire integration: checkpoints for fixer commits, explanations, blame for regressions."""
from __future__ import annotations
import json, os, pathlib, shutil, subprocess

def _env() -> dict:
    env = dict(os.environ)
    env["PATH"] = f"{pathlib.Path.home() / '.local' / 'bin'}:{env.get('PATH', '')}"
    return env

def available() -> bool:
    return shutil.which("entire", path=_env()["PATH"]) is not None

def _run(args: list[str], cwd: pathlib.Path, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(["entire", *args], cwd=cwd, env=_env(), capture_output=True, text=True, timeout=timeout)

def checkpoint_for_commit(repo: pathlib.Path, sha: str) -> dict | None:
    """Metadata (incl. checkpoint id) for the checkpoint linked to a commit, or None."""
    if not available():
        return None
    r = _run(["checkpoint", "explain", "--commit", sha, "--json", "--no-pager"], repo)
    if r.returncode != 0 or not r.stdout.strip():
        return None
    try:
        data = json.loads(r.stdout)
    except json.JSONDecodeError:
        return None
    return data

def extract_id(meta: dict | None) -> str | None:
    if not meta:
        return None
    for key in ("checkpoint_id", "checkpointId", "id"):
        if isinstance(meta, dict) and meta.get(key):
            return str(meta[key])
    if isinstance(meta, dict):
        for v in meta.values():
            if isinstance(v, dict):
                got = extract_id(v)
                if got:
                    return got
            if isinstance(v, list):
                for item in v:
                    got = extract_id(item) if isinstance(item, dict) else None
                    if got:
                        return got
    return None

def explain(repo: pathlib.Path, ref: str, generate: bool = True) -> str:
    """Human-readable intent/outcome for a checkpoint id or commit sha."""
    if not available():
        return ""
    args = ["checkpoint", "explain", ref, "--no-pager"]
    if generate:
        args.append("--generate")
    r = _run(args, repo, timeout=240)
    text = (r.stdout or "") + ("" if r.returncode == 0 else f"\n[entire exit {r.returncode}] {r.stderr[-400:]}")
    return text.strip()

def commit_trailer(repo: pathlib.Path, sha: str) -> str | None:
    r = subprocess.run(["git", "log", "-1", "--format=%B", sha], cwd=repo, capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.lower().startswith("entire-checkpoint:"):
            return line.split(":", 1)[1].strip()
    return None

def why(repo: pathlib.Path, file: str, line: int) -> str:
    if not available():
        return ""
    r = _run(["why", f"{file}:{line}", "--no-pager"], repo)
    return (r.stdout or r.stderr).strip()

def blame(repo: pathlib.Path, file: str, line: int) -> str:
    if not available():
        return ""
    r = _run(["blame", file, "--line", str(line), "--no-pager"], repo)
    return (r.stdout or r.stderr).strip()
