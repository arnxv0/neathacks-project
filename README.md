# Preflight

**Preflight crash-tests an AI agent before it launches.** It attacks the agent with hostile users, broken tools and injected data, finds the first step where a good run and a bad run diverge, dispatches a Claude Code fixer per root cause, records every fix as an Entire checkpoint, waits for a human to approve, replays the exact failing runs to prove the fix holds (1/5 → 5/5), and keeps them as permanent regression tests.

Built for neatHack 2026. Demo target: [AcmeSales Copilot](https://github.com/arnxv0/acmesales-copilot), a B2B sales agent on Claude (LiteLLM or AWS Bedrock) with Crustdata company data.

```
attack ──► trace (neatlogs) ──► grade ──► cluster ──► divergence ──► fix (Claude Code + Entire) ──► approve ──► replay K× ──► regression suite
```

## What it does

| Step | How |
|---|---|
| Attack | 20 P0 attacks, 50 seeds, mapped to the OWASP Top 10 for LLM apps: indirect injection via poisoned Crustdata records, unsafe SQL, cross-tenant access, jailbreaks, denial of wallet, chaos faults (timeouts, 429, 5xx, empty) injected by a proxy |
| Grade | Deterministic graders first (canary, watchlist, SQL AST, tenant, cost, retry, schema, honesty); an LLM judge only for fuzzy rubrics |
| Explain | Deterministic clustering by signature, first-divergence step between a passing and failing run, analyst hypothesis with suspected code paths, neatlogs trace links |
| Fix | One Claude Code fixer per cluster in its own git worktree, in parallel; every commit carries an Entire checkpoint with the reasoning |
| Prove | Human approves / requests changes / edits / rejects in the dashboard; replay K× against the fixed branch; saved to `regressions/` and rerun on every change; regressions are blamed to the commit that reintroduced them |
| Business | Every LLM call is metered; `out/cost_report.csv` feeds the cfo.ai model |

## Run it

```bash
cp .env.example .env            # LiteLLM, neatlogs, Crustdata keys
uv sync && (cd ../acmesales-copilot && uv sync)
make dev-host                   # target :8100, chaos proxy :8300, API :8200, dashboard :3000 (tmux)
uv run preflight run ../acmesales-copilot --mode dev --attacks D1 --seeds 3
# review in http://localhost:3000, or:
uv run preflight approve <assessment_id> <cluster_id>
uv run preflight regress ../acmesales-copilot
```

Docker: `make up` runs the four services in Compose (fixers and Entire run on the host).

## Recreate it

`SETUP.md` has the from-scratch steps: prerequisites, keys, both repos, services, assessments, the demo beats.

## Status

`STATUS.md` is the full record: what exists, what was verified on real runs (3/3 → 0/3 on D1; 8/20 → 2/20 across the P0 catalog; regression caught and blamed), measured costs, sponsor-tool integration, open items and how to resume.

## Repo map

- `src/preflight/` — coordinator state machine, ledger, guard, chaos proxy, graders, analyzer, fixers, replay, web API
- `attacks/*.yaml` — the attack catalog (see `ATTACKS.md`)
- `fixtures/` — cached Crustdata records and poisoned variants
- `regressions/` — permanent regression tests, one per approved fix
- `apps/web/` — Next.js dashboard (shadcn + Aceternity + Magic UI)
- `SPEC.md`, `ARCHITECTURE.md`, `BUSINESS.md`, `DECISIONS.md`, `hackathon.md`
