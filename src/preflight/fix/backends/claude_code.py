"""ClaudeCodeFixer: one git worktree per cluster, `claude -p` reads brief.md, commits once (Entire checkpoints the commit)."""
from __future__ import annotations
import json, os, pathlib, subprocess, time
from .base import FixHandle, FixResult

ALLOWED_TOOLS = "Read,Edit,MultiEdit,Write,Glob,Grep,LS,Bash(make test),Bash(make test *),Bash(uv run *),Bash(git status*),Bash(git diff*),Bash(git add*),Bash(git commit*),Bash(git log*),Bash(entire graph *),Bash(entire *),Bash(grep *),Bash(rg *),Bash(ls *),Bash(cat *)"

def _env() -> dict:
    env = {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}
    env["PATH"] = f"{pathlib.Path.home() / '.local' / 'bin'}:{env.get('PATH', '')}"
    return env

def _git(args: list[str], cwd: pathlib.Path) -> str:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True).stdout.strip()

class ClaudeCodeFixer:
    name = "claude"

    def __init__(self, max_turns: int = 60, model: str | None = None):
        self.max_turns = max_turns
        self.model = model
        self._procs: dict[str, subprocess.Popen] = {}

    def start(self, brief_path, target_repo, branch, worktree, log_path, base_ref="main") -> FixHandle:
        worktree = pathlib.Path(worktree)
        if worktree.exists():
            subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=target_repo, capture_output=True)
        subprocess.run(["git", "branch", "-D", branch], cwd=target_repo, capture_output=True)
        r = subprocess.run(["git", "worktree", "add", "-b", branch, str(worktree), base_ref], cwd=target_repo, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"worktree add failed: {r.stderr}")
        # share the main checkout's venv so `make test` / `uv run` are fast
        venv = pathlib.Path(target_repo) / ".venv"
        if venv.exists() and not (worktree / ".venv").exists():
            (worktree / ".venv").symlink_to(venv)
        h = FixHandle(cluster_id=brief_path.parent.name, branch=branch, worktree=worktree, log_path=pathlib.Path(log_path))
        prompt = f"Read the fix brief at {brief_path} and carry it out in this repository (the current working directory). Follow its rules exactly."
        self._launch(h, prompt, resume=None)
        return h

    def _launch(self, h: FixHandle, prompt: str, resume: str | None) -> None:
        cmd = ["claude", "-p", prompt, "--output-format", "json", "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED_TOOLS,
               "--max-turns", str(self.max_turns)]
        if self.model:
            cmd += ["--model", self.model]
        if resume:
            cmd += ["--resume", resume]
        out = open(h.log_path, "ab")
        out.write(f"\n===== claude -p start {time.strftime('%H:%M:%S')} =====\n".encode())
        self._procs[h.cluster_id] = subprocess.Popen(cmd, cwd=h.worktree, env=_env(), stdout=out, stderr=subprocess.STDOUT)

    def running(self, h: FixHandle) -> bool:
        p = self._procs.get(h.cluster_id)
        return p is not None and p.poll() is None

    def wait(self, h: FixHandle, timeout_s: int = 900) -> FixResult:
        p = self._procs.get(h.cluster_id)
        if p is None:
            return FixResult(ok=False, error="no process")
        try:
            p.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            p.kill()
            return FixResult(ok=False, error=f"fixer timed out after {timeout_s}s")
        return self._collect(h)

    def _collect(self, h: FixHandle) -> FixResult:
        text = h.log_path.read_text(errors="replace")
        last_json = None
        for block in reversed(text.split("\n===== claude -p start")):
            for line in reversed(block.splitlines()):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        last_json = json.loads(line); break
                    except json.JSONDecodeError:
                        continue
            if last_json:
                break
        cost = float((last_json or {}).get("total_cost_usd", 0.0) or 0.0)
        summary = str((last_json or {}).get("result", ""))[:2000]
        h.session_id = (last_json or {}).get("session_id") or h.session_id
        base = _git(["merge-base", "HEAD", "main"], h.worktree) or "HEAD~1"
        head = _git(["rev-parse", "HEAD"], h.worktree)
        # if the fixer edited but forgot to commit, commit for it so Entire still links the session
        if _git(["status", "--porcelain"], h.worktree):
            subprocess.run(["git", "add", "-A"], cwd=h.worktree)
            subprocess.run(["git", "commit", "-q", "-m", f"fix({h.cluster_id}): apply fixer changes\n\n{summary[:500]}"], cwd=h.worktree, env=_env())
            head = _git(["rev-parse", "HEAD"], h.worktree)
        if head == _git(["rev-parse", base], h.worktree):
            return FixResult(ok=False, error="fixer made no commit", summary=summary, cost_usd=cost, session_id=h.session_id)
        diff = _git(["diff", f"{base}..HEAD"], h.worktree)
        files = _git(["diff", "--name-only", f"{base}..HEAD"], h.worktree).splitlines()
        return FixResult(ok=True, commit=head, diff=diff, summary=summary, cost_usd=cost, session_id=h.session_id, changed_files=files)

    def send(self, h: FixHandle, message_path: pathlib.Path, timeout_s: int = 900) -> FixResult:
        prompt = f"Read {message_path} and revise your fix accordingly. Keep the same rules as the original brief; commit once when done."
        self._launch(h, prompt, resume=h.session_id)
        return self.wait(h, timeout_s)
