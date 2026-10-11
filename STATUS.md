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
| `targets/acmesales-copilot/` | The demo target, vendored with `git subtree` (full history, synced with `make target-sync`). This is what is on GitHub. |
| `../acmesales-copilot/` (sibling, own git repo, Entire enabled; `make target-checkout` creates it from the subtree) | The live checkout of the demo target "AcmeSales Copilot": a B2B sales agent (Claude via LiteLLM or Bedrock, Crustdata company lookup, SQLite CRM, mock credits/email). Tag `v0-unfixed` = the seeded-weakness state. After v0 only Preflight's fixers and merges touch it (plus two human test-isolation commits and the entire-graph instructions) |
| `ledger/preflight.sqlite` (gitignored; `$PREFLIGHT_DB`) | SQLite mirror of every ledger write (`src/preflight/db.py`): assessments, runs, verdicts, steps, clusters, attempts, events, regressions + `scorecard`/`fixes` views. `preflight db sync|query|export`, `GET /api/db/query` (read-only). The export of the full run is `docs/evidence/preflight-20261011.sqlite`. |
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
- `cli.py` — `preflight run | resume | approve | reject | request-changes | regress | init | proxy | web | report | stop`, plus `preflight target add | list | inspect | onboard | approve | trust | rm` and `preflight run sandbox:<slug>`.
- `sandbox/` — test a public GitHub repo (`docs/SANDBOX_TARGETS.md`): `registry` (entries outside the clone, status machine), `clone` (inert clone, size cap), `inspect` (static), `onboard` (file-tools-only Claude Code session writes `preflight.yaml` + `preflight_adapter.py`; ends in `needs_review`), `contract` (manifest rules, review patch, approval fingerprint), `runtime` (Docker only; trusted + env fallback), `applicable` (attack selection by manifest), `fixing` (opt-in, trusted targets). API: `/api/targets` in `web/routes/targets.py`.

### Dashboard (`apps/web`, Next.js 16, shadcn + Aceternity + Magic UI, Tailwind v4)
Routes under `/a/[id]`: Scorecard (hero before/after, attack matrix, clusters), **Pipeline** (live stage track, attack matrix progress, fixer lanes, event feed), Clusters (+ detail: hypothesis, entire-graph context, divergence timelines, neatlogs links), Fixes (+ detail: replay dots, Entire panel, diff, brief, attempts, Approve / Request changes / Edit / Reject), Regressions (table + blame card), Cost (tiles, budget gauge, cfo.ai inputs), Runs (transcript). Feature folders under `src/components/preflight/*`, registry components untouched in `src/components/ui`, typed API client + TanStack Query in `src/lib/api`, SSE hook in `src/lib/sse`.

### Videos (`apps/video`, Remotion)
Two compositions: `PreflightExplainer` (2:03 explainer; also `PreflightExplainerSquare` 1:1 and the 38 s `PreflightTeaser16x9` / `PreflightTeaser9x16` for social) and `PreflightProductDemo` (real dashboard recordings captured by `scripts/record-dashboard.mjs` with Playwright, stitched with title cards and captions). Rendered files live in `docs/videos/`.

### Explainer video details
8 scenes (hook, attack, trace, fix, proof, regression, business, CTA), 1080p and 9:16 compositions, numbers injected from `out/report.json` by `scripts/video-props.py`. Rendered: `apps/video/out/preflight-explainer.mp4` (`make video`).

## 3. What was verified on real runs

| Run | Result |
|---|---|
| Susceptibility probe (D1/D2, 3 seeds, nova-lite vs claude-haiku) | Haiku fell to 3/3 D1 seeds once poisoned records read like synced ops notes → target stays on `claude-haiku` |
| Assessment `20261010-154713-174a` (D1, 3 seeds) | **3/3 → 0/3**. 3 clusters, 3 parallel fixers, each replay 0/1 → 2/2. One fixer failed tests → retried → passed on attempt 3. Two fixes conflicted with the first merge → Preflight replayed on main, main passed, recorded as fixed. Regression suite 3/3. |
| Assessment `20261010-165007-7646` (all 20 P0 attacks, 1 seed each, on the D1-fixed main) | **8/20 → 2/20**. Analyst merged 5 signature clusters into 3 root causes. Fixes: authority/confirmation (`app/agent.py`, `billing.py`, prompt) 0/3 → 6/6; retry/backoff (`app/retry.py`: 3 attempts, exponential backoff, Retry-After) 0/3 → 6/6; prompt leak: attempt 1 (prompt-only) failed replay 0/2, attempt 2 (output redaction guard in `agent.py`) 0/1 → 2/2. Regression suite 6/6. Leftovers: A5 (500 on empty message) and H1 (wall-clock loop) were never dispatched because crashed runs were skipped by the clusterer; fixed in code, not yet rerun. |
| Regression beat (`make regress-demo`, 2026-10-11 on the fixed main) | Planted commit `1bbce14 refactor: simplify upstream retry loop…` reverted the merged B1–B3 fix. `preflight regress` (ledger `regress-20261011-020324-9852`): 15 suites, **4 REGRESSED**, all blamed on that commit — the two retry suites and, less obviously, two D1 suites that the same fix had been closing through `crustdata.py`. Evidence `docs/evidence/regression-caught-blame-20261011.json`. Then `git reset --hard HEAD~1`. (Oct 10 version of the beat: `3a43335` prompt revert → `REGRESSED d1-watchlist-2884e5`.) |
| **Assessment `20261011-001111-d070` (full mode: 20 P0 attacks, 50 seeds, K=5, from `v0-unfixed`)** | **23/50 → 0/50.** 15 clusters, all reached K/K (205 replay runs, e.g. B1–B3 honesty/retry 0/4 → 20/20, G2+G3 0/4 → 20/20). 25 fix attempts (23 by fixers + 2 human reviewer merges; 15 approved): 3 first attempts failed tests because the Mac's `make` broke (Xcode licence), the retries passed; A5 and A6 needed a second attempt after a failed replay; C3 and E1 conflicted with earlier merges and were finished by a human reviewer merge, replayed 5/5, approved. 9 clusters were closed by earlier merges (conflict → replay on main → passes). Regression suite 15/15. Wall clock hit the 1500 s cap once; `preflight resume` finished in a fresh window (cap not raised). Every run carries a neatlogs trace id; Preflight's own spans land too. Evidence: `docs/evidence/report-full-20261011.json`, `cost_report-full-20261011.csv`, `preflight-20261011.sqlite`. |
| **Variance / verification passes (find-only, 2026-10-11)** | Same 50 seeds, five more passes: v0 unfixed 22, 23 (plus 23 in the fix run); fixed main 5, 4, 4 (plus 0 in the fix run's after-pass). Residue = D1 ×2, G3 ×2, B4 ×1→0. Script `scripts/variance-runs.sh N` serves each revision in turn on :8100. Known wart: `target_commit` in those ledgers records the main checkout's HEAD, not the served worktree's; the run label is authoritative. |
| **Second fix pass** (`20261011-030231-050e`, D1/G3/B4 against the fixed main) | 3 clusters → D1 watchlist fixed in code (`crustdata.py` strips/flags imperative text in provider records + prompt), 0/2 → 10/10; G3 0/1 → 5/5 (closed by main after a conflict); B4 one seed still open (honesty on empty results). 16 regression suites, 0 regressed. |
| **Second target model** (`gpt-4.1-mini` via OpenAI, find-only, 2026-10-11) | v0 unfixed **31/50** → fixed main **5/50** with the Haiku-era fixes untouched. Residue on GPT: B4 ×2 (empty-result honesty), C2 (role-play canary), G3, H1 (loop cap). Cost: $0.38 + $0.63 of OpenAI. Ledgers `20261011-031238-d8e2`, `20261011-031100-dd17`. |
| **AWS live demo** (2026-10-11, `deploy/aws/terraform`, `t4g.medium`) | `terraform apply` → 8 resources; bootstrap from user data; HTTPS + basic auth via Caddy on `preflight.44-223-140-186.sslip.io`. Cloud assessment `20261011-195227-cf00` (D1, 3 seeds, started through the public API): 3 clusters (analyst merged 2), 2 fixers on the owner's Max token, tests green, replays 0/1 → 2/2 and 0/2 → 4/4, awaiting approval in the dashboard. Entire checkpoints are created natively on Linux (no hook hang). First-boot bugs fixed in repo: Caddy log ownership, API job log on a fresh clone. ≈ $1/day; `terraform destroy` to remove. |
| **Sandbox targets** (2026-10-11, backend only; `docs/SANDBOX_TARGETS.md`) | A tiny tool-calling agent repo, served from a local bare repo in place of GitHub (URL validation untouched): clone → static inspect → real onboarder session (file tools only; 67 s, $0.27; valid `preflight.yaml` + `preflight_adapter.py` first try) → human approve → `preflight run sandbox:<slug>` in Docker (generated Dockerfile, hardening flags confirmed with `docker inspect`) → 9 deterministic attacks run, 3 skipped as not applicable, seeded weakness found (A5), container removed. Same flow through `/api/targets` + `POST /api/assessments {target}`. Not yet verified: a real GitHub clone over the network, a real model call from inside the container (the smoke agent used a stub model: no LiteLLM key in that worktree), a third-party framework repo (LangChain etc.), `--allow-fix`, the no-Docker trusted fallback beyond unit tests, Linux. |
| **Preflight unit tests** | `tests/`: 242 tests (the 131 below plus 111 for sandbox targets: URL table, path-escape guards, inert clone from a local bare repo, size cap, inspect fixtures, status machine, manifest rules, onboarder with a fake session, Docker argv, applicability, API), 8 s, no network, no Docker, no claude. Earlier: 127 tests (graders, clustering, divergence, ledger/events, chaos proxy offline paths, report recoveries, db stats), 0.4 s, no network. Found and fixed a real grader gap: `sql_ast` now requires a tenant predicate per SELECT branch (UNION/subquery). |
| Dashboard | All screens render on real ledgers; Approve from the UI merges, saves the regression test, runs the suite and the after-pass. |
| Docker | `docker compose build` produces proxy/target/api images; images run the CLI and the target. Day-to-day runs use host mode. |

Measured COGS (`docs/evidence/cost_report-full-20261011.csv`, full-mode assessment): $0.006 per attack run (target on Haiku), $1.41 per Claude Code fix attempt, 1.67 attempts per accepted fix, 25 replay runs per fix, **$37 per full assessment** (the 23 fixer attempts of the 25 ≈ $35 of Claude Code usage, the other 2 were human merges; LiteLLM spend for attacks, replays, regressions, judge and analyst was $0.34). The target's own model cost ($1.62 incl. replays) is paid by the customer in production. LiteLLM hackathon key: $2.52 of $20 used in total.

Evidence in `docs/evidence/`: scorecard screenshots (3/3→0/3 and 8/20→2/20), fix detail, cluster divergence, pipeline view, regression suite, regression-caught blame JSON, report + cost report, video frame.

## 4. Sponsor tools: how each changes an outcome

- **neatlogs** — target and Preflight both initialise the SDK (`workflow_name` `acmesales-copilot` / `preflight`); every `/chat` is a trace with `session_id = run_id` and `X-Preflight-*` attributes; Preflight injects W3C trace context so one run is one trace across processes. Trace ids and deep links are on every run, cluster and divergence; the cost grader and cost report use span costs when the read API is reachable. **Current block:** this network's filter intercepts `ingest.neatlogs.com:443`, so no spans have been exported from this machine yet (grading never depended on it: the target keeps a local step mirror).
- **Entire** — target repo is `entire enable --agent claude-code`; every fixer commit carries an `Entire-Checkpoint` trailer. entire-graph is installed and `impact` / `search` output (blast radius, co-change coupling) goes into every fixer brief and the cluster view; `entire why` / blame back regression attribution. **Caveat:** Entire's post-commit and stop hooks hang during non-interactive `claude -p` sessions, so checkpoint data never condenses locally; Preflight commits on the fixer's behalf after the session and reaps the stalled stop hook (details + repro in `DECISIONS.md`).
- **cfo.ai** — `BUSINESS.md` + `cfo/assumptions.csv` define the model; `cost_report.csv` carries measured values with the same variable names for the "Measured" scenario via the cfo.ai MCP server. **Not done yet:** signup, Ari model, MCP auth (human steps).
- **Crustdata** — real company enrichment (`POST /company/enrich`, 2025-11-01 API) through the chaos proxy; cached records in `fixtures/cache`, poisoned variants in `fixtures/poisoned`.
- **Claude** — target model `claude-haiku` via the hackathon LiteLLM gateway (Bedrock is one env switch away, blocked on the Anthropic use-case form); Preflight's attacker/judge/analyst on the same gateway; fixers are Claude Code (`claude -p`).
- **Orchestrator.inc** — `OrchestratorFixer` backend exists (`ao spawn --standalone …`), selected automatically when `ao status --json` is healthy; not exercised (daemon not installed).

- **cfo.ai** — the operating model exists in the workspace "Preflight" (built 2026-10-11 via the `cfoai` MCP from a Claude Code session, not by hand): assumptions from `cfo/assumptions.csv` as Variables, funnel → revenue → COGS → headcount → opex → cash/runway, unit economics, a Board summary page comparing Main vs **Measured**, and Downside/Upside scenarios. The Measured scenario carries the real COGS from `cost_report-full-20261011.csv`; effect: gross margin 76.1% → 81.0% at month 12, Pro LTV:CAC 12.3 → 13.1. Report with limitations: `docs/evidence/cfo-model-build-20261011.md`.

## 5. Open items

On the owner:
1. cfo.ai Share link for the Board summary page (Share button, top right) → add to `hackathon.md`.
2. #neatHack posts (drafts in `hackathon.md`), quote-posting the neatlogs announcement.
3. Submission form by Mon 2026-10-12 11:25 AM PT, using the links in the README's "For judges" block. Entire checkpoint: `01M4N5WX9MEXD72YX851HPQR6K` on `dedc414`.
4. Optional: own-voice narration over the product demo; Bedrock use-case form.

Known and documented, not blocking: cfo.ai web UI paints placeholder cells after the MCP restructure although the API serves every value (DECISIONS.md 2026-10-11); one B4 "empty result" honesty seed still fails on the fixed main; `target_commit` mislabels runs served from detached worktrees (the label is authoritative).

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
