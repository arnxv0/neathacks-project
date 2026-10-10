# Preflight — Business Model

Everything needed to build Preflight's financial model in **cfo.ai**. The numeric inputs are also in `cfo/assumptions.csv`, which you can attach to Ari for import.

> **All numbers are planning assumptions (estimates), not data.** The one input we will *measure* is unit cost (COGS), which comes from real Preflight runs via neatlogs (`out/cost_report.csv`). Replace the estimates below with the measured values before the demo. That swap is the cfo.ai story for the judges.

---

## 1. The business in one paragraph

Preflight sells **"launch confidence" for AI agents**. It attacks a customer's agent before launch and on every change after, fixes what it finds, and proves the fix holds. It sells to teams shipping agents that touch customer data or money. There are three motions: **self-serve SaaS** (startups), **team plans** (mid-market), and **enterprise contracts** (regulated industries that need evidence for auditors). A one-off **Pre-launch Assessment** service brings in cash early and leads into subscriptions.

## 2. Problem → why customers pay

| Pain | Who feels it | What it costs them today |
|---|---|---|
| Agent breaks in front of customers (tool failures, hallucinated results) | Eng lead | Incidents, churn, rollback |
| Agent gets manipulated (prompt injection, data leaks, unauthorized actions) | CISO / head of AI | Breach risk, legal exposure, blocked launches |
| Security review blocks the launch, and there's no evidence to show | Eng + security | Weeks of delay; manual red-teaming at $20–50k per engagement (estimate) |
| Every prompt or model change can reintroduce old failures | Eng | No regression safety net for agent behavior |

**Why we're different:** most tools only *find* issues. Preflight closes the loop: find → explain (trace divergence) → **fix** → **prove the fix holds** (replay K/K) → keep it as a regression test. It covers reliability and security in one product, and it works on multi-agent systems across repos.

## 3. Customer segments (ICP)

| Segment | Profile | Buyer | Motion | Plan |
|---|---|---|---|---|
| **S1: AI-native startups** | Seed–Series B, shipping 1–3 agents | CTO / founding eng | Self-serve, product-led | Free → Pro |
| **S2: Mid-market SaaS** | 100–1,000 employees, adding agents to an existing product | VP Eng / head of AI | Sales-assisted | Team |
| **S3: Enterprise / regulated** | Fintech, insurance, health, B2B platforms | CISO + head of AI | Sales-led, security review | Enterprise |
| **Channel: agent agencies** | Consultancies that build agents for clients | Founder | Partner (resell assessments) | Pro / Team at a partner discount |

**Beachhead:** S1 plus the Assessment service. Crustdata can build the target lists: companies hiring for "AI agent" or "LLM engineer" roles, recently funded.

## 4. Pricing

| Plan | Price | Includes | Overage |
|---|---|---|---|
| **Free** | $0 | 1 target, 100 attack runs/mo, P0 catalog, find only (no auto-fix) | — |
| **Pro** | **$499/mo** (or $4,990/yr) | 3 targets, 2,500 runs/mo, 25 auto-fixes/mo, CI regression suite, neatlogs + Entire integration | $0.05/run, $5/fix |
| **Team** | **$1,999/mo** (or $19,990/yr) | 10 systems (multi-agent, multi-repo), 15,000 runs/mo, 150 fixes/mo, SSO, custom attack packs | $0.04/run, $4/fix |
| **Enterprise** | **from $60k/yr** (avg ACV assumption $75k) | Unlimited systems, VPC/self-hosted runner, compliance reports (OWASP LLM Top 10, ISO 42001 / EU AI Act evidence), SLA | Custom |
| **Pre-launch Assessment** (service) | **$7,500** one-off | Full assessment, human-reviewed report, fix PRs, 30-day Pro trial | — |

**Value metric:** attack runs and fixes. They track both the value delivered and our COGS.

## 5. Unit costs (COGS): measure these, don't guess

The customer's **target** model costs are paid by the customer, because their agent runs on their own keys. **Our** COGS is the attacker, judge, analyst, fixer and infra cost.

| Cost item | Estimate (replace with measured) | Source once measured |
|---|---|---|
| LLM cost per attack run (seed gen amortized, persona attacker, judge when needed) | **$0.02** | neatlogs, Preflight project |
| Analyst per assessment | **$0.50** | neatlogs |
| Fixer per fix attempt (Claude Code) | **$2.00** | Fixer logs |
| Avg attempts per accepted fix | **1.4** | Ledger |
| Replay runs per fix (K=5 × seeds) | **15 runs** | Ledger |
| Infra per assessment (compute, storage) | **$0.30** | AWS bill / estimate |
| **→ Full assessment (250 runs, 5 fixes)** | **≈ $20** | `out/cost_report.csv` |
| Platform base infra | $500/mo, growing with customers ($15 per paying customer per month) | Estimate |
| Payment processing (Dodo Payments as merchant of record) | ~5% of self-serve revenue (verify their rate) | Estimate |

**Implied COGS per customer per month (estimates):**

| Plan | Typical usage | COGS/mo | Gross margin |
|---|---|---|---|
| Pro | 4 assessments + CI regression runs (~1,500 runs, ~15 fixes) | ~$90 | ~80% |
| Team | ~8,000 runs, ~60 fixes | ~$450 | ~77% |
| Enterprise | ~30,000 runs, ~200 fixes | ~$1,700/mo | ~73% |
| Assessment | 1 full assessment + ~6h human review at $75/h | ~$470 | ~94% |

**Target blended gross margin: 75–80%.**

## 6. Go-to-market and funnel assumptions (base case)

| Driver | Base assumption |
|---|---|
| Launch | Month 1 = November 2026 (right after the hackathon) |
| Free signups | 60 in month 1, growing **20% MoM** (OSS attack catalog, content, #neatHack, OWASP community) |
| Free → Pro conversion | **4%** of that month's signups convert within the month (plus 1% of the free base per month) |
| Pro → Team upgrades | **3%** of Pro customers per month, from month 6 |
| New Team (direct, sales-assisted) | 0 until month 6, then 1/mo, +1 every 4 months |
| New Enterprise | First in **month 9**, then 1 per quarter, then 1/mo from month 18 |
| Assessments sold | 1 in month 2, 2/mo from month 3, 4/mo from month 9 |
| Assessment → subscription | **40%** become Pro or Team within 2 months |
| Monthly logo churn | Pro **4%**, Team **2%**; Enterprise **10%/yr** |
| Expansion (overage + seats) | Net revenue retention **115%** on Team/Enterprise |
| Annual prepay mix | 20% of Pro, 40% of Team, 100% of Enterprise (cash timing) |
| CAC (blended spend / new customers) | Pro **$800**, Team **$6,000**, Enterprise **$30,000** |
| Enterprise sales cycle | 3–4 months, so pipeline starts in month 5 |

## 7. Team and headcount plan

Fully loaded = salary plus about 20% taxes and benefits. Remote team, US or India mix. Adjust to your situation.

| Role | Start month | Monthly loaded cost |
|---|---|---|
| Founder 1 (CEO / GTM) | 1 | $6,000 |
| Founder 2 (CTO) | 1 | $6,000 |
| Founding engineer | 4 | $14,000 |
| AI security researcher (red-team lead, owns the attack catalog) | 6 | $15,000 |
| Founding AE / GTM | 9 | $10,000 base + 10% of new ACV as commission |
| Engineer #2 | 12 | $14,000 |
| Solutions / forward-deployed engineer (enterprise) | 15 | $14,000 |
| Engineer #3 | 18 | $14,000 |

Founder salaries step up to $10,000/mo each after the seed round closes.

## 8. Operating expenses

| Item | Amount | Timing |
|---|---|---|
| Dev tools and SaaS (neatlogs, Entire, GitHub, Claude Code seats, etc.) | $800/mo, +$150 per hire | From month 1 |
| Marketing (content, ads, community) | $2,000/mo, rising to $6,000/mo from month 12 | From month 1 |
| Conferences (RSA, Black Hat, AI Engineer, OWASP) | $15,000/quarter | From month 9 |
| Legal and accounting | $2,000/mo | From month 1 |
| Incorporation and IP | $5,000 one-off | Month 1 |
| **SOC 2 Type I, then Type II** (needed for enterprise) | $35,000 + $25,000 | Months 8 and 14 |
| Insurance (E&O / cyber) | $12,000/yr | From month 6 |
| Bug bounty / third-party pentest of our own platform | $10,000 | Month 10 |

## 9. Funding

| Item | Base assumption |
|---|---|
| Starting cash | $25,000 (founders) plus hackathon prize money if we win |
| Credits | AWS / LiteLLM / Crustdata hackathon credits, about $0 cash impact |
| Pre-seed | **$750,000** in month 3 (SAFE) |
| Seed | **$3,000,000** in month 12, if month-11 ARR ≥ $600k (milestone) |
| Minimum cash buffer | 6 months of burn |

## 10. Scenarios

| Driver | Downside | Base | Upside |
|---|---|---|---|
| Signup growth MoM | 12% | 20% | 30% |
| Free → Pro conversion | 2.5% | 4% | 6% |
| Pro churn / mo | 6% | 4% | 3% |
| Enterprise deals | Start month 12, 1 per quarter | As in §6 | Start month 7, 1/mo from month 12 |
| COGS per assessment | $35 | $20 | $14 |
| Pre-seed | $500k | $750k | $1M |
| Seed | Not raised | $3M in month 12 | $5M in month 10 |

## 11. What cfo.ai should produce

1. A **24-month monthly forecast**: MRR/ARR by plan, revenue (subscription, overage, assessment), COGS, gross margin, payroll, opex, operating income, ending cash
2. **Runway**, plus the month cash drops below a 6-month buffer, in each scenario
3. **Break-even month** and the ARR needed to break even
4. **Unit economics** by plan: CAC payback (months), LTV (margin × 1/churn), LTV:CAC
5. **Hiring check:** "Can we afford the security researcher in month 6 and the AE in month 9 without the seed?"
6. **Sensitivity:** how runway changes if COGS per assessment doubles, which is the case the measured cost protects against
7. A **board-style summary page** to use in the demo video

## 12. How to build it in cfo.ai

**Option A: chat with Ari (simplest).** Attach `cfo/assumptions.csv` and `BUSINESS.md`, then send these one at a time:

1. *"I'm building a new pre-revenue B2B SaaS called Preflight. Build a 24-month monthly operating model starting November 2026 from the attached assumptions: revenue by plan (Free, Pro, Team, Enterprise, Assessment service), COGS from unit costs, headcount from the hiring plan, opex, and the funding rounds. Treat every input as a Variable I can change."*
2. *"Create Downside, Base and Upside Scenarios using the scenario table in section 10."*
3. *"Show runway and break-even month for each Scenario, and the month cash falls below a 6-month buffer."*
4. *"Compute CAC payback, LTV and LTV:CAC for Pro, Team and Enterprise."*
5. *"Can we afford the AI security researcher in month 6 and the AE in month 9 if the seed round slips 6 months?"*
6. *"Build a one-page board summary: ARR, burn, runway, gross margin, headcount, for the Base scenario."*
7. After the real Preflight run: *"Update the COGS variables with these measured values from the attached cost_report.csv and show what changed in gross margin and runway."*

**Option B: through MCP from Claude Code (the strongest demo moment).**
```bash
claude mcp add --transport http cfoai https://api.cfo.ai/mcp   # then /mcp → cfoai → Authenticate
```
After a full Preflight run, Claude Code reads `out/cost_report.csv` and updates the COGS Variables in a **"Measured"** Scenario (never Main) through the `edit_table_blocks` / `edit_scenarios` tools. The demo can then show: *a real attack run → real cost → the business model updates itself.* (Build the model itself with Ari in the app first. The MCP tools edit an existing model; they don't create one from scratch.)

**Checklist:**
- [ ] Sign up (it needs a card) and **cancel the subscription right after** under Settings → Billing, as noted earlier
- [ ] Create the model with Ari (Option A, prompts 1–6)
- [ ] Connect MCP and test one edit on a scratch Scenario
- [ ] After the `full` demo run, push the measured COGS (prompt 7 or Option B)
- [ ] Screenshot the board summary and the Base vs Measured comparison for the video

## 13. Market size (bottom-up, our estimates)

| Layer | Assumption | Result |
|---|---|---|
| Companies shipping customer-facing AI agents (2027–28) | ~40,000 worldwide | — |
| Share that would pay for pre-launch and continuous agent testing | 30% | ~12,000 |
| Blended ACV | ~$15,000 | **SAM ≈ $180M/yr** |
| Plus enterprise compliance (5,000 enterprises × $75k) | — | **≈ $375M/yr** |
| **Total (SAM)** | — | **≈ $550M/yr**, growing with agent adoption |

These are our own planning estimates. Back them with sources before using them in a pitch deck.

## 14. Competitive landscape (verify before pitching)

| Type | Examples | Gap Preflight fills |
|---|---|---|
| LLM eval and red-team tools | Promptfoo, Giskard, Patronus AI, Haize Labs | Find issues but don't fix them or prove the fix holds |
| AI security / guardrail vendors | Lakera, Protect AI, HiddenLayer (several were acquired by large security companies, a sign the market is real) | Runtime filtering, not pre-launch testing plus code fixes |
| Observability | neatlogs, LangSmith, Arize | Show what happened. Preflight builds on them (we're a neatlogs partner, not a competitor) |
| Manual red-team consultancies | Security firms | Slow and expensive, one-off, no regression safety net |

**Moat over time:** the attack catalog and the regression corpus grow with every customer (anonymized attack patterns), along with fix patterns per framework and trace-native analysis.
