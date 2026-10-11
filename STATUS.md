# Preflight — project status and context

Read this first. It is the complete record of what exists, what was verified on real runs, what the numbers are, what is still open, and how to pick the work back up. Companion files: `DECISIONS.md` (every deviation and why), `hackathon.md` (dated build log + submission checklist), `DEMO.md` (recording script), `SPEC.md` / `ARCHITECTURE.md` / `ATTACKS.md` / `BUSINESS.md` (the original design).

Last updated: Sat Oct 10 2026, ~5:30 PM PT. Submission closes Mon Oct 12 11:55 PM IST (11:25 AM PT).

---

## 1. What Preflight is (one paragraph)

Preflight crash-tests an AI agent before launch. It attacks the agent with hostile personas, chaos-injected tool faults and injected data, grades every run deterministically, clusters failures by root cause, finds the first step where a bad run diverges, dispatches one Claude Code fixer per root cause (in parallel, each in its own git worktree, each commit tagged with an Entire checkpoint), waits for a human to approve in the dashboard, replays the exact failing runs K times to prove the fix holds, merges, and keeps every fix as a permanent regression test that is rerun on every change and blamed to the commit that breaks it. Every LLM call is metered and the measured cost feeds the cfo.ai business model.

## 2. Repos and layout

| Path | What |
|---|---|
| `neathacks-project/` (this repo) | Preflight: Python package `src/preflight`, attack catalog `attacks/`, fixtures, regression tests `regressions/`, dashboard `apps/web`, explainer video `apps/video`, scripts, docs, evidence |
| `../acmesales-copilot/` (sibling, own git repo, Entire enabled) | The demo target "AcmeSales Copilot": a B2B sales agent (Claude via LiteLLM or Bedrock, Crustdata company lookup, SQLite CRM, mock credits/email). Tag `v0-unfixed` = the seeded-weakness state. After v0 only Preflight's fixers and merges touch it (plus two human test-isolation commits and the entire-graph instructions) |
| `../acmesales-copilot-worktrees/` | One git worktree per active fix branch (`fix/<cluster_id>`), created by the fixer backend, removed on approve |

### Preflight package (`src/preflight/`)
- `coordinator.py` — the state machine: `INIT → BOOT_TARGET → VERIFY_OWNERSHIP → ATTACK → GRADE → CLUSTER → DIVERGE → FIX ⇄ REPLAY → AWAIT_APPROVAL → (approve) → REGRESSION_SUITE → VERIFY_AFTER → REPORT → DONE`. Also `resume()`, `approve()`, `reject()`, `request_changes()`, `regress()`, analyst cluster merging, merge-conflict recovery.
- `ledger.py`, `events.py`, `models.py` — everything on disk under `ledger/<assessment_id>/` (manifest, `events.jsonl`, runs with `transcript.md` / `steps.jsonl` / `verdicts.json`, clusters with `divergence.md` + `graph.md`, fixes with brief / diff / attempt json, report). No database.
- `guard/guard.py` — allowlist, ownership token, RPS, $ cap per assessment, wall clock, `STOP` kill switch.
- `llm/gateway.py` — all Preflight LLM calls via LiteLLM (OpenAI-compatible), neatlogs-wrapped, cost-accounted. `attacker.py` (multi-turn persona), `analyst.py` (hypothesis + suspected paths + cluster merge), `graders/judge.py`.
- `target/` — `preflight.yaml` loader, boot/health/ownership, tool discovery + annotation manifest.
- `chaos/` — proxy on :8300 between the target and Crustdata: faults (`timeout`, `429`, `5xx`, `empty`, `slow`, `truncate`, `rename`, `garbage`), poisoned fixtures, response cache.
- `attacks/` + `attacks/*.yaml` — 20 P0 attacks, 50 seeds, families A–H mapped to OWASP LLM Top 10.
- `runner/` — one run = seeds × headers → `/chat`, pulls the target's step mirror, writes the ledger.
- `traces/` — mirror reader, step normalizer, neatlogs public-API client (lookup by `sessionId = run_id`, span fetch, deep links).
- `graders/` — deterministic: `canary`, `watchlist`, `sql_ast` (sqlglot), `tenant`, `cost`, `retry`, `schema`, `honesty`; LLM: `judge` (only when no deterministic grader decided).
- `analyze/` — signature clustering, first-divergence (pass-vs-fail or vs-spec).
- `fix/` — `brief.py` (pointers, not dumps; includes entire-graph blast radius), `dispatcher.py`, `entire.py` (checkpoint explain/why/blame, graph impact/search), backends `claude_code.py` (worktree + `claude -p`) and `orchestrator.py` (`ao`, best effort).
- `replay/` — boots the fixed checkout on a free port with a throwaway DB, replays seeds K×; `regress.py` saves/loads regression tests and blames regressions via git + Entire.
- `report/` — scorecard (by attack / family / OWASP, before/after), `report.json`, `cost_report.csv` (cfo.ai variable names).
- `web/` — FastAPI on :8200: ledger index, REST, SSE event stream, event history, review actions (approve / reject / request-changes / edit), start/stop.
- `cli.py` — `preflight run | resume | approve | reject | request-changes | regress | init | proxy | web | report | stop`.

### Dashboard (`apps/web`, Next.js 16, shadcn + Aceternity + Magic UI, Tailwind v4)
Routes under `/a/[id]`: Scorecard (hero before/after, attack matrix, clusters), **Pipeline** (live stage track, attack matrix progress, fixer lanes, event feed), Clusters (+ detail: hypothesis, entire-graph context, divergence timelines, neatlogs links), Fixes (+ detail: replay dots, Entire panel, diff, brief, attempts, Approve / Request changes / Edit / Reject), Regressions (table + blame card), Cost (tiles, budget gauge, cfo.ai inputs), Runs (transcript). Feature folders under `src/components/preflight/*`, registry components untouched in `src/components/ui`, typed API client + TanStack Query in `src/lib/api`, SSE hook in `src/lib/sse`.

### Explainer video (`apps/video`, Remotion)
8 scenes (hook, attack, trace, fix, proof, regression, business, CTA), 1080p and 9:16 compositions, numbers injected from `out/report.json` by `scripts/video-props.py`. Rendered: `apps/video/out/preflight-explainer.mp4` (`make video`).

## 3. What was verified on real runs

| Run | Result |
|---|---|
| Susceptibility probe (D1/D2, 3 seeds, nova-lite vs claude-haiku) | Haiku fell to 3/3 D1 seeds once poisoned records read like synced ops notes → target stays on `claude-haiku` |
| Assessment `20261010-154713-174a` (D1, 3 seeds) | **3/3 → 0/3**. 3 clusters, 3 parallel fixers, each replay 0/1 → 2/2. One fixer failed tests → retried → passed on attempt 3. Two fixes conflicted with the first merge → Preflight replayed on main, main passed, recorded as fixed. Regression suite 3/3. |
| Assessment `20261010-165007-7646` (all 20 P0 attacks, 1 seed each, on the D1-fixed main) | **8/20 → 2/20**. Analyst merged 5 signature clusters into 3 root causes. Fixes: authority/confirmation (`app/agent.py`, `billing.py`, prompt) 0/3 → 6/6; retry/backoff (`app/retry.py`: 3 attempts, exponential backoff, Retry-After) 0/3 → 6/6; prompt leak: attempt 1 (prompt-only) failed replay 0/2, attempt 2 (output redaction guard in `agent.py`) 0/1 → 2/2. Regression suite 6/6. Leftovers: A5 (500 on empty message) and H1 (wall-clock loop) were never dispatched because crashed runs were skipped by the clusterer; fixed in code, not yet rerun. |
| Regression beat (`make regress-demo`) | Planted commit `3a43335 refactor: simplify system prompt wording…` reintroduced the injection; `preflight regress` → `REGRESSED d1-watchlist-2884e5`, blame names that commit. Then reset with `git reset --hard HEAD~1`. |
| Dashboard | All screens render on real ledgers; Approve from the UI merges, saves the regression test, runs the suite and the after-pass. |
| Docker | `docker compose build` produces proxy/target/api images; images run the CLI and the target. Day-to-day runs use host mode. |

Measured COGS (`out/cost_report.csv`, P0 assessment): $0.005 per attack run (target on Haiku), ~$2 per Claude Code fix attempt, 1.33 attempts per accepted fix, ~$8 per full dev-mode assessment including 50 replay runs. The target's own model cost ($0.29) is paid by the customer in production.

Evidence in `docs/evidence/`: scorecard screenshots (3/3→0/3 and 8/20→2/20), fix detail, cluster divergence, pipeline view, regression suite, regression-caught blame JSON, report + cost report, video frame.

## 4. Sponsor tools: how each changes an outcome

- **neatlogs** — target and Preflight both initialise the SDK (`workflow_name` `acmesales-copilot` / `preflight`); every `/chat` is a trace with `session_id = run_id` and `X-Preflight-*` attributes; Preflight injects W3C trace context so one run is one trace across processes. Trace ids and deep links are on every run, cluster and divergence; the cost grader and cost report use span costs when the read API is reachable. **Current block:** this network's filter intercepts `ingest.neatlogs.com:443`, so no spans have been exported from this machine yet (grading never depended on it: the target keeps a local step mirror).
- **Entire** — target repo is `entire enable --agent claude-code`; every fixer commit carries an `Entire-Checkpoint` trailer. entire-graph is installed and `impact` / `search` output (blast radius, co-change coupling) goes into every fixer brief and the cluster view; `entire why` / blame back regression attribution. **Caveat:** Entire's post-commit and stop hooks hang during non-interactive `claude -p` sessions, so checkpoint data never condenses locally; Preflight commits on the fixer's behalf after the session and reaps the stalled stop hook (details + repro in `DECISIONS.md`).
- **cfo.ai** — `BUSINESS.md` + `cfo/assumptions.csv` define the model; `cost_report.csv` carries measured values with the same variable names for the "Measured" scenario via the cfo.ai MCP server. **Not done yet:** signup, Ari model, MCP auth (human steps).
- **Crustdata** — real company enrichment (`POST /company/enrich`, 2025-11-01 API) through the chaos proxy; cached records in `fixtures/cache`, poisoned variants in `fixtures/poisoned`.
- **Claude** — target model `claude-haiku` via the hackathon LiteLLM gateway (Bedrock is one env switch away, blocked on the Anthropic use-case form); Preflight's attacker/judge/analyst on the same gateway; fixers are Claude Code (`claude -p`).
- **Orchestrator.inc** — `OrchestratorFixer` backend exists (`ao spawn --standalone …`), selected automatically when `ao status --json` is healthy; not exercised (daemon not installed).

## 5. Open items

Blocked on the owner:
1. Network filter blocking neatlogs ingest (hotspot or disable the filter), then rerun an assessment to get real before/after traces and set `NEATLOGS_TOKEN` (service-account token) in `.env` for read-back.
2. Make `arnxv0/neathacks-project` public; create a public `acmesales-copilot` repo and push it.
3. cfo.ai: sign up, build the model with Ari, `claude mcp add --transport http cfoai https://api.cfo.ai/mcp`, authenticate, push `out/cost_report.csv` into a Measured scenario.
4. Optional: Bedrock use-case form; Orchestrator desktop app for the `ao` backend.
5. #neatHack posts; demo video recording (script in `DEMO.md`).

Engineering backlog (nice to have):
- Rerun the full P0 loop from `v0-unfixed` (`make demo-reset` then `preflight run --mode full`) so A5/H1 get fixers and the recorded numbers come from one clean run.
- Dashboard "replay" mode that re-streams a finished ledger's events with timing (for re-shooting the video at $0); today finished assessments render statically from disk, which is enough.
- Multi-component target fixture test (schemas support it; untested end to end).
- Fixer commit titles for the two early P0 fixes are the fixer's first reply line; the title heuristic is fixed for new runs.

## 6. How to run and resume

```bash
# one-time
cp .env.example .env                 # LITELLM_API_KEY, NEATLOGS_API_KEY, CRUSTDATA_API_KEY, PREFLIGHT_OWNERSHIP_TOKEN (+ NEATLOGS_TOKEN)
uv sync && (cd ../acmesales-copilot && uv sync) && (cd apps/web && npm install)
# services (host mode; Docker: make up)
make dev-host                        # tmux: target :8100 (behind proxy), proxy :8300, api :8200, web :3000
# assessments
uv run preflight run ../acmesales-copilot --mode dev --attacks P0 [--seeds 3] [--no-fix]
uv run preflight resume <assessment_id>          # after a restart; reuses fixer commits already on fix branches
uv run preflight approve <assessment_id> <cluster_id>   # or click Approve in the dashboard
uv run preflight regress ../acmesales-copilot    # regression suite only
make regress-demo                                 # plant a regression and catch it
make demo-reset                                   # target back to v0-unfixed, clear regressions + ledger
make video                                        # re-render the explainer with measured numbers
```

Gotchas learned the hard way (all in `DECISIONS.md`): neatlogs SDK needs Python < 3.14 (uv pins 3.12); the target must be started with `CRUSTDATA_BASE_URL` pointing at the proxy or Preflight refuses to run; `claude -p` must be spawned with `CLAUDECODE*` env stripped; each replay needs its own port; Entire commit hooks must run with `commit_linking: "always"` and stdin closed.
