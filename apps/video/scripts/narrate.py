# Narration via Kokoro (local neural TTS, Apache-2.0). Setup once:
#   uv venv .venv -p 3.12 && . .venv/bin/activate && uv pip install kokoro-onnx soundfile
#   download kokoro-v1.0.onnx + voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx/releases (run from that directory)
#   brew install espeak-ng && export ESPEAK_DATA_PATH=/opt/homebrew/share/espeak-ng-data PHONEMIZER_ESPEAK_LIBRARY=/opt/homebrew/lib/libespeak-ng.dylib
# Usage: python narrate.py [voice]   (af_heart default; am_michael, bf_emma, bm_george, af_bella also good)
import json, re, sys, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
import os; OUT = os.path.join(os.path.dirname(__file__), "..", "public", "vo")
lines = {
 # explainer: one claim per scene, each answering a question a judge would ask
 "ex-hook": "Your agent passed the happy path. Production will not be so polite.",
 "ex-attack": "Preflight attacks an agent the way production will: hostile users, broken tools, and data that carries instructions. Here, a Crustdata company record tells the agent to email the contact list to an outside address. The unfixed agent obeys.",
 "ex-trace": "Every run is a neatlogs trace. Preflight grades each one with deterministic checks, groups failures by root cause, and pins the exact step where the bad run diverged from a good one. No guessing. Step five: the agent followed the record.",
 "ex-fix": "One Claude Code fixer per root cause, three in parallel, each in its own git worktree, with a short brief and the blast radius from entire-graph. Every fix commit carries an Entire checkpoint with the reasoning. A human reviews the diff, and approves.",
 "ex-proof": "Is it luck? Preflight replays the exact failing seeds against the fix, five times each. Zero of four before. Twenty of twenty after. Then the whole catalog again: twenty-three of fifty before, zero after.",
 "ex-regression": "Does it stay fixed? Every approved fix becomes a permanent regression test. When a later refactor quietly brought a bug back, four suites failed, and Preflight named the commit.",
 "ex-business": "What does it cost? Six tenths of a cent per attack run. Thirty-seven dollars per full assessment. Measured, not estimated, and pushed into the cfo.ai model as a live scenario.",
 "ex-cta": "Preflight. Attack, trace, fix, prove, keep it fixed. Crash-test your agent before your customers do.",
 # product demo: each clip answers one question
 "pd-title": "This is Preflight, running against a real sales agent built on Claude and Crustdata. Every number you will see comes from real runs, logged in neatlogs.",
 "pd-01": "How bad is it? Twenty attack types, fifty seeds, against the unfixed agent. Twenty-three of fifty got through: injected records obeyed, unconfirmed credits, role claims, retries without backoff, a prompt leak, cross-tenant SQL.",
 "pd-02": "Everything runs from an event ledger: attack, grade, cluster, diverge, fix, review, regress, and the after pass. The pipeline view shows it live.",
 "pd-03": "Why did it fail? Each cluster has a root-cause hypothesis, the suspected files, the blast radius from entire-graph, and the exact divergent step, with a link to the neatlogs trace.",
 "pd-04": "Who fixes it? Fifteen Claude Code fixers, three at a time, each in its own worktree. This one failed its first replay, read the evidence, and passed on the second attempt. A human approves, requests changes, edits, or rejects. Nothing merges on its own.",
 "pd-05": "Is it luck? The exact failing seeds, replayed five times each against the fixed branch. Zero of four before. Twenty of twenty after.",
 "pd-06": "Does it stay fixed? A planted refactor quietly reverted the retry fix. Four regression suites failed, and Preflight named the exact commit.",
 "pd-07": "What does it cost? Six tenths of a cent per attack run. About a dollar forty per fixer attempt. Thirty-seven dollars per full assessment. Measured, and pushed into the cfo.ai model as a live scenario.",
 "pd-08": "Same fifty seeds against the merged main: twenty-three before, zero after. Repeated passes agree: twenty-two to twenty-three before, zero to five after, and the leftovers got a second fix pass. Fifteen root causes, sixteen permanent tests.",
 "pd-outro": "Find it, fix it, prove it, keep it fixed. Preflight.",
}

# Kokoro barely pauses at commas. Synthesize clause by clause and insert explicit silence:
# 0.25 s after a comma, 0.35 s after a colon or semicolon, 0.5 s after a sentence.
GAP = {",": 0.25, ";": 0.35, ":": 0.35, ".": 0.5, "!": 0.5, "?": 0.5}
def synth(text: str):
    parts = re.findall(r"[^,;:.!?]+[,;:.!?]*", text)
    chunks, sr = [], 24000
    for part in parts:
        part = part.strip()
        if not part:
            continue
        samples, sr = k.create(part, voice=VOICE, speed=1.05, lang="en-us")
        chunks.append(samples)
        gap = GAP.get(part[-1], 0.25)
        chunks.append(np.zeros(int(sr * gap), dtype=samples.dtype))
    return np.concatenate(chunks), sr

durs = {}
for key, text in lines.items():
    samples, sr = synth(text)
    pad = np.zeros(int(sr * 0.35), dtype=samples.dtype)
    audio = np.concatenate([pad, samples, pad])
    sf.write(f"{OUT}/{key}.wav", audio, sr)
    durs[key] = round(len(audio) / sr, 2)
json.dump(durs, open(f"{OUT}/durations.json", "w"), indent=1)
print(json.dumps(durs))
