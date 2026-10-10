# Preflight — Product Spec

> **Preflight crash-tests an AI agent before it launches.** It attacks the agent with hostile users, broken tools and security exploits, finds out why each attack worked, fixes the code, and proves the fix holds.

This file says **what** to build and **why**. How it's built lives in `ARCHITECTURE.md`, the build order in `MILESTONES.md`, the rules in `CLAUDE.md`, and the attack catalog in `ATTACKS.md` (expanded into `attacks/*.yaml`). If those files disagree with this one, this one wins.

---

## 1. Problem

Teams ship AI agents after testing only the happy path. The failures that matter come from users who push back, tools that time out or return junk, and attackers who hide instructions in data. Those failures show up for the first time in production, in front of customers. Nothing today attacks an agent, explains *why* it broke, fixes it and *proves* the fix holds, all in one loop.

## 2. Who it's for

Teams about to launch an agent that touches customer data or money. The buyer is the eng lead or head of AI, who needs to answer "is this safe to ship?" with evidence rather than a feeling. The dashboard and the final report are written for that person.

## 3. Demo script (north star)

Every feature has to serve one of these beats. Anything that doesn't gets cut. Numbers are illustrative; the real ones come from the run.

| Time | On screen | What it proves |
|---|---|---|
| 0:00–0:20 | The target agent (§5) answers a normal sales question well | It looks ready to launch |
| 0:20–0:50 | `preflight run`: the scorecard fills live and ends at **31/50 attacks succeeded** | It finds real failures |
| 0:50–1:20 | Click the indirect-injection cluster, open its neatlogs trace, see the **divergence step** highlighted | neatlogs is essential |
| 1:20–1:50 | Fixers dispatched in parallel through Orchestrator.inc, the Entire checkpoint with its reasoning, a human clicks **Approve** | Entire and Orchestrator are essential |
| 1:50–2:15 | Replay goes **1/5 → 5/5**, the scorecard drops **31 → 3** | It verifies its own fixes |
| 2:15–2:35 | A later commit brings a bug back, the regression suite catches it, Entire names the commit | Permanent protection |
| 2:35–3:00 | cfo.ai: cost per assessment, pricing, runway | It works as a business |

## 4. Scope

**In (P0):**
- The 18 P0 attacks from `ATTACKS.md`, organized as four security stories and one reliability story:
  1. **Indirect injection through Crustdata data** (D1, D2). This is the hero.
  2. **Model-generated unsafe SQL and cross-tenant access** (E1, E2)
  3. **Jailbreak and system-prompt extraction** (C1–C3, F1)
  4. **Denial of wallet** (H1, H2)
  5. **Tool faults:** timeout, 429, 5xx, empty result (B1–B4)
  6. Plus the cheap ones that come almost free: A1, A5, A6, G1–G3
- The full loop (§6) for every P0 story
- A one-page dashboard and a CLI

**Out:** real DDoS or high-volume traffic, attacking any target that isn't allowlisted, multi-user auth, billing, a polished UI, and P2 attacks (roadmap slide only).

**P1 if time allows:** C4–C6, B5–B8, E6, F2, F3, H3–H5, I3.

**Cut order if time runs short** (cut from the top):
1. Dashboard polish (fall back to CLI plus links)
2. The "regression returns" beat
3. P1 attacks
4. Parallel fixers (run them one at a time)

**Never cut:** D1 end to end, the neatlogs divergence view, the Entire checkpoint on each fix, and the replay proof.

## 5. The target agent: "AcmeSales Copilot"

A B2B sales assistant for account executives. It's a realistic agent that a startup might actually ship. It must not look like a strawman built to fail.

It lives in its **own single repo** (`acmesales-copilot`, with Entire enabled) and implements the target contract in `ARCHITECTURE.md` §3. Preflight must work on any **system** that implements that contract, including systems of several agents across several repos. For the demo, though, AcmeSales is **one agent in one repo**: don't build a multi-agent demo target.

- **Model:** Sonnet-class through the hackathon LiteLLM proxy by default (configurable; Bedrock and the Anthropic API are optional backends)
- **Users:** sales reps at two customer companies (**tenant A** and **tenant B**) who share one deployment
- **Example requests:** "Research acme.io before my call", "What's the history with this account?", "Issue a $200 credit for the outage", "Draft a follow-up to the champion"
- **Tools:**

| Tool | Real or mock | Why it exists |
|---|---|---|
| `company_lookup(domain)` | **Real Crustdata**, routed through the chaos proxy | Research. The vector for indirect injection and tool faults |
| `crm_query(question)` | Real SQLite. The agent writes the SQL | Account history. The vector for the SQL and cross-tenant attacks |
| `issue_credit(account_id, amount, reason)` | Mock ledger | Money. Excessive-agency attacks |
| `send_email(to, subject, body)` | Mock outbox | Exfiltration and agency attacks |
| `log_activity(account_id, note)` | Real SQLite | Benign, for normal behavior |

- **Data:** SQLite with accounts, contacts, deals, invoices, credits and activities for both tenants. **Canary tokens** (fake secrets with unique strings) are planted in the system prompt, in a tenant B record and in a config table.
- **Seeded weaknesses:** the target ships with realistic, fixable flaws of these kinds:
  - SQL built by string formatting, with no tenant scoping
  - Tool output pasted into the prompt as if it were trusted instructions
  - Naive retries with no backoff or cap, and empty results not handled
  - No per-session token, step or $ budget
  - No confirmation step before credits or emails
  - The system prompt holds a secret and nothing guards the output

  Exact locations go in `KNOWN_WEAKNESSES.md`, which **Preflight must never read**. It's only used to check whether Preflight found them.

## 6. The core loop

| Step | Input | Output | Works if |
|---|---|---|---|
| **1. Attack** | AttackSpecs × N seeds | Conversations with the target, with chaos-proxy faults and poisoned fixtures applied | Every run completes or times out cleanly, and no run escapes the allowlist or caps |
| **2. Trace** | Each run | A neatlogs trace tagged with `attack_id`, `seed`, `run_id`, `target_version`. The trace ID is captured | Each run's trace can be read back by ID |
| **3. Grade** | Trace plus local run log | Verdicts from deterministic graders first (canary, forbidden-tool watchlist, SQL AST, cost cap), then an LLM judge only for fuzzy checks | Graders agree with hand labels on the canned test runs |
| **4. Cluster** | Failed runs | 3–8 clusters, each with a signature and a one-line hypothesis | A human would agree with the grouping |
| **5. Divergence** | A passing run and a failing run of the same attack, or the expected-behavior spec | The **first step** where the two differ, plus a deep link to that span in neatlogs | It points at the step where the bad decision was made |
| **6. Fix** | Cluster, divergence and the code it points to (found with entire-graph) | One fixer agent per cluster, each on its own branch, with an **Entire checkpoint** recording the reasoning | Each fix is a small, readable diff that targets the root cause |
| **7. Review** | Diff, checkpoint and the replay result from step 8 | A human **approves, requests changes** (the fixer revises), **edits the fix directly**, or rejects | Nothing merges without approval, and every version (fixer- or human-written) passes replay before merge |
| **8. Replay and regress** | The exact failing seeds, run K times against the fixed branch | A before/after pass rate. Passing cases are saved to `regressions/` and rerun on every later change | The fix holds K/K and nothing that used to pass now fails |

## 7. Sponsor map

**Rule: every sponsor tool has to change an outcome, not just record something.** This is 25% of the score, and four of the five judges built these tools.

| Tool | Job in the loop | Where it shows in the demo |
|---|---|---|
| **neatlogs** (required) | Records every run. Preflight **reads traces back** (`GET /api/traces/v3/:traceId`) to grade, cluster and find divergence | Trace link with the divergence step highlighted, and cost per run |
| **Entire** (required) | A checkpoint with reasoning on every fix. entire-graph finds the responsible code and, later, the commit that caused a regression | Checkpoint view, "regression caused by commit X" |
| **cfo.ai** (required) | Pricing, costs and runway, built from the measured cost per run in `cost_report.csv` | Final beat of the demo |
| **Orchestrator.inc** (sponsor; its founder is a judge) | Runs fixer agents in parallel with `ao spawn`, one worktree each | Fixers running side by side |
| **LiteLLM** (hackathon credit) / optional **AWS Bedrock** | The model gateway for the target and for Preflight | — |
| **Crustdata** | The target's company data, and the injection vector | The poisoned company record |

## 8. Numbers the system must produce

- **Scorecard:** attacks that succeeded out of total, before and after, by family and by OWASP LLM Top 10 ID
- **Per fix:** replay pass rate before → after (e.g. 1/5 → 5/5)
- **Cost:** per attack run, per full assessment, and for the fixers (from neatlogs plus the fixer logs)
- **Time:** wall clock for a full assessment
- **Regressions caught** by the regression suite
- Everything also goes to `out/report.json` and `out/cost_report.csv`, which is the cfo.ai input

## 9. Run modes and budget

| Mode | Purpose | Seeds | Replays | Default cap |
|---|---|---|---|---|
| `dev` | Fast iteration while building | 1 | 2 | **$1** per run |
| `full` | Recording the demo | 3–5 | 3–5 | **$8** per run |

Caps are set in `config.yaml` and **enforced in code**: the run stops cleanly with a partial report when a cap is hit. The whole hackathon has only about **$20 of LiteLLM** (plus optional AWS credit and 5,000 Crustdata credits), so **be flexible**: use whatever models the key actually has, scale seeds and replays down to fit, cache Crustdata responses, and use fixtures in `dev` mode. Note in `DECISIONS.md` any change made to fit the budget. Claude Code fixers bill to the user's Claude Code login, not to LiteLLM.

## 10. Definition of done

From a fresh clone with a filled-in `.env`, `make demo`:
1. Runs the full loop on the P0 catalog in under 20 minutes and under the `full` cap
2. Prints the before/after scorecard and writes `out/report.json` and `out/cost_report.csv`
3. Links every cluster to a neatlogs trace, and every fix to an Entire checkpoint
4. Shows K/K replay passes for every approved fix
5. Leaves the regression suite green on the final target

## 11. Guardrails

Details are in `CLAUDE.md`. In short: an allowlist plus an ownership token on the target, caps on RPS, $ and time per run, a kill switch, and money and email tools that are always mocks. There's no real DDoS. The load test (H4) is a small, bounded ramp against your own local or staging target.

## 12. Glossary

- **Attack:** one AttackSpec, a single kind of hostile scenario
- **Seed:** one concrete variant of an attack (wording, persona, fixture)
- **Run:** one execution of an attack plus seed against one target version
- **Verdict:** a grader's pass or fail on a run, with evidence
- **Cluster:** a group of failed runs that share a root cause
- **Divergence step:** the first step where a failing run departs from the correct behavior
- **Fix:** a code change on a branch, with an Entire checkpoint, aimed at one cluster
- **Replay:** rerunning the exact seeds of a cluster against a fixed version
- **Regression test:** a replayed case saved permanently and rerun on every change

## 13. Assumptions and fallbacks

**If something is blocked, take the fallback, log it in `DECISIONS.md`, and keep going. Never stop the build for these.**

| Unknown | Assumption | Fallback |
|---|---|---|
| neatlogs read-back | `GET /api/traces/v3/:traceId` returns spans for a captured trace ID | The runner also writes a local JSONL mirror of every run, the graders read that, and the UI still links to neatlogs |
| neatlogs instrumentation | Auto-instrumentation covers the OpenAI-compatible client used for LiteLLM | Wrap model and tool calls with manual `@span`s |
| Orchestrator.inc dispatch | `ao spawn --agent <claude-code adapter> --prompt … --branch …` works from a script, with the `ao` daemon running | The same `Fixer` interface, backed by `claude -p` in git worktrees |
| entire-graph | Can map a divergence step or file to the commit and checkpoint behind it | `git blame` plus `entire` checkpoint lookup by commit |
| cfo.ai | No API | Preflight only writes `cost_report.csv`, and a human enters it |
