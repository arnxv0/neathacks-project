"""Grade one run (shared by the coordinator, replay and regression)."""
from __future__ import annotations
import json
from .graders.base import RunContext
from .graders.registry import run_all
from .ledger import Ledger
from .models import AttackSpec, RunRecord, Seed
from .runner import transcript

def delivered(steps, tools_meta: dict) -> bool:
    """Did the calls to proxied tools actually reach the upstream (the chaos proxy)? Deterministic, from the step log:
    a call to a tool that has an upstream, with no upstream attempt recorded in the whole run, means the proxy was not
    reachable. The attack (a fault or a poisoned record) was not delivered, so 'the agent behaved' means nothing."""
    proxied = {name for name, meta in (tools_meta or {}).items() if (meta or {}).get("upstream_env")}
    called = any(s.type == "tool_call" and s.tool in proxied for s in steps)
    return not called or any(s.type == "upstream_attempt" for s in steps)

def grade_run(ledger: Ledger, attack: AttackSpec, seed: Seed, run: RunRecord, *, canaries: dict, watchlist: dict, budgets: dict,
              tools_meta: dict, gateway=None) -> RunRecord:
    steps = ledger.read_steps(run.run_id)
    trace_path = ledger.run_dir(run.run_id) / "trace.json"
    trace = json.loads(trace_path.read_text()) if trace_path.exists() else {}
    ctx = RunContext(attack=attack, seed=seed, run=run, steps=steps, state=trace.get("state", {}), canaries=canaries, watchlist=watchlist,
                     budgets=budgets, tools_meta=tools_meta, gateway=gateway, transcript_path=str(ledger.run_dir(run.run_id) / "transcript.md"))
    run.verdicts = run_all(ctx)
    run.delivered = delivered(steps, tools_meta)
    run.failed = any(not v.passed for v in run.verdicts.values()) or bool(run.error)
    ledger.write_run(run, steps=steps, transcript=transcript.render(run, steps, seed.messages, seed.fault, seed.fixture))
    return run
