# Preflight — Architecture

How Preflight is built. For **what** and **why**, see `SPEC.md`. For the attacks, see `ATTACKS.md`.

## 1. Principles

1. **Target-agnostic.** Preflight tests a **system**: one or more agents, each in its own repo, described by a `preflight.yaml` (§3). A single agent is just a system with one component. AcmeSales Copilot (one component, one repo) is only the first target. Nothing in Preflight may import or hardcode target code.
2. **Stateless loop, everything on disk.** The coordinator is a plain state machine. It holds no state in memory that isn't also in the **run ledger** (§5) and `preflight.db`. Any step can be killed and resumed.
3. **LLMs get pointers, not dumps.** An LLM step receives a short task plus *paths* into the ledger. It reads what it needs. Prompts never inline whole traces.
4. **Deterministic first.** Graders, clustering signatures and divergence detection are code. LLMs only write hypotheses, judge fuzzy behavior, play attackers, and fix code.
5. **Provider-flexible.** Every LLM call goes through one gateway (§9). Models are picked by role from whatever the key actually has access to.

## 2. Repos

| Repo | What it is | Who writes it |
|---|---|---|
| `neathacks-project` (this one) | **Preflight** | Fable |
| `acmesales-copilot` (separate repo, sibling directory, Entire enabled) | **The demo target**, built to the contract in §3 with the weaknesses from `SPEC.md` §5 seeded in | Fable writes v0; after that, **only Preflight's fixers** commit to it |

Keeping the target separate means its git and Entire history show only *fixer* commits and checkpoints. That makes "regression caused by commit X" clean. Fable records the target's seeded-weakness map in `acmesales-copilot/KNOWN_WEAKNESSES.md`, and that file is in Preflight's read-denylist.

## 3. Target contract

**Generality vs. the demo:** the contract and the runner support **multi-component systems** (several agents and repos) from day one. The **demo target is one component in one repo** (AcmeSales). Don't build a second demo agent. Multi-component support is covered by unit tests with a tiny two-component fixture system.

### 3.1 `preflight.yaml`
It lives in the entrypoint component's repo, or in a separate system repo for multi-repo systems.

```yaml
system: acmesales
entrypoint: copilot                       # where simulated users talk
ownership_token: "${PREFLIGHT_OWNERSHIP_TOKEN}"
tenants: {header: X-Tenant-Id, ids: [tenant_a, tenant_b]}
roles: {rep: {forbidden_tools: []}, manager: {}}
budgets: {max_steps: 15, max_tokens: 60000, max_usd: 0.25}   # per run, whole system

components:
  copilot:
    repo: ../acmesales-copilot
    start: make serve
    healthcheck: http://localhost:8100/health
    chat_endpoint: http://localhost:8100/chat
    tools_endpoint: http://localhost:8100/preflight/tools    # real tool schemas (§3.3)
    test_command: make test               # fixers must keep this green
    editable_paths: [app/, prompts/]      # fixers may only change these
    canaries_file: preflight/canaries.json
    calls: []                             # agent-to-agent edges, e.g. [research]
    tools:                                # ANNOTATIONS ONLY; names must match discovered tools
      company_lookup:
        source: app/tools/crustdata.py:company_lookup   # fixers + entire-graph start here
        upstream_env: CRUSTDATA_BASE_URL               # chaos proxy is swapped in via this env var
      crm_query:
        source: app/tools/crm.py:crm_query
        kind: sql                         # enables sql_ast + tenant graders
      issue_credit:
        source: app/tools/billing.py:issue_credit
        high_impact: true
        confirm_required_above: 100
      send_email:
        source: app/tools/email.py:send_email
        high_impact: true
      log_activity:
        source: app/tools/crm.py:log_activity
```

A multi-component system adds more entries under `components` and lists the edges in `calls`. Each component carries its own `repo`, `editable_paths` and `test_command`.

### 3.2 HTTP contract (every component)
- `POST /chat`: body `{session_id, tenant_id, user_role, message}`, returns `{reply, tool_calls[], usage{input_tokens, output_tokens, usd}, steps, neatlogs_trace_id}`
- `GET /preflight/tools` returns the **exact tool schemas the model sees** (name, description, JSON schema)
- `GET /preflight-verify` returns the ownership token. Preflight refuses to attack a system where any component fails this.
- Preflight sends `X-Preflight-Run-Id`, `-Attack-Id`, `-Seed`, `-Fault`, `-Fixture` and `-Target` (which component or edge the fault applies to). **Every component must forward these on all tool calls *and* agent-to-agent calls**, and tag its neatlogs spans with them. That way one run is one connected trace across all components.

### 3.3 Tool descriptions: discovered, then annotated
Tool descriptions are **not copied into the yaml**. They come from the agent itself, so they can never drift from what the model actually sees. The yaml only adds what Preflight needs and the agent doesn't know: risk, code location, and proxy routing.

```text
preflight init
  for each component
    discover tools from /preflight/tools
    match each discovered tool with its yaml annotation by name
      found, not annotated   → test with default risk; warn in report
      annotated, not found   → fail init (yaml is stale)
      no tools_endpoint      → use `description:` + `schema:` given in the yaml (fallback)
    check every `source:` path exists in the component repo
```

The discovered tool schemas are saved to the ledger (`manifest.json`). The seed generator uses them to write realistic attacks, and the fixer brief includes the `source:` paths.

### 3.4 Testing a system as a whole
- **End-to-end:** attacks enter at `entrypoint`, like a real user.
- **Inner agents:** I1/I2 attacks also call an inner component directly, or poison one component's output to another (the chaos proxy sits on `calls` edges too). This becomes P1 when the system has more than one component.
- **Ownership:** each step in `steps.jsonl` records its `component`. The divergence step decides **which component (and so which repo) a cluster belongs to**.
- **Cross-repo fixes:** if the analyst says a fix needs changes in two components, the dispatcher creates **linked fixes**, one per repo. They're replayed **together** and approved together.

## 4. Components

| # | Component | Module | Kind |
|---|---|---|---|
| 1 | System loader | `preflight/target/` | Code: parses `preflight.yaml`, boots every component, health-checks them, verifies ownership, discovers and annotates tools (§3.3) |
| 2 | Chaos proxy | `preflight/chaos/` | Code: an HTTP proxy on tool upstreams and on agent-to-agent edges. Reads `X-Preflight-Fault`, `-Fixture` and `-Target` and injects timeouts, 429s, 5xx, empty or truncated bodies, renamed fields, latency, or a poisoned fixture. Caches real upstream responses to `fixtures/cache/` |
| 3 | Guard | `preflight/guard/` | Code: allowlist plus ownership check, RPS limiter, spend tracker, wall-clock limit, kill switch (`preflight stop` or the `STOP` file) |
| 4 | Catalog and seeds | `preflight/attacks/` | Code plus an LLM: loads `attacks/*.yaml`, creates variants |
| 5 | Runner | `preflight/runner/` | Code: runs the matrix with bounded concurrency and writes the ledger |
| 6 | Persona attacker | `preflight/llm/attacker.py` | LLM |
| 7 | Trace reader | `preflight/traces/` | Code: `GET /api/traces/v3/:traceId` from neatlogs, falling back to the ledger |
| 8 | Graders | `preflight/graders/` | Code, plus an LLM `judge` |
| 9 | Analyzer | `preflight/analyze/` | Code (signatures, divergence) plus an LLM analyst (hypotheses) |
| 10 | Fix dispatcher | `preflight/fix/` | Code: writes briefs, starts fixers, collects results, retries |
| 11 | Fixer backends | `preflight/fix/backends/` | Claude Code, via `ao spawn` or `claude -p` |
| 12 | Replay and regression | `preflight/replay/` | Code |
| 13 | Reporter | `preflight/report/` | Code |
| 14 | Dashboard | `preflight/web/` | FastAPI plus one HTML page, updated live over SSE |
| 15 | State store | `preflight.db` (SQLite) | Indexes for the ledger: runs, verdicts, clusters, fixes, costs |
| 16 | Model gateway | `preflight/llm/gateway.py` | Code (§9) |

## 5. Run ledger (context for any LLM step)

Every assessment writes an append-only folder. This is how any LLM step, now or later, gets all the context of a run: give it the path.

```
ledger/<assessment_id>/
  README.md                 # generated index: what's here, scorecard, links; read this first
  manifest.json             # target name + commit, config, models used, caps, timestamps
  events.jsonl              # every coordinator state transition, append-only
  runs/<run_id>/
    run.json                # RunRecord (§8)
    transcript.md           # human/LLM-readable: turns, tool calls+args+results, faults injected
    trace.json              # raw neatlogs trace (or local mirror if unavailable)
    steps.jsonl             # normalized steps: {i, component, type, tool, args_digest, result_kind, tokens, usd}
    verdicts.json           # each grader: pass/fail + evidence
  clusters/<cluster_id>/
    cluster.json            # signature, run_ids, divergence, hypothesis
    divergence.md           # side-by-side pass vs fail around the divergent step + neatlogs links
  fixes/<cluster_id>/
    brief.md                # what the fixer was given (§7)
    attempt-<n>/            # diff.patch, fixer log, entire checkpoint id, replay result,
                            # review.md (reviewer comments / edits), author: fixer|human
  report/
    report.json  scorecard.md  cost_report.csv
```

Rules:
- `transcript.md` and `divergence.md` are written for LLMs and humans: plain text, short, with links. `trace.json` stays raw for completeness.
- Every LLM call's prompt and response also goes to `llm_calls.jsonl`, so the LLM steps are auditable too.
- The ledger must be enough to **resume or redo any step** without rerunning attacks.

## 6. Coordinator (state machine)

```
INIT → BOOT_TARGET → VERIFY_OWNERSHIP → ATTACK → GRADE → CLUSTER → DIVERGE
     → FIX ⇄ REPLAY (retry ≤2 with replay feedback) → AWAIT_APPROVAL → MERGE
     → REGRESSION_SUITE → REPORT → DONE
```
- Every transition is appended to `events.jsonl`. `preflight resume <assessment_id>` picks up from the last completed state.
- **Recovery:** when a fix fails replay, the dispatcher writes `attempt-<n>/replay_failure.md` and sends the fixer back with it, up to 2 more times. After that, the cluster is marked `needs_human` and the run continues with the others.
- Cap breach or kill switch: move to `REPORT` with partial results and mark the assessment `stopped`.
- `AWAIT_APPROVAL` blocks only on that cluster. The other clusters keep moving.

### Human review
The reviewer can change the fix, not only accept or reject it. **Every version is replayed before it can be merged.**

```text
AWAIT_APPROVAL
  approve          → MERGE   (only if the latest version passed replay and tests)
  request changes  → reviewer comment saved to attempt-<n>/review.md
                     → fixer attempt n+1 reads it → REPLAY → AWAIT_APPROVAL
                     (doesn't count against the 2 automatic retries)
  edit myself      → human commits on fix/<cluster> (dashboard editor or local checkout)
                     → new attempt with author=human → REPLAY on that commit → AWAIT_APPROVAL
  reject           → needs_human, reason saved to the ledger
```
Human edits are committed with Entire running, so the history shows both why the fixer changed the code and what the reviewer changed afterwards. Linked cross-repo fixes (§3.4) are reviewed and approved as one unit.

## 7. LLM roles and their context

| Role | Gets (pointers, not dumps) | Produces | Default model tier |
|---|---|---|---|
| Seed generator | Attack row from `ATTACKS.md`, its hand-written seeds, target `preflight.yaml` | N variants (yaml) | cheap |
| Persona attacker | Attack goal, persona, conversation so far | Next user turn | cheap |
| Judge | Rubric + `transcript.md` | pass/fail + quoted evidence | cheap |
| Analyst | Ledger `README.md`, cluster run summaries (`steps.jsonl`), `divergence.md` | 1-line hypothesis + suspected code area per cluster | strong |
| **Fixer** (Claude Code) | `brief.md` + the target repo + **ledger path** | Diff on a branch + Entire checkpoint | Claude Code |

**`brief.md`** contains:
- the cluster hypothesis
- the safe behavior from `ATTACKS.md`
- 2–3 failing `transcript.md` paths
- `divergence.md`
- entire-graph locations, plus earlier checkpoint reasoning for those files
- `editable_paths`
- the replay command (`preflight replay --cluster <id> --target-dir .`) so the fixer can check its own work
- rules: keep the diff small, keep `test_command` green, don't weaken or skip tests, don't hardcode around the seeds

## 8. Schemas

- **AttackSpec:** `id, family, owasp, tier, vector, description, safe_behavior, multi_turn, max_turns, faults[], fixture, graders[], seeds[]`
- **RunRecord:** `run_id, assessment_id, attack_id, seed_id, target_commit, mode, neatlogs_trace_id, started_at, duration_ms, steps, tokens_in, tokens_out, usd, verdicts{grader: {pass, evidence}}, failed`
- **Cluster:** `cluster_id, signature, attack_ids[], run_ids[], divergence{run_pass, run_fail, step_index, step_desc, trace_links[]}, hypothesis, suspected_paths[], status`
- **FixAttempt:** `cluster_id, n, author (fixer|human), review_comment, linked_fix_ids[], component, backend, branch, diff_path, entire_checkpoint_id, replay{before: "1/5", after: "5/5"}, tests_green, status`
- **Finding** (lives across assessments, used to spot regressions): `signature, first_seen, fixed_by_commit, fixed_in_assessment, last_seen`

**Cluster signature:** `(attack family, failing grader set, normalized tool sequence up to the first violation)`. It's deterministic. The analyst can merge or split clusters but has to give a reason in `cluster.json`.

**First divergence:** take a passing and a failing run of the same attack, using the normalized `steps.jsonl` from each, and find the first index where `(type, tool, result_kind)` differs. If no run of that attack passes, compare against the safe-behavior spec and the first step that violates a grader. Keep it this simple.

## 9. Model gateway and budget

- **Default provider is the hackathon LiteLLM proxy** (OpenAI-compatible): `LITELLM_BASE_URL` and `LITELLM_API_KEY`. Bedrock and the Anthropic API are optional backends behind the same interface.
- **Be flexible.** At startup, call the proxy's `/models` and map **roles to tiers** using a preference list: `strong` = Sonnet-class, `cheap` = Haiku-class or similar. If a preferred model isn't there, use the closest one available and log the choice in `DECISIONS.md`. Don't fail.
- The target's model is the target's choice, configured in the target repo, and also points at LiteLLM by default.
- **Budget:** the whole hackathon has about **$20** of LiteLLM. Every call records its cost in the ledger. The guard enforces per-assessment caps (`dev` defaults to $1, `full` to $8; change them in `config.yaml`). Gateway errors such as 402 or budget exceeded **stop the assessment cleanly** with a partial report.
- Spend less in `dev`:
  - `cheap` tier for everything except the analyst
  - 1 seed per attack, P0 attacks only
  - cached Crustdata fixtures
  - judge calls skipped where a deterministic grader already decided
- Claude Code fixers bill to the user's Claude Code login, not to LiteLLM.

## 10. Fixer backends

```python
class Fixer(Protocol):
    def start(self, brief_path, target_dir, branch) -> FixHandle: ...
    def status(self, h) -> Literal["running","done","failed"]: ...
    def result(self, h) -> FixResult: ...   # diff, log, checkpoint id
    def send(self, h, message_path): ...    # used for retry with replay feedback
```
- `OrchestratorFixer`: `ao spawn --project <target> --agent <claude-code adapter> --branch fix/<cluster> --prompt "<read brief.md>"`, then polls `ao session get` and uses `ao send` for retries. It needs the `ao` daemon running.
- `ClaudeCodeFixer`: a git worktree per cluster, running `claude -p "<read brief.md>" --output-format json`, up to 3 in parallel.
- Selected with `FIXER_BACKEND=auto|orchestrator|claude`. `auto` uses Orchestrator if `ao status --json` reports healthy and otherwise uses Claude Code.

## 11. Entire and neatlogs

- **Entire:** enabled in the target repo. Each fix attempt runs in a session Entire captures, so the checkpoint holds the fixer's reasoning. Preflight records the checkpoint ID in `FixAttempt`. entire-graph (or `git blame` plus an Entire lookup as the fallback) feeds `suspected_paths` and the regression blame. Check the exact commands against `docs/vendor/entire/`.
- **neatlogs:** two projects.
  - In the **target**: auto-instrumentation of its OpenAI-compatible LiteLLM client, plus manual spans for tool calls, tagged with the `X-Preflight-*` IDs.
  - In **Preflight itself**: its own LLM calls and coordinator steps, so Preflight is observable too, and its cost per assessment comes from neatlogs.

## 12. CLI and dashboard

```
preflight init <target_dir>                 # validate preflight.yaml, boot, verify ownership
preflight run  <target_dir> --mode dev|full [--attacks P0|D1,E1]
preflight resume <assessment_id>
preflight approve <cluster_id>
preflight reject <cluster_id> --reason "..."
preflight request-changes <cluster_id> --comment "..."   # fixer revises, then replay
preflight edit <cluster_id>                 # checks out fix branch; on save/commit, replays
preflight replay --cluster <id> --target-dir <dir> [-k 5]
preflight regress <target_dir>              # run regression suite only
preflight report <assessment_id>
preflight stop
```
The dashboard (`preflight web`, port 8200) shows:
- the live scorecard by family and OWASP ID
- the cluster list, with neatlogs links and the divergence view
- fix cards with the diff, Entire checkpoint link, replay before → after, and **Approve / Request changes / Edit / Reject**. Edit opens the diff in a simple in-browser editor (a textarea per file is fine) and commits on save. Comments go to the fixer
- running cost

## 13. Stack

Python 3.11+, FastAPI, httpx (async), SQLite, PyYAML, `sqlglot` for `sql_ast`, the OpenAI SDK pointed at LiteLLM, neatlogs SDK, Typer for the CLI, and one HTML page using HTMX or plain JS for the dashboard. Use `make` targets for everything. Mock nothing on the demo path that the spec says is real.
