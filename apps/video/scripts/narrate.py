import json, sys, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
import os; OUT = os.path.join(os.path.dirname(__file__), "..", "public", "vo")
lines = {
 # explainer
 "ex-hook": "Your agent passed the happy path. Now meet the users who didn't read it.",
 "ex-attack": "Preflight attacks an AI agent the way production will: hostile users, broken tools, and data that carries instructions. Here, a company record from Crustdata tells the agent to email the contact list to an outside address.",
 "ex-trace": "Every run is a neatlogs trace. Preflight reads it back, grades it with deterministic checks, groups failures by root cause, and finds the first step where the bad run diverged. Step five: the agent obeyed the record.",
 "ex-fix": "One Claude Code fixer per root cause, in parallel, each in its own worktree. Every commit carries an Entire checkpoint with the reasoning. A human reviews and approves.",
 "ex-proof": "Then it replays the exact failing runs against the fix, several times, because an agent can pass once by luck. Zero of three before. Six of six after. The scorecard drops.",
 "ex-regression": "Every approved fix becomes a permanent regression test. When a later refactor brings the bug back, the suite catches it and Entire names the commit.",
 "ex-business": "Every call is metered. Measured cost per run and per assessment flows into the cfo.ai model: pricing, margin, runway.",
 "ex-cta": "Preflight. Attack, trace, fix, prove. Crash-test your agent before your customers do.",
 # product demo
 "pd-title": "This is Preflight running against a real sales agent built on Claude and Crustdata. Everything you'll see came from real runs.",
 "pd-01": "Twenty attack types, fifty seeds. On the first pass, eight of twenty got through: unconfirmed credits, role claims, retries without backoff, a prompt leak.",
 "pd-02": "The pipeline view shows every stage live from the event ledger: attack, grade, cluster, diverge, fix, review, regress, and the after pass.",
 "pd-03": "Each cluster has a root-cause hypothesis, the suspected files, the blast radius from entire-graph, and the exact step where the run went wrong, with a link to the neatlogs trace.",
 "pd-04": "A Claude Code fixer worked from a short brief in its own worktree. Here's the diff: three attempts max, exponential backoff, Retry-After honored. A human approves, requests changes, edits, or rejects.",
 "pd-05": "Proof: the exact failing seeds replayed against the fixed branch. Zero of one before, two of two after.",
 "pd-06": "A planted refactor brought the injection back. The regression suite caught it and blamed the commit.",
 "pd-07": "Cost per attack run, fixer spend, and the budget guard. These numbers go straight into the cfo.ai measured scenario.",
 "pd-08": "The hero attack, indirect injection through a company record: three of three before, zero of three after.",
 "pd-outro": "Find it, fix it, prove it, keep it fixed. Preflight.",
}
durs = {}
for key, text in lines.items():
    samples, sr = k.create(text, voice=VOICE, speed=1.05, lang="en-us")
    pad = np.zeros(int(sr * 0.35), dtype=samples.dtype)
    audio = np.concatenate([pad, samples, pad])
    sf.write(f"{OUT}/{key}.wav", audio, sr)
    durs[key] = round(len(audio) / sr, 2)
json.dump(durs, open(f"{OUT}/durations.json", "w"), indent=1)
print(json.dumps(durs))
