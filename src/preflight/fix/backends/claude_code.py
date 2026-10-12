"""ClaudeCodeFixer: one git worktree per cluster, `claude -p` reads brief.md, commits once (Entire checkpoints the commit)."""
from __future__ import annotations
import json, os, pathlib, subprocess, sys, time
from .base import FixHandle, FixResult

ALLOWED_TOOLS = "Read,Edit,MultiEdit,Write,Glob,Grep,LS,Bash(make test),Bash(make test *),Bash(uv run *),Bash(git status*),Bash(git diff*),Bash(git log*),Bash(entire graph *),Bash(entire *),Bash(grep *),Bash(rg *),Bash(ls *),Bash(cat *)"

# `claude -p` must not inherit a parent Claude Code session's CLAUDE* variables (CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...)
# or it refuses to start a nested session. The one exception is the long-lived OAuth token from `claude setup-token`,
# which is how a headless host (no interactive login) authenticates the fixers against a Max subscription.
KEEP_CLAUDE_VARS = frozenset({"CLAUDE_CODE_OAUTH_TOKEN"})

def clean_env(base: dict | None = None) -> dict:
    """Environment for spawning `claude`/fixer subprocesses: CLAUDE* stripped except KEEP_CLAUDE_VARS,
    `~/.local/bin` (uv, claude, entire) first on PATH."""
    src = os.environ if base is None else base
    env = {k: v for k, v in src.items() if not k.startswith("CLAUDE") or k in KEEP_CLAUDE_VARS}
    env["PATH"] = f"{pathlib.Path.home() / '.local' / 'bin'}:{env.get('PATH', '')}"
    return env

_env = clean_env

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
            # the target's `.venv/` ignore rule matches a directory, not this symlink: keep it out of the fix commit
            common = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=worktree, capture_output=True, text=True).stdout.strip()
            if common:
                ex = (pathlib.Path(worktree) / common if not pathlib.Path(common).is_absolute() else pathlib.Path(common)) / "info" / "exclude"
                ex.parent.mkdir(parents=True, exist_ok=True)
                if "/.venv\n" not in (ex.read_text() if ex.exists() else ""):
                    with ex.open("a") as f:
                        f.write("\n/.venv\n")
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
        t0 = time.time()
        while True:
            try:
                p.wait(timeout=15)
                break
            except subprocess.TimeoutExpired:
                if time.time() - t0 > timeout_s:
                    p.kill()
                    return FixResult(ok=False, error=f"fixer timed out after {timeout_s}s")
                _reap_stalled_entire_hooks()
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
        # The fixer leaves its changes uncommitted; Preflight commits once the session has ended so Entire links the
        # commit to the session (trailer) without the agent's shell blocking in Entire's post-commit hook.
        if _git(["status", "--porcelain", "-uno"], h.worktree):
            subprocess.run(["git", "add", "-A"], cwd=h.worktree)
            title = _commit_title(summary)
            msg = f"fix({h.cluster_id}): {title}\n\n{summary[:1500]}"
            try:
                subprocess.run(["git", "commit", "-q", "-m", msg], cwd=h.worktree, env=_env(), stdin=subprocess.DEVNULL, timeout=45)
            except subprocess.TimeoutExpired:
                pass  # the commit object exists; only Entire's post-commit condensation was still running
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


_STALL_PATTERNS = ("entire hooks claude-code stop", "entire hooks claude-code session-start", "entire hooks claude-code session-end",
                   "entire hooks git post-commit", "git update-ref --stdin")

def _etime_seconds(etime: str) -> int:
    """Parse BSD/macOS `ps -o etime` ([[dd-]hh:]mm:ss); macOS has no `etimes`."""
    days = 0
    if "-" in etime:
        d, etime = etime.split("-", 1)
        days = int(d)
    parts = [int(x) for x in etime.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    return days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2]

def _reap_stalled_entire_hooks(max_age_s: int = 90) -> None:
    """Entire's hooks can block indefinitely around non-interactive sessions (see DECISIONS.md): the Claude Code stop hook
    (~10 min), the git post-commit hook (`git update-ref --stdin` never returns, which then blocks the next session's
    session-start hook on Entire's ref locks). The transcript/commit is already saved by then; killing the stalled hook lets
    `claude -p` exit and the next fixer start. Returns nothing; failures are ignored."""
    if sys.platform == "win32":   # Entire hooks are a POSIX problem; nothing to reap
        return
    try:
        out = subprocess.run(["ps", "-ax", "-o", "pid=,etime=,command="], capture_output=True, text=True).stdout
    except Exception:
        return
    for line in out.splitlines():
        parts = line.split(None, 2)
        if len(parts) < 3 or not any(pat in parts[2] for pat in _STALL_PATTERNS):
            continue
        try:
            if _etime_seconds(parts[1]) > max_age_s:
                os.kill(int(parts[0]), 9)
        except (ValueError, ProcessLookupError, PermissionError):
            pass


def _commit_title(summary: str) -> str:
    """Pick the fixer's one-line commit title from its reply: the first short imperative line without a trailing period."""
    import re
    lines = [l.strip().lstrip("#-* ").strip("`*") for l in summary.splitlines() if l.strip()]
    for l in lines:
        if 12 <= len(l) <= 72 and not l.endswith(".") and ":" not in l[:12] and re.match(r"^[A-Z][a-z]+ ", l) and not l.startswith(("Verified", "Changes", "Still", "Also", "Note")):
            return l
    for l in lines:
        if 12 <= len(l) <= 72:
            return l.rstrip(".")
    return (lines[0][:72] if lines else "apply fixer changes")
