"""OrchestratorFixer: dispatch through Orchestrator.inc's `ao` CLI when its daemon is healthy."""
from __future__ import annotations
import json, pathlib, shutil, subprocess, time
from .base import FixHandle, FixResult
from .claude_code import ClaudeCodeFixer, _env, _git

def healthy() -> bool:
    if not shutil.which("ao"):
        return False
    try:
        r = subprocess.run(["ao", "status", "--json"], capture_output=True, text=True, timeout=10, env=_env())
        data = json.loads(r.stdout or "{}")
        return r.returncode == 0 and bool(data.get("running", data.get("healthy", False)))
    except Exception:
        return False

class OrchestratorFixer(ClaudeCodeFixer):
    """Same worktree discipline; the agent process is owned by `ao` instead of us."""
    name = "orchestrator"

    def _launch(self, h: FixHandle, prompt: str, resume: str | None) -> None:
        name = f"fix-{h.cluster_id}"[:40]
        if resume is None:
            r = subprocess.run(["ao", "spawn", "--standalone", "--agent", "claude-code", "--name", name, "--skip-agent-check"],
                               cwd=h.worktree, capture_output=True, text=True, env=_env())
            h.extra["ao_session"] = (r.stdout.strip().splitlines() or [name])[-1].split()[-1]
        subprocess.run(["ao", "send", h.extra.get("ao_session", name), prompt], capture_output=True, text=True, env=_env())
        with open(h.log_path, "ab") as f:
            f.write(f"\n===== ao spawn/send {time.strftime('%H:%M:%S')} session={h.extra.get('ao_session')} =====\n".encode())

    def running(self, h: FixHandle) -> bool:
        r = subprocess.run(["ao", "session", "get", h.extra.get("ao_session", ""), "--json"], capture_output=True, text=True, env=_env())
        try:
            return json.loads(r.stdout).get("status") in ("running", "working", "active")
        except Exception:
            return False

    def wait(self, h: FixHandle, timeout_s: int = 900) -> FixResult:
        t0 = time.time()
        while time.time() - t0 < timeout_s:
            if not self.running(h):
                break
            time.sleep(5)
        head = _git(["rev-parse", "HEAD"], h.worktree)
        base = _git(["merge-base", "HEAD", "main"], h.worktree)
        if head == base and not _git(["status", "--porcelain", "-uno"], h.worktree):
            return FixResult(ok=False, error="ao session finished without changes")
        return self._collect(h)
