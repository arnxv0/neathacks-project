"""Replay the exact failing seeds of a cluster K times against a fixed checkout; also used for regressions."""
from __future__ import annotations
import os, pathlib, shutil, subprocess, tempfile, time
import httpx
from .. import config
from ..grading import grade_run
from ..guard.guard import Guard
from ..ledger import Ledger
from ..models import AttackSpec, Cluster, Replay, RunRecord, Seed
from ..runner.session import run_one
from ..target.loader import SystemSpec

def _free_port(preferred: int) -> int:
    """Each replay boots its own target; parallel clusters must not share a port."""
    import socket
    for cand in [preferred] + list(range(preferred + 1, preferred + 50)):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", cand))
                return cand
            except OSError:
                continue
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class ReplayTarget:
    """Boots the target from a worktree on the replay port with a throwaway DB + mirror."""
    def __init__(self, spec: SystemSpec, worktree: pathlib.Path, port: int | None = None, log_path: pathlib.Path | None = None):
        self.spec = spec
        self.worktree = worktree
        self.port = port or _free_port(config.CFG.ports.get("replay_target", 8101))
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="preflight-replay-"))
        self.proc: subprocess.Popen | None = None
        self.log_path = log_path

    def _python(self) -> str:
        for cand in (self.spec.entry.repo_path / ".venv" / "bin" / "python", self.worktree / ".venv" / "bin" / "python"):
            if cand.exists():
                return str(cand)
        return "python3"

    def __enter__(self) -> SystemSpec:
        env = dict(os.environ)
        env.update({"PORT": str(self.port), "ACMESALES_DB": str(self.tmp / "db.sqlite"), "ACMESALES_MIRROR_DIR": str(self.tmp / "mirror"),
                    "CRUSTDATA_BASE_URL": f"http://127.0.0.1:{config.CFG.ports.get('proxy', 8300)}"})
        env.pop("CLAUDECODE", None)
        log = open(self.log_path, "ab") if self.log_path else subprocess.DEVNULL
        self.proc = subprocess.Popen([self._python(), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(self.port)],
                                     cwd=self.worktree, env=env, stdout=log, stderr=subprocess.STDOUT)
        base = f"http://127.0.0.1:{self.port}"
        for _ in range(60):
            try:
                if httpx.get(f"{base}/health", timeout=1).status_code == 200:
                    break
            except Exception:
                time.sleep(0.5)
        else:
            self.__exit__(None, None, None)
            raise RuntimeError("replay target did not start; see replay log")
        spec = self.spec.model_copy(deep=True)
        comp = spec.entry
        comp.healthcheck = f"{base}/health"; comp.chat_endpoint = f"{base}/chat"; comp.tools_endpoint = f"{base}/preflight/tools"
        comp.state_endpoint = f"{base}/preflight/state"; comp.runs_endpoint = f"{base}/preflight/runs"
        comp.repo_path = self.worktree
        return spec

    def __exit__(self, *exc) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        shutil.rmtree(self.tmp, ignore_errors=True)

def replay_cluster(ledger: Ledger, cluster: Cluster, spec: SystemSpec, worktree: pathlib.Path, k: int, *, specs: dict[str, AttackSpec],
                   seed_of: dict[str, tuple[AttackSpec, Seed]], guard: Guard, canaries: dict, watchlist: dict, tools_meta: dict,
                   budgets: dict | None = None, kind: str = "replay", on_progress=None, label: str = "") -> Replay:
    """Returns before/after. 'before' = pass count among the cluster's original runs."""
    original = [ledger.read_run(r) for r in cluster.run_ids]
    before = f"{sum(1 for r in original if not r.failed)}/{len(original)}"
    passed = total = 0
    run_ids: list[str] = []
    with ReplayTarget(spec, worktree, log_path=ledger.root / "replay-target.log") as rspec:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=worktree, capture_output=True, text=True).stdout.strip()
        base = rspec.entry.healthcheck.rsplit("/", 1)[0]
        for rid in cluster.run_ids:
            attack, seed = seed_of[rid]
            for i in range(k):
                try:
                    httpx.post(f"{base}/preflight/reset", headers={"x-preflight-ownership": spec.ownership_token}, timeout=10)
                except Exception:
                    pass
                new_id = f"{kind}-{cluster.cluster_id[:24]}-{seed.id}-{i+1}-{os.urandom(2).hex()}"
                run, steps, state = run_one(attack, seed, rspec, ledger, guard, mode="replay", target_commit=commit, kind=kind, run_id=new_id)
                run = grade_run(ledger, attack, seed, run, canaries=canaries, watchlist=watchlist, budgets=budgets or spec.budgets, tools_meta=tools_meta)
                total += 1; passed += 0 if run.failed else 1; run_ids.append(run.run_id)
                if on_progress:
                    on_progress(passed, total, run)
    return Replay(before=before, after=f"{passed}/{total}", passed=passed, total=total, run_ids=run_ids)
