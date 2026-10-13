# Judges: start here

**Preflight crash-tests an AI agent before it launches, fixes what breaks, proves the fix, and keeps it fixed.**
Team: Jayant Harwalkar, Arnav Dewan and Aryan Sharma · neatHack 2026 · built with neatlogs, Entire and cfo.ai.

This page is the map. Everything linked here is in the repo or live. Budget **~6 minutes to judge, ~5 more to verify it yourself.**

---

## The 60-second version

An AI agent that ships to production meets hostile users, broken tools, and data that carries hidden instructions. Preflight attacks a target agent the way production will, **grades every run deterministically**, groups the failures by root cause, finds the first step where a bad run diverged from a good one, and dispatches **one Claude Code fixer per root cause**. A human approves. Preflight then **replays the exact failing runs K times to prove the fix holds**, merges it, and keeps each failure as a **permanent regression test** that gets blamed to the commit if it ever comes back.

Headline on the demo target (AcmeSales Copilot): **23 of 50 attacks get through on the unfixed agent. 0 of 50 after the fixes** (run `20261012-012855-7f28`, every attack delivered). Every run carries a neatlogs trace id.

---

## Fastest way to judge (pick one)

| Path | Time | Link |
|---|---|---|
| **Watch** the product demo | 2:39 | [docs/videos/preflight-product-demo.mp4](docs/videos/preflight-product-demo.mp4) |
| **Watch** the explainer | 2:03 | [docs/videos/preflight-explainer.mp4](docs/videos/preflight-explainer.mp4) |
| **Click through** the live demo | ~3 min | URL + login in the submission form → open the dashboard → hit **Reset demo** → watch a run go 3/3 → 0/3 |
| **Run it yourself** | ~5 min | [the five commands below](#verify-it-yourself) |

---

## Each judging criterion → where to look

| Criterion | One place to look | What you'll see |
|---|---|---|
| **The agent, end to end** | [report.json](docs/evidence/report-full-20261012.json) · [SQLite store](docs/evidence/preflight-20261011.sqlite) | 23/50 → 0/50 with every attack delivered. Attack, fix, prove and regression test are all recorded |
| **neatlogs** (required) | [before: agent obeys the injected record](https://app.neatlogs.com/traces/7d1d755db145b6a4e43c890d0d572518?projectId=2d5433a0-d4a3-45cf-99f8-aa80525d3d56&orgId=a56c598b-8c3d-431b-8356-cfd095118423) → [after the fix](https://app.neatlogs.com/traces/e1226f3c980aacba62bb535a82d31eb2?projectId=2d5433a0-d4a3-45cf-99f8-aa80525d3d56&orgId=a56c598b-8c3d-431b-8356-cfd095118423) | Same seed, same prompt, opposite behaviour. Every run in the report links its trace. neatlogs raised [an incident on our own LLM judge](https://app.neatlogs.com/incidents/0a9355db-71c9-46d5-b484-942060a8d7bb?orgId=a56c598b-8c3d-431b-8356-cfd095118423&projectId=2d5433a0-d4a3-45cf-99f8-aa80525d3d56) and we fixed it in `b589f2b` |
| **Entire** (required) | [checkpoint on commit `dedc414`](docs/evidence/entire-checkpoint-dedc414.jpg) | Fixer commits carry `Entire-Checkpoint` trailers; `entire why`/`blame` names the commit that reintroduces a regression |
| **cfo.ai** (required) | [board: Main vs Measured](docs/evidence/cfo-board-main-vs-measured.jpg) · [build report](docs/evidence/cfo-model-build-20261011.md) | Operating model built through the cfo.ai MCP, Measured scenario fed by the real run's COGS |
| **Recovery from failed actions** | [regression caught + blamed](docs/evidence/regression-caught-blame-20261011.json) · `recoveries[]` in the report | Fixer retries after failed replays, merge conflicts re-checked on main, a wall-clock stop resumed |
| **Beyond the demo target** | [docs/SANDBOX_TARGETS.md](docs/SANDBOX_TARGETS.md) | Any public GitHub repo can be onboarded as a sandboxed target (clone is inert; agent only runs in a locked-down Docker container) |

---

## Verify it yourself

Need: Python 3.12, [uv](https://docs.astral.sh/uv/), Node 22, a logged-in Claude Code CLI, and keys in `.env` (see [SETUP.md §0](SETUP.md)).

```bash
cp .env.example .env                                              # LiteLLM, neatlogs, Crustdata keys
uv sync && make target-checkout                                   # install + check out the target as a sibling repo
make dev-host                                                     # target :8100, proxy :8300, API :8200, dashboard :3000
uv run preflight run ../acmesales-copilot --mode dev --attacks D1 --seeds 3   # the hero attack (~$0.05 + ~$1 fixer)
uv run preflight db stats                                         # one-screen summary of what just happened
```

Approve the proposed fix in the dashboard (**Fixes → a fix → Approve & merge**) or with `uv run preflight approve <assessment> <cluster>`. Full run: `--mode full`. From-scratch install and traps: [SETUP.md](SETUP.md).

---

## We kept an honest record

Not everything worked the first time. The one-sentence version: the first run's "0/50 after" was withdrawn because 13 of those 50 runs never actually received their attack (the fault-injection proxy wasn't up during approval); the number we stand behind is **23/50 → 0/50 with every attack delivered**, from a fresh full run on 2026-10-12. Repeated passes before that gave 22–23/50 → 1/50. The full story, with dates, is in **[DECISIONS.md](DECISIONS.md)**.

Deeper reading, in order of usefulness to a judge: [README.md](README.md) (full results table) → [STATUS.md](STATUS.md) (what exists and was verified) → [ARCHITECTURE.md](ARCHITECTURE.md) · [ATTACKS.md](ATTACKS.md) (OWASP LLM Top 10 catalog) → [hackathon.md](hackathon.md) (build log).
