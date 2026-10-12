#!/usr/bin/env python3
"""Independent audit: recompute what the dashboard shows from the RAW ledger files (verdicts.json, steps.jsonl, run.json,
llm_calls.jsonl) without importing Preflight, and compare with the stored cluster/fix records and with the API.
Usage: python3 scripts/audit-ledger.py <assessment_id> [--api http://localhost:8200] [--ledger ledger]"""
import argparse, collections, hashlib, json, pathlib, sys, urllib.request

ap = argparse.ArgumentParser(); ap.add_argument("aid"); ap.add_argument("--api"); ap.add_argument("--ledger", default="ledger")
ap.add_argument("--user"); ap.add_argument("--password"); a = ap.parse_args()
root = pathlib.Path(a.ledger) / a.aid
bad = []; ok = 0
def check(name, got, want):
    global ok
    if got == want: ok += 1
    else: bad.append(f"{name}: raw files say {want!r}, record/API says {got!r}")
jl = lambda p: [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []

runs = {}
for d in sorted((root / "runs").iterdir()):
    r = json.loads((d / "run.json").read_text()); v = json.loads((d / "verdicts.json").read_text()) if (d / "verdicts.json").exists() else {}
    v = v.get("verdicts", v) if isinstance(v, dict) else {x["grader"]: x for x in v}
    r["_verdicts"] = v; r["_steps"] = jl(d / "steps.jsonl")
    r["_failed"] = any(not x.get("passed") for x in v.values()) or bool(r.get("error"))
    check(f"run {d.name} failed flag", r["failed"], r["_failed"])
    runs[r["run_id"]] = r
attack = [r for r in runs.values() if r["kind"] == "attack"]
before = (sum(r["_failed"] for r in attack), len(attack))

# clusters, recomputed: family | failing graders | tool sequence up to the first violating step
fam = lambda r: r["attack_id"][0]
groups = collections.defaultdict(lambda: {"runs": [], "attacks": set(), "graders": set()})
for r in attack:
    if not r["_failed"]: continue
    failing = sorted(g for g, x in r["_verdicts"].items() if not x.get("passed"))
    first = min([x["violation_step"] for x in r["_verdicts"].values() if not x.get("passed") and x.get("violation_step") is not None], default=None)
    seq = [s.get("tool") or "?" for s in r["_steps"] if s.get("type") == "tool_call" and (first is None or s["i"] <= first)]
    err = f"|error:{r['error'].split(':')[0].strip()}" if r.get("error") else ""
    key = f"{fam(r)}|{','.join(failing)}|{'>'.join(seq)}{err}"
    g = groups[key]; g["runs"].append(r["run_id"]); g["attacks"].add(r["attack_id"]); g["graders"] |= set(failing)
mine = {}
for key, g in groups.items():
    cid = f"{'-'.join(sorted(g['attacks']))}-{'-'.join(sorted(g['graders']))}-{hashlib.sha1(key.encode()).hexdigest()[:6]}".lower()
    mine[cid] = sorted(g["runs"])
stored = {}
for d in sorted((root / "clusters").iterdir()) if (root / "clusters").exists() else []:
    c = json.loads((d / "cluster.json").read_text()); stored[c["cluster_id"]] = c
check("cluster ids", sorted(stored), sorted(mine))
for cid, members in mine.items():
    if cid in stored:
        check(f"cluster {cid} members", sorted(stored[cid]["run_ids"]), members)
        dv = stored[cid].get("divergence") or {}
        if dv.get("run_fail"): check(f"cluster {cid} divergence failing run is a member", dv["run_fail"] in members, True)
        if dv.get("run_pass") and dv["run_pass"] in runs: check(f"cluster {cid} divergence passing run really passed", runs[dv["run_pass"]]["_failed"], False)

# fixes: every attempt's replay score, recounted from the replay runs it lists
fixes = {}
for d in sorted((root / "fixes").iterdir()) if (root / "fixes").exists() else []:
    for ad in sorted(d.glob("attempt-*")):
        at = json.loads((ad / "attempt.json").read_text()); rp = at.get("replay")
        fixes.setdefault(d.name, []).append(at)
        if not rp: continue
        ids = rp.get("run_ids") or []
        missing = [i for i in ids if i not in runs]
        check(f"fix {d.name} attempt {at['n']} replay runs exist", missing, [])
        passed = sum(not runs[i]["_failed"] for i in ids if i in runs)
        check(f"fix {d.name} attempt {at['n']} replay score", f"{rp.get('passed')}/{rp.get('total')}", f"{passed}/{len(ids)}")
        if at.get("commit") and at.get("merged") is not False:    # a branch that was not merged is re-checked on main, by design
            check(f"fix {d.name} attempt {at['n']} replay ran on the fix commit", {runs[i]["target_commit"][:7] for i in ids if i in runs} <= {at["commit"][:7]}, True)

# after-pass: the latest run per (attack, seed)
after_runs = collections.defaultdict(list)
for r in runs.values():
    if r["run_id"].startswith("after-"): after_runs[(r["attack_id"], r["seed_id"])].append(r)
latest = [max(v, key=lambda r: r["started_at"]) for v in after_runs.values()]
after = (sum(r["_failed"] for r in latest), len(latest))

spend = collections.defaultdict(float)
for r in runs.values(): spend[r["kind"]] += r.get("usd") or 0
llm = sum((c.get("usd") or 0) for c in jl(root / "llm_calls.jsonl"))

print(f"assessment {a.aid}: {len(runs)} runs on disk")
print(f"  before  {before[0]}/{before[1]} attacks got through")
print(f"  after   {after[0]}/{after[1]}" if latest else "  after   (no after-pass yet)")
print(f"  clusters {len(mine)}: " + ", ".join(f"{c} ({len(m)})" for c, m in sorted(mine.items())))
for cid, ats in fixes.items():
    print(f"  fix {cid}: " + "; ".join(f"#{t['n']} {t.get('status')} replay {(t.get('replay') or {}).get('before')}->{(t.get('replay') or {}).get('after')}" for t in ats))
print(f"  target spend by kind: " + ", ".join(f"{k} ${v:.4f}" for k, v in sorted(spend.items())) + f"; preflight LLM ${llm:.4f}")

if a.api:
    req = urllib.request.Request(f"{a.api}/api/assessments/{a.aid}")
    if a.user:
        import base64; req.add_header("Authorization", "Basic " + base64.b64encode(f"{a.user}:{a.password}".encode()).decode())
    s = json.load(urllib.request.urlopen(req, timeout=30))
    sc = s["scorecard"]; check("API scorecard before", (sc["succeeded"], sc["total"]), before)
    for aid_, row in sc["by_attack"].items():
        mineA = [r for r in attack if r["attack_id"] == aid_]
        check(f"API scorecard {aid_}", (row["succeeded"], row["runs"]), (sum(r["_failed"] for r in mineA), len(mineA)))
    if s.get("after") and latest: check("API scorecard after", (s["after"]["succeeded"], s["after"]["total"]), after)
    check("API cluster ids", sorted(c["cluster_id"] for c in s["clusters"]), sorted(mine))
    for c in s["clusters"]:
        if c["cluster_id"] in mine: check(f"API cluster {c['cluster_id']} size", len(c.get("run_ids") or []), len(mine[c["cluster_id"]]))
    print("  API cost block:", json.dumps(s.get("cost"))[:400])
print(f"\n{ok} checks passed, {len(bad)} mismatches")
for b in bad: print("  MISMATCH", b)
sys.exit(1 if bad else 0)
