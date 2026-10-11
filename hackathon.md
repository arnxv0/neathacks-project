# Preflight — neatHack 2026 build log

**Project:** Preflight — an agent that crash-tests other AI agents before launch (attack → trace → fix → prove).
**Team:** Arnav Dewan (solo).
**Repo:** this one. Preflight is the root; the demo target [AcmeSales Copilot](targets/acmesales-copilot/) is vendored under `targets/` as a git subtree with its full history (after v0 only Preflight's fixers commit to it; `make target-sync` pulls those commits in).
**Stack:** Python 3.12 / FastAPI / uv; Next.js 16 + shadcn + Aceternity + Magic UI; Claude via LiteLLM (hackathon gateway) with Bedrock as a switch; neatlogs SDK + public API; Entire CLI (checkpoints, blame); Crustdata company enrichment; cfo.ai (business model via Ari + MCP); Orchestrator.inc `ao` as an optional fixer backend; Docker Compose.

## How the three required tools change outcomes

- **neatlogs** — every target turn and every Preflight LLM call is a trace (`session_id = run_id` bridges them). Trace links sit on every cluster and divergence step; token/cost numbers from spans feed the cost grader and `cost_report.csv`; before/after traces are the evidence a fix worked.
- **Entire** — the target repo runs `entire enable --agent claude-code`. Each fixer commit carries an `Entire-Checkpoint` trailer; the dashboard shows the checkpoint and its explanation; `entire why`/`blame` names the commit that reintroduces a regression.
- **cfo.ai** — `BUSINESS.md` + `cfo/assumptions.csv` build the model with Ari; after a full run, the measured COGS in `out/cost_report.csv` replaces the estimates in a “Measured” scenario through the cfo.ai MCP server.

## Build log

### Sun Oct 11, 00:11–01:35 PT — the clean full-mode run

Target reset to `v0-unfixed`; `preflight run --mode full` (20 attacks, 50 seeds, K=5). Before **23/50**, after **0/50**, 15 clusters, 15 regression suites, 0 regressed. Real neatlogs traces for every run (network filter gone). Along the way: Xcode update broke `make` (3 wasted fixer attempts, shimmed, then removed the dependency: target now boots with `python -m app`); 1500 s wall clock hit once → `preflight resume`; 13 merge conflicts handled by replaying on main; C3 and E1 finished by a human reviewer merge through the request-changes flow. Evidence in `docs/evidence/*-full-20261011.*` and `preflight-20261011.sqlite`. Target vendored into `targets/` (one repo). SQLite ledger store added.

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


### Task list (2026-10-11, while the owner is away)
- [x] Second fix pass on the residual D1/G3 failures (ledger `20261011-030231-050e`): D1 watchlist 0/2 → 10/10, G3 0/1 → 5/5, approved and merged; regression suite + after-pass re-run.
- [x] Second target model `gpt-4.1-mini`: v0 31/50 → fixed main 5/50 (fixes transfer across models).
- [ ] cfo.ai: board table renders placeholders after the restructure — diagnosing through the MCP; MCP update clip with the verification run's measured cost.
- [ ] **Video narration and script v2**: lead with impact and answer the judges' likely questions (does it generalise? is it luck? what did it cost? what broke? what would you do next?), one claim per scene backed by an on-screen number; synthesize clause by clause with explicit pauses (250 ms at commas, 500 ms at sentence ends) so the voice stops rushing through commas; re-render both videos.
- [ ] Refresh README/STATUS numbers after the runs; re-record dashboard clips if the headline numbers move.

## Submission checklist
- [ ] **Public repo** with hackathon-dated commits — one repo, target vendored under `targets/`. Owner: `gh repo edit arnxv0/neathacks-project --visibility public --accept-visibility-change-consequences`
- [x] Before/after neatlogs traces with numbers — full run `20261011-001111-d070`: 23/50 → 0/50, every run has a trace id; Preflight's own spans land too (`docs/evidence/report-full-20261011.json`)
- [x] Entire: checkpoint trailers on fixer commits + entire-graph impact/search in briefs and the cluster view. Root cause of the weekend-long hook hang found 2026-10-11 (Rosetta git 2.33) and fixed; real checkpoints now land. **Submission checkpoint:** commit `dedc4146f6668ef93ec8e4ba1050b13428fd9561` (`preflight db stats`, written by a Claude Code session in a clean clone), checkpoint ID `01M4N5WX9MEXD72YX851HPQR6K`, link `https://entire.io/gh/arnxv0/neathacks-project/commit/dedc4146f6668ef93ec8e4ba1050b13428fd9561`. The first checkpoint was revoked after Entire's session snapshot captured chat-pasted keys; see DECISIONS.md.
- [x] **cfo.ai** plan: built 2026-10-11 through the cfo.ai MCP from Claude Code — workspace "Preflight", 10 tables / 185 variables / 4 pages (Assumptions, Model, Unit economics, Board summary), scenarios Main, Downside, Upside and **Measured** (real COGS $0.006/run, $1.41/fix attempt, 1.67 attempts/fix, $37/assessment). Measured lifts gross margin ~5 pts (76→81% at m12); break-even month 11. Report: `docs/evidence/cfo-model-build-20261011.md`; board screenshot `docs/evidence/cfo-board-main-vs-measured.jpg` (ARR $1.62M m12 / $16.5M m24, gross margin 76.1% → 81.0%, break-even month 11).
- [x] A run showing recovery from a failed action — `recoveries[]` in the report: 6 failed fixer attempts retried, 2 fixer retries after failed replays (A5, A6 → K/K), 13 merge conflicts re-verified on main, wall-clock stop → `preflight resume`
- [ ] **Demo video** — two narrated videos exist (dev-run numbers); re-render with the full-run numbers, then a final screen-recorded walkthrough
- [ ] **#neatHack posts** quoting the neatlogs X post — owner (drafts below)

### Post drafts (owner to publish, quote the neatlogs #neatHack post)
1. **Kickoff / what it is.** "Building Preflight for #neatHack: it crash-tests an AI agent before launch. Hostile users, broken tools, poisoned data → deterministic graders → one Claude Code fixer per root cause → human approval → replay K× to prove it. Every run is a @neatlogs trace, every fix an @entire_io checkpoint. Repo: github.com/arnxv0/neathacks-project"
2. **The number.** "Clean full run of Preflight against our deliberately weak sales copilot: 23 of 50 attack runs succeeded before, 0 of 50 after. 15 root causes, 15 fixes, 15 permanent regression tests. Cost per assessment: $37, measured, going into the cfo.ai model. #neatHack" (attach `docs/evidence/scorecard-*.jpg` or the pipeline GIF)
3. **The honest one.** "Things that went wrong on the way and how the agent recovered: Xcode broke `make` mid-run (fixers' tests went red, retries passed), the wall-clock cap stopped the run (resume picked up the fix branches), 13 merge conflicts between parallel fixers (replayed on main, 2 needed a human). All in the report's recoveries[]. #neatHack"
4. **Video.** Final demo video + "watch the 1/5 → 5/5 replay bar".

## Known limitations
- Single-component target in the demo; multi-component manifests are supported in schemas but untested end to end.
- The judge grader is skipped whenever a deterministic grader has already decided.
