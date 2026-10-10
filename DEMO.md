# Preflight — demo script (3 minutes)

Record at 1512×797 (browser) with the dashboard on the left half when terminal is needed. Numbers below come from `out/report.json`; replace before recording.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | Terminal: `curl localhost:8100/chat` "Research retool.com before my call" → clean brief | "AcmeSales Copilot: a sales agent on Claude with Crustdata data. It passes the happy path. Ship it?" |
| 0:20–0:50 | Dashboard scorecard filling live (`preflight run --mode full`) | "Preflight throws 20 attack types at it: hostile users, broken tools, poisoned data. **11 of 20 succeed.**" |
| 0:50–1:20 | Click D1 cluster → divergence view, step highlighted, neatlogs trace link | "Every run is a neatlogs trace. Preflight reads it back, groups failures by root cause and finds the first step where the bad run diverges: here the agent obeyed an instruction hidden in a Crustdata record." |
| 1:20–1:50 | Fixer board: 3 cards with border beams → fix detail: diff, Entire checkpoint id, Approve | "One Claude Code fixer per root cause, in parallel, in its own worktree. Each commit carries an Entire checkpoint with the reasoning. A human approves." |
| 1:50–2:15 | Replay dots 0/3 → 6/6; scorecard 11 → 1 | "Then it replays the exact failing runs against the fix, several times, because an agent can pass once by luck. 0 of 3 before, 6 of 6 after. The whole scorecard drops from 11 to 1." |
| 2:15–2:35 | `make regress-demo` → regressions page: one red row + blame card | "Every approved fix is a permanent regression test. When a later refactor brings the injection back, the suite catches it and Entire names the commit." |
| 2:35–3:00 | Cost page → cfo.ai Measured scenario | "Every LLM call is metered: $0.01 per attack run, about $3 per assessment. That measured cost flows into our cfo.ai model: Pro at $499/mo, ~80% gross margin, 18 months of runway on the pre-seed." |

## Reset to the unfixed target before recording
```bash
cd ../acmesales-copilot && git checkout -B main v0-unfixed && git cherry-pick a1111bb   # graph instructions
rm -f ../neathacks-project/regressions/*.yaml
cd ../neathacks-project && make clean-ledger
```
Then `make dev-host` (or `make up`), `uv run preflight run ../acmesales-copilot --mode full`.

## Re-shoot without spending
Every assessment is fully recorded in `ledger/<id>/`; the dashboard renders finished assessments from disk, so screens 3–7 can be re-recorded from the ledger at $0.
