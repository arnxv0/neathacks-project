# Preflight — neatHack 2026 build log

**Project:** Preflight — an agent that crash-tests other AI agents before launch (attack → trace → fix → prove).
**Team:** Arnav Dewan (solo).
**Repos:** this one (Preflight) and [acmesales-copilot](https://github.com/arnxv0/acmesales-copilot) (the demo target; after v0 only Preflight's fixers commit to it).
**Stack:** Python 3.12 / FastAPI / uv; Next.js 16 + shadcn + Aceternity + Magic UI; Claude via LiteLLM (hackathon gateway) with Bedrock as a switch; neatlogs SDK + public API; Entire CLI (checkpoints, blame); Crustdata company enrichment; cfo.ai (business model via Ari + MCP); Orchestrator.inc `ao` as an optional fixer backend; Docker Compose.

## How the three required tools change outcomes

- **neatlogs** — every target turn and every Preflight LLM call is a trace (`session_id = run_id` bridges them). Trace links sit on every cluster and divergence step; token/cost numbers from spans feed the cost grader and `cost_report.csv`; before/after traces are the evidence a fix worked.
- **Entire** — the target repo runs `entire enable --agent claude-code`. Each fixer commit carries an `Entire-Checkpoint` trailer; the dashboard shows the checkpoint and its explanation; `entire why`/`blame` names the commit that reintroduces a regression.
- **cfo.ai** — `BUSINESS.md` + `cfo/assumptions.csv` build the model with Ari; after a full run, the measured COGS in `out/cost_report.csv` replaces the estimates in a “Measured” scenario through the cfo.ai MCP server.

## Build log

### 2026-10-10 (Sat)
- Verified every sponsor API from this machine. Gotchas recorded in `DECISIONS.md`: neatlogs public reads need a service-account token, Crustdata legacy endpoints are closed, Bedrock needs the Anthropic use-case form, neatlogs SDK needs Python < 3.14.
- Built the target (AcmeSales Copilot) with realistic seeded weaknesses; first real chat through Crustdata + Haiku on LiteLLM worked.
- **Found:** this network's safebrowse filter intercepts `ingest.neatlogs.com` on port 443, so spans cannot leave this machine. Grading never depended on it (local step mirror); trace ids are still captured. To unblock: disable the filter or use another network.
- Susceptibility probe (3 seeds × D1/D2 on nova-lite and claude-haiku): Haiku fell to 3/3 D1 seeds once poisoned records read like synced ops notes. Target stays on Haiku.
- First full loop on D1: 3 clusters → 3 parallel Claude Code fixers → every fix passed replay 0/1 → 2/2 → approved from the API → merged → regression test saved. The fixer diff was the right one (tool output framed as untrusted data, provider text fenced).
- Entire: commits carry checkpoint trailers, but checkpoint data wasn't condensed when the fixer committed inside a git worktree (`no files modified during session`). Testing shared clones as the fallback.
- Dashboard: Next.js scorecard, clusters/divergence with neatlogs links, fixer board, fix detail with replay proof, checkpoint panel, diff, review actions, regressions, cost.
- Approvals through the dashboard: first fix merged; the other two conflicted with it, so Preflight replayed their clusters against main, found main already passed, and recorded them as fixed (a "recovery from a failed action" the judges asked for). Regression suite 3/3 holding; after-pass **3/3 → 0/3**.
- Breadth: all 20 P0 attacks (50 seeds) run find-only on the fixed main: 8/20 still succeed (retries without backoff, unconfirmed credits, role claims, prompt leak, crash on empty input). The analyst merged 5 signature clusters into 3 root causes; 3 fixers dispatched in parallel.
- Entire: commit condensation hangs in Entire's post-commit hook during agent sessions, so Preflight now commits on the fixer's behalf after the session ends (trailer kept, no hang). entire-graph installed: `impact`/`search` output (blast radius, co-change coupling between `crustdata.py` and `system.md`) goes into every fixer brief and the cluster view.
- Remotion explainer (`apps/video`): 8 scenes, numbers injected from `out/report.json` (`make video`). First render done.
- Evening: P0 fixers (3 in parallel) → authority/confirmation fix **0/3 → 6/6** merged; prompt-leak fix failed replay on attempt 1 (prompt-only change), fixer got the failing transcripts back and passed **0/1 → 2/2** on attempt 2 with an output redaction guard; merged. Found and fixed a real concurrency bug while doing it: parallel replays shared one port.
- Second assessment finished: **8/20 → 2/20** after three merged fixes; regression suite **6/6 holding**. The two leftovers (crash on empty input, wall-clock loop) were never dispatched because crashed runs were skipped by the clusterer; fixed for the next run.
- Regression beat verified (`make regress-demo`): a planted "refactor: simplify system prompt wording" commit reintroduced the injection; the suite caught it (`REGRESSED d1-watchlist-2884e5`) and blamed commit 3a43335. Evidence: `docs/evidence/regression-caught-blame.json`.
- Demo videos: `docs/videos/preflight-explainer.mp4` (Remotion explainer) and `docs/videos/preflight-product-demo.mp4` (Playwright recordings of the real dashboard over the finished assessments, captioned in Remotion; `make demo-video`).
- New **Pipeline** screen: live stage track, attack matrix lighting up as runs land, fixer lanes, event feed (all from the event ledger over SSE). Screenshot in `docs/evidence/pipeline-live.jpg`.

## Submission checklist
- [ ] Public repos with hackathon-dated commits (Preflight repo is still private — owner to flip)
- [ ] Before/after neatlogs traces with numbers (blocked on the ingest network filter)
- [~] Entire: checkpoint trailers on every fixer commit + entire-graph impact/search in briefs and the cluster view (condensation blocked by an Entire hook hang, see DECISIONS.md)
- [ ] cfo.ai plan with pricing, costs, revenue, runway + Measured scenario
- [x] A run showing recovery from a failed action (fixer retry after failed replay → passed on attempt 2; merge conflict → verified on main; replay port collision → resumed from existing commits)
- [ ] Demo video; #neatHack posts quoting the neatlogs post

## Known limitations
- Single-component target in the demo; multi-component manifests are supported in schemas but untested end to end.
- The judge grader is skipped whenever a deterministic grader has already decided.
