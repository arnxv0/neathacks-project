"""Fix dispatcher: brief -> fixer -> commit -> Entire checkpoint -> replay -> await approval. One cluster at a time per worker."""
from __future__ import annotations
import datetime as dt, os, pathlib, shutil, subprocess
from .. import config
from ..ledger import Ledger
from ..models import AttackSpec, Cluster, FixAttempt
from ..target.loader import SystemSpec
from . import brief as briefmod, entire
from .backends.base import FixHandle, FixResult, Fixer
from .backends.claude_code import ClaudeCodeFixer
from .backends.orchestrator import OrchestratorFixer, healthy as ao_healthy

def pick_backend(max_turns: int) -> Fixer:
    want = os.getenv("FIXER_BACKEND", "auto")
    if want in ("auto", "orchestrator") and ao_healthy():
        return OrchestratorFixer(max_turns=max_turns)
    return ClaudeCodeFixer(max_turns=max_turns, model=os.getenv("FIXER_MODEL") or None)

def worktrees_dir(target_repo: pathlib.Path) -> pathlib.Path:
    d = target_repo.parent / f"{target_repo.name}-worktrees"; d.mkdir(exist_ok=True); return d

def branch_for(cluster_id: str) -> str:
    return f"fix/{cluster_id[:48]}"

def checkpoint_context(repo: pathlib.Path, paths: list[str]) -> str:
    """Earlier Entire reasoning for the suspected files (first line per file is enough)."""
    out = []
    for p in paths[:3]:
        f = p.split(":")[0]
        if (repo / f).exists():
            txt = entire.why(repo, f, 1)
            if txt and "no checkpoint" not in txt.lower():
                out.append(f"### {f}\n{txt[:800]}")
    return "\n\n".join(out)

def start_attempt(ledger: Ledger, cluster: Cluster, spec: AttackSpec, system: SystemSpec, fixer: Fixer, n: int, *, tools_meta: dict,
                  review_comment: str | None = None, replay_failure: str | None = None, prev: FixHandle | None = None) -> tuple[FixAttempt, FixHandle]:
    comp = system.components[cluster.component]
    repo = comp.repo_path
    fdir = ledger.fix_dir(cluster.cluster_id, n)
    text = briefmod.render(ledger, cluster, spec, editable_paths=comp.editable_paths, test_command=comp.test_command, tools_meta=tools_meta,
                           checkpoint_context=checkpoint_context(repo, cluster.suspected_paths), review_comment=review_comment, replay_failure=replay_failure)
    brief_path = ledger.fix_dir(cluster.cluster_id) / "brief.md"
    brief_path.write_text(text)
    (fdir / "brief.md").write_text(text)
    attempt = FixAttempt(cluster_id=cluster.cluster_id, n=n, component=cluster.component, backend=fixer.name, branch=branch_for(cluster.cluster_id),
                         review_comment=review_comment, log_path=str(fdir / "fixer.log"), status="running")
    ledger.write_attempt(attempt)
    if prev is not None and (review_comment or replay_failure):
        msg = fdir / "message.md"
        msg.write_text(text)
        handle = prev
        handle.log_path = fdir / "fixer.log"
        return attempt, handle
    handle = fixer.start(brief_path, repo, attempt.branch, worktrees_dir(repo) / cluster.cluster_id, fdir / "fixer.log")
    return attempt, handle

def finish_attempt(ledger: Ledger, attempt: FixAttempt, handle: FixHandle, res: FixResult, repo: pathlib.Path,
                   test_command: str = "uv run pytest -q") -> FixAttempt:
    fdir = ledger.fix_dir(attempt.cluster_id, attempt.n)
    attempt.cost_usd = res.cost_usd; attempt.fixer_session_id = res.session_id; attempt.summary = res.summary
    if not res.ok:
        attempt.status = "failed"; attempt.summary = res.error or res.summary
        ledger.write_attempt(attempt); return attempt
    attempt.commit = res.commit
    (fdir / "diff.patch").write_text(res.diff); attempt.diff_path = str(fdir / "diff.patch")
    # Entire checkpoint for the fixer's commit
    meta = entire.checkpoint_for_commit(handle.worktree, res.commit)
    attempt.entire_checkpoint_id = entire.extract_id(meta) or entire.commit_trailer(handle.worktree, res.commit)
    if meta:
        (fdir / "checkpoint.json").write_text(__import__("json").dumps(meta, indent=2, default=str))
    text = entire.explain(handle.worktree, res.commit, generate=False)
    if text:
        (fdir / "checkpoint.md").write_text(text); attempt.checkpoint_summary = text[:1500]
    # tests
    # the component's own `test_command` from preflight.yaml, run through the shell so it works the same on macOS, Linux and Windows
    comp_test = subprocess.run(test_command, shell=True, cwd=handle.worktree, capture_output=True, text=True, timeout=600)
    attempt.tests_green = comp_test.returncode == 0
    (fdir / "tests.log").write_text(comp_test.stdout[-4000:] + comp_test.stderr[-2000:])
    attempt.status = "replaying"
    ledger.write_attempt(attempt)
    return attempt

def merge(repo: pathlib.Path, branch: str, cluster_id: str) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}
    env["PATH"] = f"{pathlib.Path.home() / '.local' / 'bin'}:{env.get('PATH', '')}"
    r = subprocess.run(["git", "merge", "--no-ff", branch, "-m", f"merge: {branch} (approved via Preflight for cluster {cluster_id})"],
                       cwd=repo, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        subprocess.run(["git", "merge", "--abort"], cwd=repo, capture_output=True)
        raise RuntimeError(f"merge failed: {(r.stdout + r.stderr)[-500:]}")
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True).stdout.strip()

def remove_worktree(repo: pathlib.Path, cluster_id: str) -> None:
    wt = worktrees_dir(repo) / cluster_id
    subprocess.run(["git", "worktree", "remove", "--force", str(wt)], cwd=repo, capture_output=True)
    shutil.rmtree(wt, ignore_errors=True)


def existing_commit(repo: pathlib.Path, cluster_id: str) -> str | None:
    """HEAD of the cluster's fix worktree if it is ahead of main."""
    wt = worktrees_dir(repo) / cluster_id
    if not wt.exists():
        return None
    r = subprocess.run(["git", "rev-list", "--count", "main..HEAD"], cwd=wt, capture_output=True, text=True)
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=wt, capture_output=True, text=True).stdout.strip() if int(r.stdout or 0) > 0 else None
    except ValueError:
        return None

def resume_attempt(ledger: Ledger, cluster: Cluster, spec: AttackSpec, system: SystemSpec, fixer: Fixer, *, tools_meta: dict) -> tuple[FixAttempt, FixHandle]:
    """Attempt 1 from an existing worktree commit (coordinator restart)."""
    comp = system.components[cluster.component]
    fdir = ledger.fix_dir(cluster.cluster_id, 1)
    brief_path = ledger.fix_dir(cluster.cluster_id) / "brief.md"
    if not brief_path.exists():
        brief_path.write_text(briefmod.render(ledger, cluster, spec, editable_paths=comp.editable_paths, test_command=comp.test_command, tools_meta=tools_meta))
    attempt = FixAttempt(cluster_id=cluster.cluster_id, n=1, component=cluster.component, backend=fixer.name, branch=branch_for(cluster.cluster_id),
                         log_path=str(fdir / "fixer.log"), status="running")
    ledger.write_attempt(attempt)
    handle = FixHandle(cluster_id=cluster.cluster_id, branch=attempt.branch, worktree=worktrees_dir(comp.repo_path) / cluster.cluster_id, log_path=fdir / "fixer.log")
    (fdir / "fixer.log").touch()
    return attempt, handle
