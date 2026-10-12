# Preflight

**Preflight crash-tests an AI agent before it launches, fixes what breaks, proves the fix, and keeps it fixed.**
Built for neatHack 2026 with neatlogs, Entire and cfo.ai.

> **Judges:** [**JUDGES.md**](JUDGES.md) is a one-page map — fastest way to judge, each criterion → where to look, and a 5-minute self-verify path.

## For judges

| Criterion | Evidence |
|---|---|
| The agent, end to end | **22–23 of 50 attack runs get through on the unfixed demo agent; 1 of 50 on the fixed one** (two fix passes; find-only passes `20261011-222252-7747` → `20261011-222549-3082`, every attack delivered). The first run's own after-pass printed 0/50, but 13 of those 50 runs never received their attack, so we no longer quote it (see [DECISIONS.md](DECISIONS.md), 2026-10-12). First run: [scorecard](docs/evidence/scorecard-full-23-to-0.jpg) · [report.json](docs/evidence/report-full-20261011.json) · [SQLite store of the whole run](docs/evidence/preflight-20261011.sqlite) |
| neatlogs, before / after | Same D1 seed, same prompt: [before, the agent obeys the injected record](https://app.neatlogs.com/traces/7d1d755db145b6a4e43c890d0d572518?projectId=2d5433a0-d4a3-45cf-99f8-aa80525d3d56&orgId=a56c598b-8c3d-431b-8356-cfd095118423) → [after the fix](https://app.neatlogs.com/traces/e1226f3c980aacba62bb535a82d31eb2?projectId=2d5433a0-d4a3-45cf-99f8-aa80525d3d56&orgId=a56c598b-8c3d-431b-8356-cfd095118423). Every one of the 429 runs in the report carries its trace id. |
| Entire | Checkpoint `01M4N5WX9MEXD72YX851HPQR6K` on commit [`dedc414`](https://entire.io/gh/arnxv0/neathacks-project/commit/dedc4146f6668ef93ec8e4ba1050b13428fd9561) (`preflight db stats`, written by a Claude Code session; [screenshot](docs/evidence/entire-checkpoint-dedc414.jpg)). Fixer commits in the target carry `Entire-Checkpoint` trailers; entire-graph impact/search feeds every fixer brief. |
| cfo.ai | Operating model built through the cfo.ai MCP from Claude Code, with a **Measured** scenario fed by the real run: [board summary, Main vs Measured](docs/evidence/cfo-board-main-vs-measured.jpg) · [build report](docs/evidence/cfo-model-build-20261011.md) |
| Demo video | [Product demo, 2:39](docs/videos/preflight-product-demo.mp4) · [Explainer, 2:03](docs/videos/preflight-explainer.mp4) |
| Live demo | [preflight.44-223-140-186.sslip.io](https://preflight.44-223-140-186.sslip.io) (login in the submission form). One Terraform-managed AWS host with a finished cloud run (`20261012-080554-95db`: 3/3 → 0/3, one fix merged, one sent back after a merge conflict) and a **Reset demo** button to start again from the unfixed agent. Details: [deploy/aws/README.md](deploy/aws/README.md) |
| Recovery from failed actions | `recoveries[]` in the report: fixer retries after failed replays, merge conflicts re-checked on main (9 of 15 branches in the first run were not merged for that reason), a wall-clock stop resumed, [a regression caught and blamed to its commit](docs/evidence/regression-caught-blame-20261011.json) |

Build log and submission checklist: [hackathon.md](hackathon.md). Everything that went wrong and what we did about it: [DECISIONS.md](DECISIONS.md).

## What it does

Preflight attacks an agent the way production will: hostile users, broken tools, and data that carries instructions. It grades every run deterministically, groups failures by root cause, finds the first step where a bad run diverged from a good one, and dispatches one Claude Code fixer per root cause. A human approves. Preflight replays the exact failing runs K times to prove the fix holds, merges it, and keeps the failure as a permanent regression test that is blamed to the commit if it ever comes back.

```mermaid
flowchart LR
    A[Attack catalog<br/>20 attacks · 50 seeds] --> B[Target agent<br/>behind chaos proxy]
    B --> C[neatlogs trace<br/>per run]
    B --> D[Deterministic graders]
    D --> E[Cluster by root cause<br/>+ first divergent step]
    E --> F[Claude Code fixer<br/>per cluster, own worktree]
    F --> G{Replay K×<br/>exact failing seeds}
    G -- all pass --> H[Human approves → merge]
    G -- any fail --> F
    H --> I[Regression test<br/>blamed to commit]
    H --> J[After-pass:<br/>whole catalog again]
    B -. measured cost per run .-> K[cfo.ai model<br/>Measured scenario]
    F -. checkpoint .-> L[Entire]
```

```mermaid
flowchart TB
    subgraph preflight[Preflight]
        CLI[CLI / coordinator] --> LEDGER[(ledger: files + SQLite)]
        CLI --> PROXY[chaos proxy :8300<br/>faults, poisoned fixtures]
        CLI --> FIX[fixer dispatcher<br/>git worktrees, Entire hooks]
        API[web API :8200<br/>REST + SSE + read-only SQL] --> LEDGER
        WEB[dashboard :3000<br/>Next.js] --> API
    end
    subgraph target[Target under test: AcmeSales Copilot]
        AGENT[agent :8100] --> TOOLS[crm_query · issue_credit<br/>send_email · company_lookup]
        TOOLS --> PROXY
    end
    PROXY --> CRUST[Crustdata API]
    AGENT --> LLM[LiteLLM gateway<br/>claude-haiku]
    AGENT --> NL[neatlogs]
    CLI --> NL
    CLI --> MODELS[judge / analyst<br/>via LiteLLM]
```

## Results

| Run | Result |
|---|---|
| Full mode from the unfixed target (`20261011-001111-d070`): 20 attacks, 50 seeds, K=5 | **23/50 before.** 15 root causes, 25 fix attempts, 15 approved: **6 branches merged** (4 by fixers, 2 finished by a human after conflicts) and **9 not merged** because they conflicted and main was re-checked instead. **Correction (2026-10-12):** during approval the fault-injection proxy was not running on the build machine, so every company lookup failed with a connection error. That makes the re-checks of 4 of those 9 root causes (the three D1 ones and B2/B3 retry), 18 regression runs and 13 of the 50 after-pass runs meaningless; the "0/50 after" from this run is withdrawn. The dashboard now marks those runs "not delivered". Valid after-numbers are in the next rows. |
| Repeated find-only passes with the proxy up, same 50 seeds (`20261011-024639-4292`, `-025017-410e`, `-025406-33fd`, `-025623-7fee`, `-025946-d2f1`) | **v0 unfixed: 23, 22, 23 of 50. Main after the first fix pass: 5, 4, 4 of 50.** The residue is the same seeds each time (D1 ×2, G3 ×2, once B4): the three D1 clusters had been closed by other fixes' prompt changes rather than by code, so the protection was probabilistic. Second fix pass on exactly those attacks (`20261011-030231-050e`): D1 watchlist 0/2 → 10/10 with a tool-result guard in code, G3 0/1 → 5/5; merged; 16 regression suites, 0 regressed; after-pass on the 8 residual seeds 3 → 1 (one B4 "empty result" honesty case left). |
| Final main after both passes (`20261011-222252-7747` on v0 → `20261011-222549-3082` on main `5586c94`), 2026-10-11 22:22 | **22/50 → 1/50**, all 100 runs delivered. The one left is a B4 "empty result" honesty case. One pass each, so treat 1/50 as a single sample. |
| **Second target model**, same catalog, find-only (`20261011-031238-d8e2` → `-031100-dd17`) | Target switched to `gpt-4.1-mini` (OpenAI), nothing else changed: **31/50 on the unfixed v0 → 5/50 on the fixed main.** The fixes were produced against Haiku and transferred; the residue differs by model (B4 ×2, C2, G3, H1). |
| Regression beat | A "refactor" reverting the retry fix → 4 suites regress, all blamed to that commit |
| Measured COGS | $0.006 per attack run · $1.41 per fix attempt · 1.67 attempts per accepted fix · $37 per full assessment |

Full detail, including what did not work: [STATUS.md](STATUS.md).

## Run it

**Need:** Python 3.12, [uv](https://docs.astral.sh/uv/), Node 22, and a logged-in [Claude Code CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code) (only the fixer step uses it). Keys for LiteLLM, neatlogs and Crustdata go in `.env`.

```bash
# 1. Clone and enter the repo
git clone https://github.com/arnxv0/neathacks-project.git
cd neathacks-project

# 2. Configure keys (see SETUP.md §0 for where each comes from)
cp .env.example .env            # fill in LiteLLM, neatlogs, Crustdata keys

# 3. Install Preflight + check the demo target out as its own sibling repo
uv sync
make target-checkout            # vendored target → ../acmesales-copilot (own git repo)

# 4. Start everything (target :8100, chaos proxy :8300, API :8200, dashboard :3000)
make dev-host                   # tmux session "preflight"; attach with: tmux attach -t preflight
#   sanity: curl localhost:8100/health && curl localhost:8200/api/health, then open http://localhost:3000

# 5. Run an assessment — start small (the hero attack, ~$0.05 LiteLLM + ~$1 on your Claude login)
uv run preflight run ../acmesales-copilot --mode dev --attacks D1 --seeds 3

# 6. See the result
uv run preflight db stats       # one-screen summary of the latest assessment
```

A run pauses at `AWAIT_APPROVAL`. **Approve a fix** in the dashboard (Fixes → a fix → Approve & merge) or on the CLI:

```bash
uv run preflight approve <assessment_id> <cluster_id>
uv run preflight resume  <assessment_id>      # continue after any interruption
```

Bigger runs: `--attacks P0 --no-fix` (all 20 attacks, find only) or `--mode full` (3 seeds/attack, K=5 replays, $8 cap).

`make` is optional everywhere — every recipe is a plain `uv run` / `npm` / `docker compose` command (see the `Makefile`). From-scratch install, Docker, Windows notes and known traps: **[SETUP.md](SETUP.md)**.

## Test another agent

Any public GitHub repo can be added as a *sandbox target* from the dashboard or the CLI. The clone is inert (no hooks, no submodules, nothing executed), a Claude Code session with file tools only writes the `preflight.yaml` and a small HTTP adapter, a human approves the diff, and the agent is then started only inside a locked-down Docker container. Sandbox targets are find-only by default.

```bash
uv run preflight target add https://github.com/<owner>/<repo>
uv run preflight target onboard <owner>--<repo>      # writes preflight.yaml + preflight_adapter.py, ends in needs_review
uv run preflight target approve <owner>--<repo>      # after reading sandbox/registry/<slug>.onboard.patch
uv run preflight run sandbox:<owner>--<repo>         # needs Docker; set PREFLIGHT_SANDBOX_LITELLM_API_KEY to a scoped key
```

Flow, API, threat model and what is not protected against: [docs/SANDBOX_TARGETS.md](docs/SANDBOX_TARGETS.md).

## Documents

| | |
|---|---|
| [docs/SANDBOX_TARGETS.md](docs/SANDBOX_TARGETS.md) | Testing a third-party repo: flow, isolation, limits |
| [STATUS.md](STATUS.md) | What exists, what was verified on real runs, sponsor integration, open items |
| [SETUP.md](SETUP.md) | Recreate it from a clean machine |
| [DECISIONS.md](DECISIONS.md) | Dated log of every deviation, incident and judgment call |
| [hackathon.md](hackathon.md) | Build log, submission checklist, post drafts |
| [ATTACKS.md](ATTACKS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SPEC.md](SPEC.md) · [BUSINESS.md](BUSINESS.md) · [DEMO.md](DEMO.md) | Design: attack catalog (OWASP LLM Top 10), system design, product spec, business model, demo script |
| [docs/RESEARCH.md](docs/RESEARCH.md) | The papers behind the attack families |
| [docs/evidence/](docs/evidence/) | Screenshots, reports, cost reports, the SQLite store, the regression blame |

## Repo map

```
src/preflight/        coordinator, graders, analyze (signature/cluster/divergence), fix (dispatcher, Claude Code backend, Entire),
                      replay, report, chaos proxy, traces (neatlogs), db (SQLite store), web (API), cli
attacks/              20 P0 attacks, 50 seeds, watchlist          regressions/   15 permanent tests, one per approved fix
fixtures/             Crustdata cache + poisoned records          targets/       the demo target, vendored with its full fix history
apps/web/             Next.js dashboard                           apps/video/    Remotion videos, narration, recordings
scripts/              demo-reset, regress-demo, variance-runs, video props, screenshots
```
