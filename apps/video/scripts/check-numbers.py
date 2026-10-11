#!/usr/bin/env python3
"""Number-consistency check for the videos and the social drafts.

Truth = docs/evidence/report-full-20261011.json (scorecard, after, clusters, fixes, cost_report, hero replay) plus a small
hand-maintained map for figures that live outside that report (second fix pass, variance passes, second model, regression
beat, cfo.ai margin). Every number-bearing phrase in the narration (narrate.py), the product-demo captions/titles
(ProductDemo.tsx), the explainer scenes (scenes/*.tsx), props.ts and the social drafts is matched against the truth; any
mismatch or stale phrase exits non-zero. Run from anywhere: `python3 apps/video/scripts/check-numbers.py`.
"""
from __future__ import annotations
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
VIDEO = ROOT / "apps" / "video"
REPORT = ROOT / "docs" / "evidence" / "report-full-20261011.json"

# ---- truth -----------------------------------------------------------------------------------------------------------
rep = json.load(open(REPORT))
sc, after, cr = rep["scorecard"], rep["after"], rep["cost_report"]
fixes = rep["fixes"]
hero = max((f for f in fixes if f.get("status") == "approved" and f.get("replay")), key=lambda f: f["replay"]["total"])
T = {
    "total": sc["total"], "before": sc["succeeded"], "after": after["succeeded"],
    "clusters": len(rep["clusters"]),
    "attempts": len(fixes),
    "fixer_attempts": sum(1 for f in fixes if f.get("author") == "fixer"),
    "human_attempts": sum(1 for f in fixes if f.get("author") == "human"),
    "approved": sum(1 for f in fixes if f.get("status") == "approved"),
    "replay_before": hero["replay"]["before"], "replay_after": hero["replay"]["after"],
    "cost_run": round(cr["cost_per_attack_run"], 3), "cost_attempt": round(cr["cost_per_fix_attempt"], 2),
    "cost_assessment": round(cr["cost_per_full_assessment"]), "attempts_per_fix": cr["attempts_per_accepted_fix"],
    "replays_per_fix": round(cr["replay_runs_per_fix"]),
    "regression_suites_run1": len(rep["regressions"]),
}
HAND = {  # STATUS.md §3 / DECISIONS.md, not in the report
    "second_pass_fixes": 2, "regression_suites_final": 16,
    "variance_before": (22, 23), "variance_after": (0, 5),
    "gpt_before": 31, "gpt_after": 5,
    "regressed": 4, "regression_suites_at_beat": 15, "regression_commit": "1bbce14",
    "margin_pct": 81, "a6_replay": ("0/2", "0/10", "10/10"), "trace_step": 8,
}
T.update(HAND)
assert T["fixer_attempts"] + T["human_attempts"] == T["attempts"]
assert T["regression_suites_run1"] == T["regression_suites_at_beat"] == T["clusters"]

WORDS = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
         "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
         "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "eighty": 80}
def norm(text: str) -> str:
    """Spell numbers as digits so one rule covers narration and captions: 'twenty-three of fifty' -> '23 of 50'."""
    def comp(m):  # twenty-three / twenty three / eighty-one
        return str(WORDS[m.group(1).lower()] + WORDS[m.group(2).lower()])
    t = re.sub(r"\b(twenty|thirty|forty|fifty|eighty)[- ](one|two|three|four|five|six|seven|eight|nine)\b", comp, text, flags=re.I)
    t = re.sub(r"\b(" + "|".join(WORDS) + r")\b", lambda m: str(WORDS[m.group(1).lower()]), t, flags=re.I)
    return t.replace("→", " -> ").replace("–", "-")

errors: list[str] = []
def fail(src: str, msg: str): errors.append(f"{src}: {msg}")

def check_text(src: str, raw: str):
    t = norm(raw)
    # X of 50 / X/50: before, after, variance, second model
    ok50 = {T["before"], T["after"], *range(T["variance_before"][0], T["variance_before"][1] + 1), *range(T["variance_after"][0], T["variance_after"][1] + 1), T["gpt_before"], T["gpt_after"]}
    for m in re.finditer(r"\b(\d+)\s*(?:of|/)\s*50\b", t):
        if int(m.group(1)) not in ok50: fail(src, f"'{m.group(0)}' not a measured x/50 figure {sorted(ok50)}")
    # hero replay
    for m in re.finditer(r"\b(\d+)\s*(?:of|/)\s*20\b", t):
        if m.group(1) != "20": fail(src, f"hero replay after is {T['replay_after']}, found '{m.group(0)}'")
    for m in re.finditer(r"\b(\d+)\s*(?:of|/)\s*4\b(?!\d)", t):
        if m.group(1) != "0": fail(src, f"hero replay before is {T['replay_before']}, found '{m.group(0)}'")
    # A6 story: 0/10 then 10/10
    for m in re.finditer(r"\b(\d+)\s*(?:of|/)\s*10\b", t):
        if m.group(1) not in ("0", "10"): fail(src, f"A6 replay is 0/10 -> 10/10, found '{m.group(0)}'")
    # root causes / clusters
    for m in re.finditer(r"\b(\d+)\s+(?:root causes|clusters)\b", t):
        if int(m.group(1)) != T["clusters"]: fail(src, f"'{m.group(0)}' != {T['clusters']} clusters")
    # fix attempts: 25 total, 23 by fixers; "N fixers" as a headcount is the stale vocabulary
    for m in re.finditer(r"\b(\d+)\s+fix attempts\b", t):
        if int(m.group(1)) != T["attempts"]: fail(src, f"'{m.group(0)}' != {T['attempts']} fix attempts")
    for m in re.finditer(r"\b(\d+)\s+by (?:Claude Code )?fixers\b", t):
        if int(m.group(1)) != T["fixer_attempts"]: fail(src, f"'{m.group(0)}' != {T['fixer_attempts']} by fixers")
    for m in re.finditer(r"\b(\d+)\s+(?:Claude Code )?fixers\b(?!,? 3 in parallel)", t):
        fail(src, f"stale vocabulary '{m.group(0)}': say 'one fixer per root cause' / '{T['attempts']} fix attempts, {T['fixer_attempts']} by fixers'")
    for m in re.finditer(r"\b(\d+)\s+approved fixes\b", t):
        if int(m.group(1)) not in (T["approved"], T["approved"] + T["second_pass_fixes"]): fail(src, f"'{m.group(0)}': {T['approved']} in run one, {T['approved'] + T['second_pass_fixes']} with the second pass")
    for m in re.finditer(r"\b(\d+)\s+fixes\b(?! \()", t):
        if int(m.group(1)) not in (T["approved"], T["approved"] + T["second_pass_fixes"]): fail(src, f"'{m.group(0)}': {T['approved']} approved fixes in run one, {T['approved'] + T['second_pass_fixes']} with the second pass")
    # regression suites: 15 at the beat, 16 final; "N permanent tests" without 'suites' is the stale vocabulary
    for m in re.finditer(r"\b(\d+)\s+(?:permanent )?(?:regression )?(?:suites|tests)\b", t):
        n = int(m.group(1))
        if "test" in m.group(0) and "suite" not in m.group(0): fail(src, f"stale vocabulary '{m.group(0)}': say 'regression suites'")
        elif n not in (T["regression_suites_at_beat"], T["regression_suites_final"]): fail(src, f"'{m.group(0)}' not in ({T['regression_suites_at_beat']}, {T['regression_suites_final']})")
    for m in re.finditer(r"\b(\d+)\s+(?:of \d+ )?(?:regression )?suites (?:failed|regressed)\b|(?<!of )\b(\d+)\s+regressed\b", t):
        n = int(m.group(1) or m.group(2))
        if n != T["regressed"]: fail(src, f"'{m.group(0)}' != {T['regressed']} regressed")
    for m in re.finditer(r"\b(\d+) of (\d+) suites\b", t):
        if (int(m.group(1)), int(m.group(2))) != (T["regressed"], T["regression_suites_at_beat"]): fail(src, f"'{m.group(0)}' != {T['regressed']} of {T['regression_suites_at_beat']}")
    # cost
    for m in re.finditer(r"\$\s?(\d+(?:\.\d+)?)", t):
        v = float(m.group(1))
        if v not in (T["cost_run"], T["cost_attempt"], float(T["cost_assessment"]), 499, 450): fail(src, f"'{m.group(0)}' not a measured cost ({T['cost_run']}, {T['cost_attempt']}, {T['cost_assessment']})")
    for m in re.finditer(r"\b(\d+) dollars\b", t):
        if int(m.group(1)) != T["cost_assessment"]: fail(src, f"'{m.group(0)}' != {T['cost_assessment']} dollars per assessment")
    for m in re.finditer(r"\b(\d+) (?:percent|%) gross margin|gross margin[^.%]{0,40}?(\d+)\s?%", t):
        if int(m.group(1) or m.group(2)) != T["margin_pct"]: fail(src, f"'{m.group(0)}' != {T['margin_pct']}% measured margin")
    if re.search(r"~\s?80\s?%", t): fail(src, "'~80%' is the estimate; the measured margin is 81%")
    for m in re.finditer(r"(?<![\d.])(\d+) attempts per accepted fix", t):
        if float(m.group(1)) != T["attempts_per_fix"]: fail(src, f"'{m.group(0)}' != {T['attempts_per_fix']}")
    for m in re.finditer(r"(\d+\.\d+) attempts per accepted fix", t):
        if float(m.group(1)) != T["attempts_per_fix"]: fail(src, f"'{m.group(0)}' != {T['attempts_per_fix']}")
    for m in re.finditer(r"\b(\d+) replay runs per fix", t):
        if int(m.group(1)) != T["replays_per_fix"]: fail(src, f"'{m.group(0)}' != {T['replays_per_fix']}")
    # trace step
    for m in re.finditer(r"\bstep (\d+)\b", t, flags=re.I):
        if int(m.group(1)) != T["trace_step"]: fail(src, f"'{m.group(0)}': the shown divergence is step {T['trace_step']} (D1-d1-exfil-email-d8c4f3)")
    # stale strings from the Oct 10 story
    for bad in ("simplify prompt assembly", "d1-indirect-injection", "b2-retry-backoff", "g3-confirm-credits", "brought the injection back", "All in parallel", "13 merge conflicts"):
        if bad in raw: fail(src, f"stale phrase '{bad}'")
    if re.search(r"\b1\s+regressed\b|\bone suite\b", t): fail(src, "regression beat regressed 4 suites, not 1")
    if re.search(r"\$37\.\d", raw): fail(src, "render $37, not $37.xx (narration says thirty-seven dollars)")

# ---- sources ---------------------------------------------------------------------------------------------------------
def narration() -> dict[str, str]:
    s = (VIDEO / "scripts" / "narrate.py").read_text()
    body = s[s.index("lines = {"): s.index("\n}\n", s.index("lines = {"))]
    return dict(re.findall(r'^\s*"([a-z0-9-]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$', body, flags=re.M))

def tsx_strings(path: pathlib.Path) -> str:
    s = path.read_text()
    s = re.sub(r"^\s*import .*$", "", s, flags=re.M)
    lits = re.findall(r'"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`', s)
    jsx = re.findall(r">([^<>{}]*[A-Za-z][^<>{}]*)<", s)
    return "\n".join(a or b for a, b in lits) + "\n" + "\n".join(jsx)

lines = narration()
assert len(lines) >= 23, f"narration parse found only {len(lines)} lines"
for k, v in lines.items(): check_text(f"narrate.py[{k}]", v)
if "step 8" not in norm(lines["ex-trace"]).lower(): fail("narrate.py[ex-trace]", "must name step 8")
for k in ("ex-regression", "pd-06", "tz-regression"):
    if "4 of 15" not in norm(lines[k]): fail(f"narrate.py[{k}]", "must say 'four of fifteen suites'")
if "23 by fixers" not in norm(lines["pd-04"]) or "25 fix attempts" not in norm(lines["pd-04"]): fail("narrate.py[pd-04]", "must say twenty-five fix attempts, twenty-three by fixers")
if "17 approved fixes" not in norm(lines["pd-08"]): fail("narrate.py[pd-08]", "must say seventeen approved fixes")

for p in sorted((VIDEO / "src" / "scenes").glob("*.tsx")) + [VIDEO / "src" / "ProductDemo.tsx", VIDEO / "src" / "Teaser.tsx"]:
    if p.exists(): check_text(p.name, tsx_strings(p))
reg = (VIDEO / "src" / "scenes" / "Regression.tsx").read_text()
for sid, seeds in (("b1-b2-b3-honesty-retry-0af0c9", 4), ("b2-b3-retry-5988d4", 2), ("d1-watchlist-0fd51c", 1), ("d1-watchlist-2884e5", 1)):
    if not re.search(rf'id: "{sid}", seeds: {seeds}, regressed: true', reg): fail("Regression.tsx", f"missing regressed suite {sid} with {seeds} seeds")
if f"REGRESSION_TOTAL_SUITES = {T['regression_suites_at_beat']}" not in reg: fail("Regression.tsx", "REGRESSION_TOTAL_SUITES")
tr = (VIDEO / "src" / "scenes" / "Trace.tsx").read_text()
if f"TRACE_DIVERGENCE_STEP = {T['trace_step']}" not in tr or "D1-d1-exfil-email-d8c4f3" not in tr: fail("Trace.tsx", "divergence step / run id")
if f"MEASURED_GROSS_MARGIN_PCT = {T['margin_pct']}" not in (VIDEO / "src" / "scenes" / "Business.tsx").read_text(): fail("Business.tsx", "margin")
pd = (VIDEO / "src" / "ProductDemo.tsx").read_text()
if "15 regression suites at the time" not in pd or "4 of 15 suites regressed" not in pd: fail("ProductDemo.tsx", "caption 06 must say 15 suites at the time, 4 of 15 regressed")
if "16 regression suites" not in pd: fail("ProductDemo.tsx", "caption 08 must say 16 regression suites")

# props.ts against the report
props = json.loads(re.search(r"defaultProps: ExplainerProps = (\{.*?\});", (VIDEO / "src" / "data" / "props.ts").read_text(), flags=re.S).group(1))
for k, want in (("before", T["before"]), ("after", T["after"]), ("total", T["total"]), ("clusters", T["clusters"]), ("fixes", T["approved"]),
                ("replayBefore", T["replay_before"]), ("replayAfter", T["replay_after"]), ("regressionCommit", T["regression_commit"])):
    if props[k] != want: fail("props.ts", f"{k}={props[k]!r} != {want!r}")
if round(props["costPerRun"], 3) != T["cost_run"] or round(props["costPerAssessment"]) != T["cost_assessment"]: fail("props.ts", "cost props")

# record script defaults
rec = (VIDEO / "scripts" / "record-dashboard.mjs").read_text()
for want in ('P0_ASSESSMENT ?? "20261011-001111-d070"', 'D1_ASSESSMENT ?? "20261011-001111-d070"', 'REGRESS_ASSESSMENT ?? "regress-20261011-020324-9852"',
             'FIX_CLUSTER ?? "a6-watchlist-0c3c1b"', 'REPLAY_CLUSTER ?? "b1-b2-b3-honesty-retry-0af0c9"'):
    if want not in rec: fail("record-dashboard.mjs", f"default {want}")

# social drafts (gitignored; checked when present)
social = ROOT / "social" / "build-in-public"
if social.exists():
    for p in sorted(social.glob("*.txt")): check_text(f"social/{p.name}", p.read_text())
    for p in sorted(social.glob("*.txt")):
        if re.search(r"\b15 fixes\b|\b15 tests\b|\b15 permanent regression tests\b", p.read_text()): fail(f"social/{p.name}", "stale vocabulary")

# README durations match the rendered files (when ffprobe and the files are there)
import shutil, subprocess
if shutil.which("ffprobe"):
    readme = (ROOT / "README.md").read_text()
    for name, label in (("preflight-product-demo.mp4", "Product demo"), ("preflight-explainer.mp4", "Explainer")):
        f = ROOT / "docs" / "videos" / name
        if f.exists():
            secs = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout.strip())
            mmss = f"{int(secs // 60)}:{int(round(secs % 60)):02d}"
            if f"[{label}, {mmss}]" not in readme: fail("README.md", f"{label} duration should read {mmss}")

if errors:
    print("\n".join(errors)); print(f"\n{len(errors)} mismatch(es)"); sys.exit(1)
print(f"numbers consistent: before {T['before']}/{T['total']} -> after {T['after']}/{T['total']}, {T['clusters']} root causes, {T['attempts']} fix attempts ({T['fixer_attempts']} fixers + {T['human_attempts']} human), {T['approved']} approved + {T['second_pass_fixes']} second pass, {T['regression_suites_at_beat']} -> {T['regression_suites_final']} suites, hero replay {T['replay_before']} -> {T['replay_after']}, ${T['cost_run']} / ${T['cost_attempt']} / ${T['cost_assessment']}, regression {T['regressed']} of {T['regression_suites_at_beat']} on {T['regression_commit']}")
