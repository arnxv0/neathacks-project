"""One run: attack x seed against the target, through the chaos proxy, into the ledger."""
from __future__ import annotations
import datetime as dt, time, uuid
import httpx
from .. import config
from ..guard.guard import Guard
from ..ledger import Ledger
from ..models import AttackSpec, RunRecord, Seed, Step
from ..target.loader import SystemSpec
from ..traces import mirror, neatlogs_client, normalize
from . import transcript

def new_run_id(attack: AttackSpec, seed: Seed) -> str:
    return f"{attack.id}-{seed.id}-{uuid.uuid4().hex[:6]}"

def run_one(attack: AttackSpec, seed: Seed, spec: SystemSpec, ledger: Ledger, guard: Guard, *, mode: str,
            target_commit: str, kind: str = "attack", gateway=None, run_id: str | None = None) -> tuple[RunRecord, list[Step], dict]:
    comp = spec.entry
    run_id = run_id or new_run_id(attack, seed)
    headers = {"content-type": "application/json", "X-Preflight-Run-Id": run_id, "X-Preflight-Attack-Id": attack.id,
               "X-Preflight-Seed": seed.id, "X-Preflight-Fault": seed.fault or "", "X-Preflight-Fixture": seed.fixture or "",
               "X-Preflight-Target": "company_lookup"}
    try:
        import neatlogs
        neatlogs.inject_trace_context(headers)
    except Exception:
        pass
    guard.check_url(comp.chat_endpoint)
    started = time.time()
    run = RunRecord(run_id=run_id, assessment_id=ledger.assessment_id, attack_id=attack.id, seed_id=seed.id, target_commit=target_commit,
                    mode=mode, started_at=dt.datetime.utcnow().isoformat(), kind=kind)
    session_id = f"s-{run_id}"
    messages = list(seed.messages)
    turns = 0
    history: list[dict] = []
    trace_id = None
    try:
        while turns < max(1, attack.max_turns if attack.multi_turn else len(messages)):
            if turns < len(messages):
                msg = messages[turns]
            elif attack.multi_turn and gateway is not None:
                from ..llm.attacker import next_turn
                msg = next_turn(gateway, attack, seed, history)
                if not msg:
                    break
            else:
                break
            guard.acquire()
            r = httpx.post(comp.chat_endpoint, json={"session_id": session_id, "tenant_id": seed.tenant_id, "user_role": seed.persona, "message": msg},
                           headers=headers, timeout=config.CFG.guard.run_timeout_s)
            if r.status_code != 200:
                run.error = f"HTTP {r.status_code}: {r.text[:300]}"
                break
            data = r.json()
            trace_id = data.get("neatlogs_trace_id") or trace_id
            run.reply = data.get("reply", "")
            run.tool_calls += data.get("tool_calls", [])
            run.steps += int(data.get("steps", 0))
            u = data.get("usage", {})
            run.tokens_in += int(u.get("input_tokens", 0)); run.tokens_out += int(u.get("output_tokens", 0))
            usd = float(u.get("usd", 0.0)); run.usd += usd
            guard.add_spend(usd)
            history += [{"role": "user", "content": msg}, {"role": "assistant", "content": run.reply}]
            turns += 1
    except httpx.TimeoutException:
        run.error = "timeout"
    run.duration_ms = int((time.time() - started) * 1000)
    raw = mirror.steps(comp, run_id)
    steps = normalize.normalize(raw)
    state = mirror.state(comp, run_id)
    run.neatlogs_trace_id = trace_id
    run.neatlogs_url = neatlogs_client.trace_url(trace_id, run_id)
    ledger.write_run(run, steps=steps, transcript=transcript.render(run, steps, seed.messages, seed.fault, seed.fixture),
                     trace={"mirror": raw, "state": state})
    return run, steps, state
