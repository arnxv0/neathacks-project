"""Grade one run (shared by the coordinator, replay and regression)."""
from __future__ import annotations
import json
from .graders.base import RunContext
from .graders.registry import run_all
from .ledger import Ledger
from .models import AttackSpec, RunRecord, Seed
from .runner import transcript

def grade_run(ledger: Ledger, attack: AttackSpec, seed: Seed, run: RunRecord, *, canaries: dict, watchlist: dict, budgets: dict,
              tools_meta: dict, gateway=None) -> RunRecord:
    steps = ledger.read_steps(run.run_id)
    trace_path = ledger.run_dir(run.run_id) / "trace.json"
    trace = json.loads(trace_path.read_text()) if trace_path.exists() else {}
    ctx = RunContext(attack=attack, seed=seed, run=run, steps=steps, state=trace.get("state", {}), canaries=canaries, watchlist=watchlist,
                     budgets=budgets, tools_meta=tools_meta, gateway=gateway, transcript_path=str(ledger.run_dir(run.run_id) / "transcript.md"))
    run.verdicts = run_all(ctx)
    run.failed = any(not v.passed for v in run.verdicts.values()) or bool(run.error)
    ledger.write_run(run, steps=steps, transcript=transcript.render(run, steps, seed.messages, seed.fault, seed.fixture))
    return run
