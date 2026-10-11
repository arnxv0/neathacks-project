# Recreate Preflight from scratch

Everything below was done on macOS (Apple Silicon). Linux works the same except for the Chrome path used by the video render.

## 0. Prerequisites

| Tool | Version used | Install |
|---|---|---|
| Python | 3.12 (neatlogs SDK needs < 3.14) | `brew install python@3.12` or pyenv |
| uv | 0.9 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node | 22 | nvm or brew |
| Claude Code CLI | 2.1+ logged in | `npm i -g @anthropic-ai/claude-code` then `claude` once to log in |
| Entire CLI | 0.11+ | `curl -fsSL https://entire.io/install.sh \| bash` (installs to `~/.local/bin`), then `entire plugin install graph --allow-unverified` |
| tmux, git, make | any | brew |
| Docker Desktop | optional | only for `make up` |
| Google Chrome | optional | only for rendering the Remotion video (`--browser-executable`) |

Accounts and keys (put in `.env`, never commit):
- **LiteLLM** hackathon gateway: `LITELLM_BASE_URL=https://litellm.vision.aivar.app/v1`, `LITELLM_API_KEY` (from neatlogs.com/hackathon/models).
- **neatlogs**: `NEATLOGS_API_KEY` (project ingest key) and `NEATLOGS_PROJECT_ID`; for reading traces back also `NEATLOGS_TOKEN` (Settings → Service Accounts → token with `observability:read`).
- **Crustdata**: `CRUSTDATA_API_KEY` (2025-11-01 API; the legacy `/screener` endpoints are closed to new accounts).
- `PREFLIGHT_OWNERSHIP_TOKEN`: any random string; the target must echo the same one from `/preflight-verify` or Preflight refuses to attack it.
- Optional: AWS credentials with Bedrock access (and the Anthropic use-case form submitted) to run the target with `TARGET_PROVIDER=bedrock`.

## 1. Clone both repos side by side

```bash
mkdir -p ~/Repos && cd ~/Repos
git clone https://github.com/arnxv0/neathacks-project.git
git clone <acmesales-copilot repo> acmesales-copilot        # must be the sibling directory ../acmesales-copilot
```
If you only have this repo, the target is small: it is the `acmesales-copilot` tree described in `STATUS.md` §2; rebuild it from `ARCHITECTURE.md` §3 (contract) and `SPEC.md` §5 (seeded weaknesses), or ask for the repo.

## 2. Install

```bash
cd neathacks-project
cp .env.example .env            # fill in the keys above
uv sync
cd ../acmesales-copilot && cp .env.example .env && uv sync && uv run python -m app.seed_db && cd -
cd apps/web && npm install && cd -
cd apps/video && npm install && cd -      # optional
```

Enable Entire in the target (once):
```bash
cd ../acmesales-copilot
entire enable --yes --agent claude-code
python3 - <<'PY'
import json,pathlib; p=pathlib.Path(".entire/settings.json"); d=json.load(open(p)); d["commit_linking"]="always"; p.write_text(json.dumps(d,indent=2)+"\n")
PY
entire graph init-agents --repo .
git add -A && git commit -m "Enable Entire + entire-graph" </dev/null
git tag v0-unfixed            # the unfixed state the demo starts from
cd -
```

## 3. Start the services

Host mode (what every recorded run used):
```bash
make dev-host      # tmux session "preflight": target :8100 (CRUSTDATA_BASE_URL -> proxy), proxy :8300, api :8200, web :3000
tmux attach -t preflight
```
Or Docker for the long-running services (fixers and Entire still run on the host):
```bash
make up
```
Check: `curl localhost:8100/health` must report `"upstreams": {"company_lookup": "http://127.0.0.1:8300"}`; `curl localhost:8200/api/health`; open http://localhost:3000.

## 4. Run an assessment

```bash
uv run preflight run ../acmesales-copilot --mode dev --attacks D1 --seeds 3      # the hero attack, ~$0.05 of LiteLLM + ~$1/fixer on your Claude login
uv run preflight run ../acmesales-copilot --mode dev --attacks P0 --no-fix       # all 20 attacks, find only
uv run preflight run ../acmesales-copilot --mode full                            # 3 seeds/attack, K=5 replays, $8 cap
```
The run stops at `AWAIT_APPROVAL`. Review in the dashboard (Fixes → a fix → Approve & merge) or:
```bash
uv run preflight approve <assessment_id> <cluster_id>
uv run preflight request-changes <assessment_id> <cluster_id> --comment "..."
uv run preflight reject <assessment_id> <cluster_id> --reason "..."
uv run preflight resume <assessment_id>      # after any interruption; reuses fixer commits already on the fix branches
```
When every cluster is resolved, Preflight runs the regression suite and the after-pass and writes `out/report.json` + `out/cost_report.csv`.

## 5. The demo beats

```bash
make demo-reset        # target back to v0-unfixed, regressions + ledger cleared
make dev-host          # restart services on the reset target
uv run preflight run ../acmesales-copilot --mode full     # beats 1–5 (scorecard, divergence, fixers, approve, replay)
make regress-demo      # beat 6: plant a refactor that reintroduces the injection, suite catches it and blames the commit
git -C ../acmesales-copilot reset --hard HEAD~1            # remove the planted commit afterwards
make video             # beat 7 support: re-render the explainer with the measured numbers
```
Then push `out/cost_report.csv` values into the cfo.ai "Measured" scenario through its MCP server (`claude mcp add --transport http cfoai https://api.cfo.ai/mcp`).

## 6. Where results live

- `ledger/<assessment_id>/` — every run (`transcript.md`, `steps.jsonl`, `verdicts.json`), cluster (`divergence.md`, `graph.md`), fix (`brief.md`, `diff.patch`, `attempt.json`, `fixer.log`), `events.jsonl`, `report/`.
- `regressions/*.yaml` — one permanent test per approved fix.
- `out/report.json`, `out/cost_report.csv` — the latest report and the cfo.ai inputs.
- `docs/evidence/` — screenshots and JSON from the runs described in `STATUS.md`.

## 7. Known traps

- The target must be started with `CRUSTDATA_BASE_URL` pointing at the chaos proxy, or faults and poisoned fixtures never reach it (Preflight checks `/health` and refuses otherwise).
- If spans never show up in neatlogs, test `curl -v https://ingest.neatlogs.com/v1/traces`; on the original build machine a network filter intercepted that host.
- Entire's hooks block during `claude -p` sessions; Preflight handles it (commits on the fixer's behalf, reaps the stalled stop hook). Don't run fixers with hooks that prompt on stdin.
- Each replay boots its own target on a free port starting at 8101; keep those ports free.
