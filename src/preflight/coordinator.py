"""The Preflight state machine. Everything it knows is on disk in the ledger."""
from __future__ import annotations
import datetime as dt, json, os, pathlib, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import httpx
from rich.console import Console
from . import config
from .attacks import catalog, seeds as seedmod
from .graders.base import RunContext
from .graders.registry import run_all
from .guard.guard import BudgetExceeded, Guard, Stopped
from .ledger import Ledger, new_assessment_id
from .llm.gateway import Gateway
from .models import AttackSpec, RunRecord, Seed
from .report import report as reportmod
from .runner.session import run_one
from .analyze import cluster as clustermod, divergence as divmod
from .llm import analyst
from .fix import dispatcher
from .grading import grade_run
from .replay import replay as replaymod, regress as regressmod
from .models import Cluster, Seed as _Seed
from .target import loader, manifest as manifestmod, process

console = Console()

def proxy_url() -> str:
    return f"http://127.0.0.1:{config.CFG.ports.get('proxy', 8300)}"

def ensure_proxy() -> None:
    try:
        if httpx.get(f"{proxy_url()}/health", timeout=2).status_code == 200:
            return
    except Exception:
        pass
    import uvicorn
    from .chaos.proxy import app
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=config.CFG.ports.get("proxy", 8300), log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(30):
        try:
            if httpx.get(f"{proxy_url()}/health", timeout=1).status_code == 200:
                return
        except Exception:
            time.sleep(0.3)
    raise RuntimeError("chaos proxy did not start")

class Coordinator:
    def __init__(self, target_dir: pathlib.Path, mode: str = "dev", attacks: str | None = None, assessment_id: str | None = None,
                 seeds: int | None = None, label: str | None = None, no_fix: bool = False):
        self.target_dir = pathlib.Path(target_dir).resolve()
        self.mode = mode
        self.mcfg = config.CFG.modes[mode].model_copy()
        if seeds:
            self.mcfg.seeds_per_attack = seeds
        self.label = label
        self.no_fix = no_fix
        self.selector = attacks or self.mcfg.attacks
        self.ledger = Ledger(assessment_id or new_assessment_id())
        self.spec = loader.load(self.target_dir)
        self.guard = Guard(max_usd=self.mcfg.max_usd)
        self.gateway: Gateway | None = None
        self.specs: dict[str, AttackSpec] = {}
        self.seed_of: dict[str, tuple[AttackSpec, Seed]] = {}
        self.fixer = None

    @classmethod
    def from_ledger(cls, assessment_id: str) -> "Coordinator":
        led = Ledger(assessment_id)
        m = led.manifest()
        c = cls(pathlib.Path(m["target_dir"]), mode=m.get("mode", "dev"), attacks=m.get("attacks"), assessment_id=assessment_id)
        c.specs = {sp.id: sp for sp in catalog.select(catalog.load_all(), c.selector or "all")}
        if not c.specs:
            c.specs = {sp.id: sp for sp in catalog.load_all()}
        for run in led.runs():
            a = c.specs.get(run.attack_id)
            if a:
                seed = next((sd for sd in a.seeds if sd.id == run.seed_id), None)
                if seed:
                    c.seed_of[run.run_id] = (a, seedmod.expand_one(a, seed))
        c.gateway = Gateway(on_spend=c._spend, log_path=led.root / "llm_calls.jsonl")
        return c

    def _grading_kw(self) -> dict:
        tools_meta = self.ledger.manifest().get("tools", {}).get("components", {}).get(self.spec.entrypoint, {}).get("tools", {})
        return dict(canaries=loader.canaries(self.spec), watchlist=catalog.watchlist(), budgets=self.spec.budgets, tools_meta=tools_meta)

    # ---- helpers ----
    def emit(self, type: str, **payload) -> None:
        self.ledger.events.emit(type, **payload)

    def state(self, s: str) -> None:
        self.ledger.update_manifest(state=s, updated_at=dt.datetime.utcnow().isoformat())
        self.emit("state.changed", state=s)
        console.rule(f"[bold cyan]{s}")

    def _spend(self, usd: float, role: str) -> None:
        self.guard.add_spend(usd)
        m = self.ledger.manifest(); m["preflight_llm_usd"] = m.get("preflight_llm_usd", 0.0) + usd
        self.ledger.write_manifest(m)
        self.emit("cost.updated", preflight_llm_usd=m["preflight_llm_usd"], spent=self.guard.spent, role=role)

    # ---- states ----
    def boot(self) -> None:
        self.state("BOOT_TARGET")
        ensure_proxy()
        comp = self.spec.entry
        process.ensure_running(comp, log_path=self.ledger.root / "target.log")
        health = httpx.get(comp.healthcheck, timeout=5).json()
        up = (health.get("upstreams") or {}).get("company_lookup", "")
        if ":%d" % config.CFG.ports.get("proxy", 8300) not in up:
            raise RuntimeError(f"target's company_lookup upstream is {up!r}, not the chaos proxy. Start the target with "
                               f"CRUSTDATA_BASE_URL={proxy_url()} (make dev-host does this).")
        self.state("VERIFY_OWNERSHIP")
        process.verify_ownership(self.spec)
        man = manifestmod.build(self.spec)
        self.gateway = Gateway(on_spend=self._spend, log_path=self.ledger.root / "llm_calls.jsonl")
        self.ledger.update_manifest(system=self.spec.system, target_dir=str(self.target_dir), target_commit=process.target_version(comp),
                                    mode=self.mode, attacks=self.selector, label=self.label, caps={"max_usd": self.mcfg.max_usd}, target_health=health,
                                    models=self.gateway.tiers, tools=man, started_at=dt.datetime.utcnow().isoformat(),
                                    neatlogs_project=os.getenv("NEATLOGS_PROJECT_ID"))
        for w in man.get("warnings", []):
            console.print(f"[yellow]warn[/yellow] {w}")

    def attack(self) -> list[RunRecord]:
        self.state("ATTACK")
        specs = catalog.select(catalog.load_all(), self.selector)
        self.specs = {s.id: s for s in specs}
        jobs: list[tuple[AttackSpec, Seed]] = []
        for a in specs:
            for s in seedmod.expand(a, self.mcfg.seeds_per_attack):
                jobs.append((a, s))
        self.emit("attack.planned", total=len(jobs), attacks=[a.id for a in specs])
        console.print(f"{len(jobs)} runs across {len(specs)} attacks (mode={self.mode}, cap=${self.mcfg.max_usd})")
        commit = self.ledger.manifest().get("target_commit", "")
        runs: list[RunRecord] = []
        self._reset_target()
        with ThreadPoolExecutor(max_workers=self.mcfg.concurrency) as ex:
            futs = {}
            for a, s in jobs:
                rid = f"{a.id}-{s.id}-{os.urandom(3).hex()}"
                self.seed_of[rid] = (a, s)
                self.emit("run.started", run_id=rid, attack_id=a.id, seed_id=s.id)
                futs[ex.submit(run_one, a, s, self.spec, self.ledger, self.guard, mode=self.mode, target_commit=commit, gateway=self.gateway, run_id=rid)] = rid
            for f in as_completed(futs):
                try:
                    run, steps, state = f.result()
                except (BudgetExceeded, Stopped) as e:
                    self.emit("stopped", reason=str(e)); console.print(f"[red]stopped: {e}")
                    for other in futs:
                        other.cancel()
                    break
                except Exception as e:
                    self.emit("run.error", run_id=futs[f], error=str(e)); console.print(f"[red]run {futs[f]} error: {e}")
                    continue
                runs.append(run)
                self.emit("run.finished", run_id=run.run_id, attack_id=run.attack_id, steps=run.steps, usd=run.usd, trace_id=run.neatlogs_trace_id)
        return runs

    def _reset_target(self) -> None:
        try:
            base = self.spec.entry.healthcheck.rsplit("/", 1)[0]
            httpx.post(f"{base}/preflight/reset", headers={"x-preflight-ownership": self.spec.ownership_token}, timeout=10)
        except Exception:
            pass

    def grade(self, runs: list[RunRecord]) -> list[RunRecord]:
        self.state("GRADE")
        canaries = loader.canaries(self.spec)
        wl = catalog.watchlist()
        tools_meta = self.ledger.manifest().get("tools", {}).get("components", {}).get(self.spec.entrypoint, {}).get("tools", {})
        graded = []
        for run in runs:
            a, s = self.seed_of[run.run_id]
            steps = self.ledger.read_steps(run.run_id)
            trace = json.loads((self.ledger.run_dir(run.run_id) / "trace.json").read_text())
            ctx = RunContext(attack=a, seed=s, run=run, steps=steps, state=trace.get("state", {}), canaries=canaries, watchlist=wl,
                             budgets=self.spec.budgets, tools_meta=tools_meta, gateway=self.gateway,
                             transcript_path=str(self.ledger.run_dir(run.run_id) / "transcript.md"))
            run.verdicts = run_all(ctx)
            run.failed = any(not v.passed for v in run.verdicts.values()) or bool(run.error)
            from .runner import transcript
            self.ledger.write_run(run, steps=steps, transcript=transcript.render(run, steps, s.messages, s.fault, s.fixture))
            graded.append(run)
            fails = [g for g, v in run.verdicts.items() if not v.passed]
            self.emit("run.graded", run_id=run.run_id, attack_id=run.attack_id, failed=run.failed, failing_graders=fails)
            console.print(f"{'[red]FAIL' if run.failed else '[green]PASS'}[/] {run.attack_id} {run.seed_id}  " +
                          "; ".join(e for g in fails for e in run.verdicts[g].evidence[:1]))
        return graded

    def cluster_and_diverge(self, runs: list[RunRecord]) -> list:
        self.state("CLUSTER")
        clusters = clustermod.build(self.ledger, runs, self.specs)
        runs_by_id = {r.run_id: r for r in runs}
        tools_meta = self.ledger.manifest().get("tools", {}).get("components", {}).get(self.spec.entrypoint, {}).get("tools", {})
        for c in clusters:
            self.ledger.write_cluster(c)
            self.emit("cluster.created", cluster_id=c.cluster_id, attack_ids=c.attack_ids, run_ids=c.run_ids, failing_graders=c.failing_graders)
        console.print(f"{len(clusters)} clusters from {sum(1 for r in runs if r.failed)} failed runs")
        self.state("DIVERGE")
        for c in clusters:
            spec = self.specs[c.attack_ids[0]]
            div, md = divmod.compute(self.ledger, c, runs_by_id, spec)
            c.divergence = div
            try:
                hyp, paths = analyst.hypothesize(self.gateway, c, spec, md, tools_meta,
                                                 [self.ledger.run_dir(r) / "transcript.md" for r in c.run_ids])
            except Exception as e:
                hyp, paths = f"(analyst unavailable: {e})", [m.get("source") for m in tools_meta.values() if m.get("source")][:2]
            c.hypothesis, c.suspected_paths = hyp, [p for p in paths if p]
            self.ledger.write_cluster(c, divergence_md=md)
            try:
                from .fix import entire as entiremod
                g = entiremod.graph_context(self.spec.components[c.component].repo_path, c.suspected_paths, hyp)
                if g:
                    (self.ledger.root / "clusters" / c.cluster_id / "graph.md").write_text("# entire-graph context\n\n" + g + "\n")
                    self.emit("graph.ready", cluster_id=c.cluster_id)
            except Exception as e:
                console.print(f"[yellow]entire-graph skipped: {e}")
            self.emit("divergence.ready", cluster_id=c.cluster_id, step_index=div.step_index, mode=div.mode, trace_links=div.trace_links, hypothesis=hyp)
            console.print(f"[magenta]{c.cluster_id}[/] step {div.step_index} ({div.mode}): {hyp}")
        clusters = self._merge_clusters(clusters)
        return clusters

    def _merge_clusters(self, clusters: list[Cluster]) -> list[Cluster]:
        """Ask the analyst which clusters share one root cause; merge them so one fixer handles one cause."""
        if len(clusters) < 2:
            return clusters
        try:
            groups = analyst.merge_groups(self.gateway, clusters)
        except Exception as e:
            console.print(f"[yellow]analyst merge skipped: {e}"); return clusters
        if not groups:
            return clusters
        merged: list[Cluster] = []
        used: set[str] = set()
        for ids, reason in groups:
            members = [c for c in clusters if c.cluster_id in ids and c.cluster_id not in used]
            if len(members) < 2:
                continue
            head = members[0]
            for other in members[1:]:
                head.run_ids += [r for r in other.run_ids if r not in head.run_ids]
                head.attack_ids = sorted(set(head.attack_ids) | set(other.attack_ids))
                head.failing_graders = sorted(set(head.failing_graders) | set(other.failing_graders))
                head.suspected_paths = list(dict.fromkeys(head.suspected_paths + other.suspected_paths))
                other.status = "merged_into:" + head.cluster_id
                self.ledger.write_cluster(other)
                import shutil as _sh; _sh.rmtree(self.ledger.root / "clusters" / other.cluster_id, ignore_errors=True)
            head.signature += f" | merged: {', '.join(m.cluster_id for m in members[1:])} ({reason})"
            self.ledger.write_cluster(head)
            self.emit("cluster.merged", cluster_id=head.cluster_id, absorbed=[m.cluster_id for m in members[1:]], reason=reason)
            console.print(f"[magenta]merged[/] {[m.cluster_id for m in members[1:]]} into {head.cluster_id}: {reason}")
            used |= {m.cluster_id for m in members}
            merged.append(head)
        rest = [c for c in clusters if c.cluster_id not in used]
        return merged + rest

    # ---- fix phase ----
    def _fix_cluster(self, cluster: Cluster, resume: bool = False) -> Cluster:
        spec = self.specs[cluster.attack_ids[0]]
        kw = self._grading_kw()
        comp = self.spec.components[cluster.component]
        max_retries = config.CFG.fixers.get("max_retries", 2)
        handle = None; replay_failure = None
        cluster.status = "fixing"; self.ledger.write_cluster(cluster)
        existing = dispatcher.existing_commit(comp.repo_path, cluster.cluster_id) if resume else None
        for n in range(1, max_retries + 2):
            self.emit("fix.started", cluster_id=cluster.cluster_id, attempt=n, backend=self.fixer.name, resumed=bool(existing and n == 1))
            if existing and n == 1:
                # a fixer already committed on this cluster's branch (e.g. the coordinator was restarted): reuse it
                attempt, handle = dispatcher.resume_attempt(self.ledger, cluster, spec, self.spec, self.fixer, tools_meta=kw["tools_meta"])
                res = self.fixer._collect(handle)
            else:
                attempt, handle = dispatcher.start_attempt(self.ledger, cluster, spec, self.spec, self.fixer, n, tools_meta=kw["tools_meta"],
                                                           replay_failure=replay_failure, prev=handle if n > 1 else None)
                if n > 1:
                    res = self.fixer.send(handle, self.ledger.fix_dir(cluster.cluster_id, n) / "message.md", timeout_s=900)
                else:
                    res = self.fixer.wait(handle, timeout_s=900)
            attempt = dispatcher.finish_attempt(self.ledger, attempt, handle, res, comp.repo_path, test_command=comp.test_command)
            self.emit("fix.attempt.done", cluster_id=cluster.cluster_id, attempt=n, ok=res.ok, commit=attempt.commit,
                      checkpoint=attempt.entire_checkpoint_id, tests_green=attempt.tests_green, cost_usd=attempt.cost_usd, error=res.error)
            if not res.ok:
                replay_failure = f"The fixer run ended without a usable commit: {res.error}"
                continue
            console.print(f"[cyan]{cluster.cluster_id}[/] attempt {n}: commit {attempt.commit[:8]} checkpoint={attempt.entire_checkpoint_id} tests_green={attempt.tests_green}")
            if not attempt.tests_green:
                replay_failure = "`make test` failed on your branch:\n```\n" + (self.ledger.fix_dir(cluster.cluster_id, n) / "tests.log").read_text()[-1500:] + "\n```"
                attempt.status = "failed"; self.ledger.write_attempt(attempt); continue
            self.emit("replay.started", cluster_id=cluster.cluster_id, attempt=n, k=self.mcfg.replay_k)
            def prog(passed, total, run, _c=cluster, _n=n):
                self.emit("replay.progress", cluster_id=_c.cluster_id, attempt=_n, passed=passed, total=total, run_id=run.run_id, failed=run.failed)
            rep = replaymod.replay_cluster(self.ledger, cluster, self.spec, handle.worktree, self.mcfg.replay_k, specs=self.specs, seed_of=self.seed_of,
                                           guard=self.guard, on_progress=prog, **kw)
            attempt.replay = rep
            self.emit("replay.done", cluster_id=cluster.cluster_id, attempt=n, before=rep.before, after=rep.after)
            console.print(f"[cyan]{cluster.cluster_id}[/] replay {rep.before} -> {rep.after}")
            if rep.passed == rep.total:
                attempt.status = "passed"; self.ledger.write_attempt(attempt)
                cluster.status = "await_approval"; self.ledger.write_cluster(cluster)
                self.emit("approval.needed", cluster_id=cluster.cluster_id, attempt=n, commit=attempt.commit, checkpoint=attempt.entire_checkpoint_id,
                          before=rep.before, after=rep.after)
                return cluster
            attempt.status = "failed"; self.ledger.write_attempt(attempt)
            failing = [self.ledger.read_run(r) for r in rep.run_ids if self.ledger.read_run(r).failed]
            ev = "\n".join(f"- {r.run_id}: " + "; ".join(e for v in r.verdicts.values() if not v.passed for e in v.evidence[:1]) for r in failing[:4])
            replay_failure = f"Replay after your change: {rep.after} passed (need {rep.total}/{rep.total}). Still failing:\n{ev}\nTranscripts: " + \
                             ", ".join(str(self.ledger.run_dir(r.run_id) / "transcript.md") for r in failing[:2])
            (self.ledger.fix_dir(cluster.cluster_id, n) / "replay_failure.md").write_text(replay_failure)
            self.emit("recovery", kind="fixer_retry", cluster_id=cluster.cluster_id, attempt=n, detail=f"replay {rep.after}; sending feedback to the fixer")
        cluster.status = "needs_human"; self.ledger.write_cluster(cluster)
        self.emit("cluster.needs_human", cluster_id=cluster.cluster_id)
        return cluster

    def fix(self, clusters: list[Cluster], resume: bool = False) -> list[Cluster]:
        if not clusters:
            return clusters
        self.state("FIX")
        self.fixer = dispatcher.pick_backend(config.CFG.fixers.get("max_turns", 60))
        console.print(f"fixer backend: {self.fixer.name}; {len(clusters)} clusters, up to {config.CFG.fixers.get('max_parallel', 3)} in parallel")
        out = []
        with ThreadPoolExecutor(max_workers=config.CFG.fixers.get("max_parallel", 3)) as ex:
            for c in as_completed([ex.submit(self._fix_cluster, c, resume) for c in clusters]):
                try:
                    out.append(c.result())
                except Exception as e:
                    console.print(f"[red]fix failed: {e}"); self.emit("fix.error", error=str(e))
        if any(c.status == "await_approval" for c in out):
            self.state("AWAIT_APPROVAL")
            for c in out:
                if c.status == "await_approval":
                    console.print(f"  review: preflight approve {self.ledger.assessment_id} {c.cluster_id}   (or reject / request-changes)")
        return out

    # ---- approval ----
    def approve(self, cluster_id: str) -> None:
        cluster = self.ledger.read_cluster(cluster_id)
        attempts = [a for a in self.ledger.attempts(cluster_id) if a.status == "passed"]
        if not attempts:
            raise RuntimeError("no attempt has passed replay; nothing to approve")
        a = attempts[-1]
        comp = self.spec.components[cluster.component]
        try:
            merge_sha = dispatcher.merge(comp.repo_path, a.branch, cluster_id)
        except RuntimeError as e:
            # another approved fix touched the same lines. Does main already close this cluster?
            console.print(f"[yellow]merge conflict for {a.branch}; checking whether main already closes the cluster…")
            self.emit("recovery", kind="merge_conflict", cluster_id=cluster_id, detail=str(e)[:300])
            rep = replaymod.replay_cluster(self.ledger, cluster, self.spec, comp.repo_path, self.mcfg.replay_k, specs=self.specs, seed_of=self.seed_of,
                                           guard=self.guard, kind="replay", **self._grading_kw())
            if rep.passed == rep.total:
                merge_sha = process.target_version(comp)
                a.summary = (a.summary or "") + f"\n[not merged: conflicted with an earlier approved fix; main already passes replay {rep.after}]"
                a.replay = rep
            else:
                cluster.status = "needs_human"; self.ledger.write_cluster(cluster)
                self.emit("cluster.needs_human", cluster_id=cluster_id, reason="merge conflict and main still fails replay")
                raise
        a.status = "approved"; self.ledger.write_attempt(a)
        cluster.status = "merged"; self.ledger.write_cluster(cluster)
        spec = self.specs[cluster.attack_ids[0]]
        seeds = [self.seed_of[r][1] for r in cluster.run_ids if r in self.seed_of]
        reg = regressmod.save(cluster, spec, seeds, a.commit or merge_sha, self.ledger.assessment_id)
        self.emit("merged", cluster_id=cluster_id, commit=a.commit, merge_commit=merge_sha, regression_file=str(reg))
        console.print(f"[green]merged[/] {a.branch} -> main ({merge_sha[:8]}); regression saved {reg.name}")
        dispatcher.remove_worktree(comp.repo_path, cluster_id)
        self._maybe_finish()

    def reject(self, cluster_id: str, reason: str) -> None:
        cluster = self.ledger.read_cluster(cluster_id)
        cluster.status = "rejected"; self.ledger.write_cluster(cluster)
        (self.ledger.fix_dir(cluster_id) / "rejected.md").write_text(reason)
        self.emit("rejected", cluster_id=cluster_id, reason=reason)
        self._maybe_finish()

    def request_changes(self, cluster_id: str, comment: str) -> None:
        cluster = self.ledger.read_cluster(cluster_id)
        attempts = self.ledger.attempts(cluster_id)
        n = (attempts[-1].n if attempts else 0) + 1
        spec = self.specs[cluster.attack_ids[0]]
        kw = self._grading_kw(); comp = self.spec.components[cluster.component]
        self.fixer = self.fixer or dispatcher.pick_backend(config.CFG.fixers.get("max_turns", 60))
        # resume the fixer in the existing worktree
        from .fix.backends.base import FixHandle
        prev = FixHandle(cluster_id=cluster_id, branch=dispatcher.branch_for(cluster_id), worktree=dispatcher.worktrees_dir(comp.repo_path) / cluster_id,
                         log_path=self.ledger.fix_dir(cluster_id, n) / "fixer.log", session_id=attempts[-1].fixer_session_id if attempts else None)
        self.emit("fix.started", cluster_id=cluster_id, attempt=n, backend=self.fixer.name, review_comment=comment)
        attempt, handle = dispatcher.start_attempt(self.ledger, cluster, spec, self.spec, self.fixer, n, tools_meta=kw["tools_meta"], review_comment=comment, prev=prev)
        res = self.fixer.send(handle, self.ledger.fix_dir(cluster_id, n) / "message.md")
        attempt = dispatcher.finish_attempt(self.ledger, attempt, handle, res, comp.repo_path)
        self.emit("fix.attempt.done", cluster_id=cluster_id, attempt=n, ok=res.ok, commit=attempt.commit, checkpoint=attempt.entire_checkpoint_id, tests_green=attempt.tests_green)
        if res.ok and attempt.tests_green:
            rep = replaymod.replay_cluster(self.ledger, cluster, self.spec, handle.worktree, self.mcfg.replay_k, specs=self.specs, seed_of=self.seed_of, guard=self.guard, **kw)
            attempt.replay = rep; attempt.status = "passed" if rep.passed == rep.total else "failed"
            self.emit("replay.done", cluster_id=cluster_id, attempt=n, before=rep.before, after=rep.after)
        self.ledger.write_attempt(attempt)
        if attempt.status == "passed":
            cluster.status = "await_approval"; self.ledger.write_cluster(cluster)
            self.emit("approval.needed", cluster_id=cluster_id, attempt=n, commit=attempt.commit, before=attempt.replay.before, after=attempt.replay.after)

    def resume(self) -> None:
        """Continue an interrupted assessment from the ledger: open clusters get fixed (reusing existing fixer commits), then approval."""
        clusters = [c for c in self.ledger.clusters() if c.status in ("open", "fixing", "replaying")]
        if not clusters:
            console.print("nothing to resume; clusters are all resolved or awaiting approval"); self._maybe_finish(); return
        out = self.fix(clusters, resume=True)
        self.report(set_state=False)
        if not any(c.status == "await_approval" for c in out):
            self._maybe_finish()

    def _maybe_finish(self) -> None:
        open_ = [c for c in self.ledger.clusters() if c.status in ("open", "fixing", "replaying", "await_approval")]
        if open_:
            console.print(f"{len(open_)} clusters still open"); return
        self.finish()

    def finish(self) -> None:
        """All clusters resolved: regression suite, 'after' attack pass, report."""
        self.state("REGRESSION_SUITE")
        results = self.regress(emit=True)
        from . import db
        db.upsert_regressions(self.ledger.assessment_id, results)
        self.state("VERIFY_AFTER")
        after_runs = self._after_pass()
        rep = self.report({"regressions": results, "after": reportmod.scorecard(after_runs, self.specs)})
        before, after = rep["scorecard"], rep["after"]
        console.print(f"[bold]before {before['succeeded']}/{before['total']}  ->  after {after['succeeded']}/{after['total']}")
        self.state("DONE")

    def _after_pass(self) -> list[RunRecord]:
        """Re-run every original attack seed once against the merged main (boots it from the repo on the replay port)."""
        comp = self.spec.entry
        kw = self._grading_kw()
        runs = []
        with replaymod.ReplayTarget(self.spec, comp.repo_path, log_path=self.ledger.root / "after-target.log") as rspec:
            commit = process.target_version(comp)
            base = rspec.entry.healthcheck.rsplit("/", 1)[0]
            for rid, (a, s) in list(self.seed_of.items()):
                if not rid.startswith(a.id):   # only original attack runs
                    continue
                try:
                    httpx.post(f"{base}/preflight/reset", headers={"x-preflight-ownership": self.spec.ownership_token}, timeout=10)
                except Exception:
                    pass
                new_id = f"after-{a.id}-{s.id}-{os.urandom(3).hex()}"
                self.emit("run.started", run_id=new_id, attack_id=a.id, seed_id=s.id, kind="after")
                run, _, _ = run_one(a, s, rspec, self.ledger, self.guard, mode=self.mode, target_commit=commit, kind="regression", run_id=new_id)
                run = grade_run(self.ledger, a, s, run, **kw)
                self.seed_of[new_id] = (a, s)
                self.emit("run.graded", run_id=new_id, attack_id=a.id, failed=run.failed, kind="after",
                          failing_graders=[g for g, v in run.verdicts.items() if not v.passed])
                runs.append(run)
        return runs

    def regress(self, emit: bool = False) -> list[dict]:
        """Run every saved regression against the repo's current main."""
        regs = regressmod.load_all()
        results = []
        if not regs:
            return results
        comp = self.spec.entry
        kw = self._grading_kw()
        with replaymod.ReplayTarget(self.spec, comp.repo_path, log_path=self.ledger.root / "regress-target.log") as rspec:
            commit = process.target_version(comp)
            base = rspec.entry.healthcheck.rsplit("/", 1)[0]
            for reg in regs:
                a = self.specs.get(reg["attack_id"]) or next((x for x in catalog.load_all() if x.id == reg["attack_id"]), None)
                if a is None:
                    continue
                caught = []
                for sd in reg["seeds"]:
                    seed = _Seed.model_validate(sd)
                    try:
                        httpx.post(f"{base}/preflight/reset", headers={"x-preflight-ownership": self.spec.ownership_token}, timeout=10)
                    except Exception:
                        pass
                    rid = f"regress-{reg['cluster_id'][:24]}-{seed.id}-{os.urandom(2).hex()}"
                    run, _, _ = run_one(a, seed, rspec, self.ledger, self.guard, mode=self.mode, target_commit=commit, kind="regression", run_id=rid)
                    run = grade_run(self.ledger, a, seed, run, **kw)
                    self.seed_of[rid] = (a, seed)
                    if run.failed:
                        caught.append(run.run_id)
                res = {"cluster_id": reg["cluster_id"], "attack_id": reg["attack_id"], "fixed_by_commit": reg.get("fixed_by_commit"),
                       "seeds": len(reg["seeds"]), "failed_runs": caught, "passed": not caught, "target_commit": commit}
                if caught:
                    res["blame"] = regressmod.blame(comp.repo_path, reg, reg.get("fixed_by_commit"))
                results.append(res)
                if emit:
                    self.emit("regression.result", **res)
                console.print(f"{'[green]PASS' if not caught else '[red]REGRESSED'}[/] {reg['cluster_id']}" +
                              (f"  blame: {res['blame']['commits'][0]['sha']} {res['blame']['commits'][0]['subject']}" if caught and res.get("blame", {}).get("commits") else ""))
        (self.ledger.root / "report" / "regressions.json").write_text(json.dumps(results, indent=2, default=str))
        return results

    def report(self, extra: dict | None = None, set_state: bool = True) -> dict:
        if set_state:
            self.state("REPORT")
        rep = reportmod.write(self.ledger, self.specs, extra)
        reportmod.print_scorecard(rep["scorecard"], title=f"Assessment {self.ledger.assessment_id}")
        console.print(f"target spend ${rep['cost']['target_usd']:.4f}  preflight LLM spend ${rep['cost']['preflight_llm_usd']:.4f}  "
                      f"ledger: {self.ledger.root}")
        return rep

    def run(self) -> dict:
        self.ledger.write_manifest({"assessment_id": self.ledger.assessment_id, "state": "INIT", "preflight_llm_usd": 0.0})
        self.emit("state.changed", state="INIT")
        try:
            self.boot()
            runs = self.attack()
            runs = self.grade(runs)
            clusters = self.cluster_and_diverge(runs)
            if not self.no_fix:
                clusters = self.fix(clusters)
        except (BudgetExceeded, Stopped) as e:
            self.emit("stopped", reason=str(e)); console.print(f"[red]stopped: {e}")
            rep = self.report(); self.state("STOPPED"); return rep
        awaiting = any(c.status == "await_approval" for c in clusters)
        rep = self.report(set_state=not awaiting)
        if self.no_fix or not clusters or all(c.status in ("merged", "rejected", "needs_human") for c in clusters):
            self.state("DONE")
        return rep
