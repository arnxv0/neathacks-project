"""cost_report.csv: measured COGS in the same variable names as cfo/assumptions.csv."""
from __future__ import annotations
import csv, datetime as dt
from .. import config
from ..ledger import Ledger

def write(ledger: Ledger) -> dict:
    runs = ledger.runs()
    attack_runs = [r for r in runs if r.kind == "attack"]
    replay_runs = [r for r in runs if r.kind in ("replay", "regression")]
    m = ledger.manifest()
    clusters = ledger.clusters()
    attempts = [a for c in clusters for a in ledger.attempts(c.cluster_id)]
    merged = [c for c in clusters if c.status == "merged"]
    target_usd = sum(r.usd for r in runs)
    preflight_usd = float(m.get("preflight_llm_usd", 0.0))
    fixer_usd = sum(a.cost_usd for a in attempts)
    n_attack = max(1, len(attack_runs))
    rows = [
        ("cogs", "cost_per_attack_run", round((sum(r.usd for r in attack_runs) + preflight_usd * 0.6) / n_attack, 5), "USD/run", "target model + attacker/judge share, ledger + neatlogs"),
        ("cogs", "analyst_per_assessment", round(preflight_usd * 0.4, 4), "USD", "analyst + cluster merge calls, approximated as 40% of Preflight LLM spend"),
        ("cogs", "cost_per_fix_attempt", round(fixer_usd / len(attempts), 4) if attempts else 0.0, "USD/attempt", "Claude Code fixer sessions (fixer logs)"),
        ("cogs", "attempts_per_accepted_fix", round(sum(len(ledger.attempts(c.cluster_id)) for c in merged) / len(merged), 2) if merged else 0.0, "ratio", "ledger"),
        ("cogs", "replay_runs_per_fix", round(len(replay_runs) / len(clusters), 1) if clusters else 0.0, "runs", "ledger"),
        ("cogs", "cost_per_full_assessment", round(target_usd + preflight_usd + fixer_usd, 4), "USD", f"{len(attack_runs)} attack runs, {len(replay_runs)} replay runs, {len(attempts)} fix attempts"),
        ("cogs", "target_model_usd_paid_by_customer", round(target_usd, 4), "USD", "excluded from Preflight COGS in production"),
        ("meta", "assessment_id", ledger.assessment_id, "", m.get("mode", "")),
        ("meta", "measured_at", dt.datetime.utcnow().isoformat(), "", "replace the estimates in cfo/assumptions.csv with these"),
    ]
    out_dir = ledger.root / "report"; out_dir.mkdir(exist_ok=True)
    for path in (out_dir / "cost_report.csv", config.OUT_DIR / "cost_report.csv"):
        path.parent.mkdir(exist_ok=True)
        with path.open("w", newline="") as f:
            w = csv.writer(f); w.writerow(["section", "variable", "measured", "unit", "source"]); w.writerows(rows)
    return {r[1]: r[2] for r in rows}
