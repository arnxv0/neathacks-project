"""Read-side index over the ledger directory (mtime-cached)."""
from __future__ import annotations
from typing import Any
import json, pathlib, time
from .. import config
from ..attacks import catalog
from ..ledger import Ledger, list_assessments
from ..report.report import scorecard

_cache: dict[str, tuple[float, dict]] = {}

def _mtime(root: pathlib.Path) -> float:
    latest = 0.0
    for p in root.rglob("*.json"):
        try:
            latest = max(latest, p.stat().st_mtime)
        except FileNotFoundError:
            pass
    ev = root / "events.jsonl"
    if ev.exists():
        latest = max(latest, ev.stat().st_mtime)
    return latest

NOT_MERGED_NOTE = "[not merged:"   # written into the attempt summary by coordinator.approve() before `merged` was a field

def resolve(cluster: dict) -> None:
    """Say how a closed cluster was closed. `merged`: its approved commit is in main. `closed_by_main`: its branch
    conflicted, was not merged, and main (with the earlier approved fixes) already passed the same replay."""
    for a in cluster["attempts"]:
        if a["status"] == "approved" and a.get("merged") is None:      # ledgers written before the field existed
            a["merged"] = NOT_MERGED_NOTE not in (a.get("summary") or "")
    approved = next((a for a in cluster["attempts"] if a["status"] == "approved"), None)
    cluster["resolution"] = None if cluster["status"] != "merged" or not approved else ("merged" if approved["merged"] else "closed_by_main")

def specs() -> dict:
    return {s.id: s for s in catalog.load_all()}

def assessments() -> list[dict]:
    out = []
    for aid in list_assessments():
        led = Ledger(aid)
        m = led.manifest()
        runs = led.runs(kind="attack")
        out.append({"assessment_id": aid, "state": m.get("state"), "mode": m.get("mode"), "label": m.get("label"), "kind": m.get("kind", "assessment"),
                    "started_at": m.get("started_at"), "runs": len(runs), "succeeded": sum(1 for r in runs if r.failed),
                    "clusters": len(led.clusters()), "target_commit": m.get("target_commit")})
    return out

def summary(aid: str) -> dict:
    led = Ledger(aid)
    root = led.root
    mt = _mtime(root)
    hit = _cache.get(aid)
    if hit and hit[0] == mt:
        return hit[1]
    m = led.manifest()
    sp = specs()
    attack_runs = led.runs(kind="attack")
    all_runs = led.runs()
    sc = scorecard(attack_runs, sp)
    # An assessment can run the after pass more than once (it re-runs after late approvals). The scorecard shows the
    # latest pass only: the newest after-run per (attack, seed), not the sum of every pass.
    latest: dict[tuple[str, str], Any] = {}
    for r in sorted((r for r in all_runs if r.run_id.startswith("after-")), key=lambda r: r.started_at):
        latest[(r.attack_id, r.seed_id)] = r
    after_runs = list(latest.values())
    after = scorecard(after_runs, sp) if after_runs else None
    clusters = []
    for c in led.clusters():
        d = c.model_dump()
        d["attempts"] = [a.model_dump() for a in led.attempts(c.cluster_id)]
        d["attack_name"] = sp[c.attack_ids[0]].name if c.attack_ids[0] in sp else c.attack_ids[0]
        d["owasp"] = sp[c.attack_ids[0]].owasp if c.attack_ids[0] in sp else None
        resolve(d)
        clusters.append(d)
    reg_path = root / "report" / "regressions.json"
    regressions = json.loads(reg_path.read_text()) if reg_path.exists() else []
    fix_cost = sum(a["cost_usd"] for c in clusters for a in c["attempts"])
    data = {"assessment_id": aid, "manifest": m, "scorecard": sc, "after": after, "clusters": clusters,
            "runs": [{**r.model_dump(exclude={"tool_calls"}), "tool_names": [t.get("name") for t in r.tool_calls]} for r in all_runs],
            "regressions": regressions,
            "cost": {"target_usd": sum(r.usd for r in all_runs), "preflight_llm_usd": m.get("preflight_llm_usd", 0.0), "fixer_usd": fix_cost,
                     "cap_usd": (m.get("caps") or {}).get("max_usd"), "runs": len(all_runs)},
            "attacks": {k: {"id": v.id, "name": v.name, "family": v.family, "owasp": v.owasp, "tier": v.tier, "safe_behavior": v.safe_behavior,
                            "description": v.description} for k, v in sp.items()}}
    _cache[aid] = (mt, data)
    return data

def run_detail(aid: str, run_id: str) -> dict:
    led = Ledger(aid)
    d = led.run_dir(run_id)
    run = led.read_run(run_id)
    steps = [s.model_dump() for s in led.read_steps(run_id)]
    transcript = (d / "transcript.md").read_text() if (d / "transcript.md").exists() else ""
    return {"run": run.model_dump(), "steps": steps, "transcript": transcript}

def cluster_detail(aid: str, cluster_id: str) -> dict:
    led = Ledger(aid)
    c = led.read_cluster(cluster_id)
    cdir = led.root / "clusters" / cluster_id
    out = c.model_dump()
    out["divergence_md"] = (cdir / "divergence.md").read_text() if (cdir / "divergence.md").exists() else ""
    out["graph_md"] = (cdir / "graph.md").read_text() if (cdir / "graph.md").exists() else ""
    out["attempts"] = []
    for a in led.attempts(cluster_id):
        ad = a.model_dump()
        fdir = led.fix_dir(cluster_id, a.n)
        ad["diff"] = (fdir / "diff.patch").read_text() if (fdir / "diff.patch").exists() else ""
        ad["checkpoint_md"] = (fdir / "checkpoint.md").read_text() if (fdir / "checkpoint.md").exists() else ""
        ad["brief"] = (fdir / "brief.md").read_text() if (fdir / "brief.md").exists() else ""
        ad["replay_runs"] = [led.read_run(r).model_dump(exclude={"tool_calls"}) for r in (a.replay.run_ids if a.replay else []) if (led.root / "runs" / r / "run.json").exists()]
        out["attempts"].append(ad)
    resolve(out)
    fail_steps = [s.model_dump() for s in led.read_steps(c.run_ids[0])] if c.run_ids else []
    pass_steps = [s.model_dump() for s in led.read_steps(c.divergence.run_pass)] if c.divergence and c.divergence.run_pass else []
    out["fail_steps"], out["pass_steps"] = fail_steps, pass_steps
    sp = specs().get(c.attack_ids[0])
    out["attack"] = {"id": sp.id, "name": sp.name, "owasp": sp.owasp, "safe_behavior": sp.safe_behavior, "description": sp.description} if sp else None
    return out
