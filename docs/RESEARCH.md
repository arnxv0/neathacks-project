# Research behind Preflight's attack catalog

What the literature says about bypassing and testing LLM agents, and how each line of work maps to attacks Preflight runs today (IDs from `ATTACKS.md`) or should add next. arXiv ids are given so every claim can be checked; where a number is quoted it is the paper's own.

## 1. Indirect prompt injection through tool data (Preflight D1, D2, D3)

| Paper | What it showed | Preflight |
|---|---|---|
| Greshake et al., *Not what you've signed up for* (2302.12173) | Coined indirect prompt injection: instructions planted in data an LLM app retrieves (web pages, emails, records) get executed as if from the user. | D1 (poisoned Crustdata record), D2 (poisoned CRM note). Our hero attack is a direct instance. |
| Zhan et al., *InjecAgent* (2403.02691) | Benchmark of 1,054 test cases across 17 tools; tool-integrated agents follow injected instructions in a large fraction of cases, including data-exfiltration and financial-harm actions. | D1 seeds mirror its two classes: direct harm (post a credit) and data stealing (email contacts + key). |
| Debenedetti et al., *AgentDojo* (2406.13352) | End-to-end environment with 97 user tasks and 629 security cases; injections hide in tool outputs inside realistic multi-step tasks; attack success depends heavily on where in the trajectory the injection lands. | Our "first divergence step" is the same observation operationalised: Preflight reports the exact step where the injected text turned into an action. |
| Yi et al., *BIPIA* (2312.14197) | Benchmark for indirect injection; models follow injected tasks embedded in documents; defenses that mark data boundaries help. | The fixer's own fix (fencing provider text, "tool results are data") is the boundary-marking defense this paper evaluates. |
| Zverev et al. / Nasr et al., *Adaptive attacks break defenses against indirect prompt injection on LLM agents* (2503.00061) | Eight published defenses were bypassed by adaptive attackers with >50% success. | Argues for Preflight's regression suite: a fix that passes today must be re-attacked on every change (`preflight regress`). |
| *Simple prompt injection attacks can leak personal data observed by LLM agents during task execution* (2506.01055) | Injections cause agents to leak data they saw earlier in the task. | F1/F2 canaries: our contact-list and ops-key exfil seeds test exactly this. |
| *ChatInject* (2509.22830) | Injections formatted as chat-template tokens raise success rates substantially on open models. | Candidate new D1 seed variant (template-shaped payloads). |
| *AgentDyn* (2602.03117), *Are firewalls all you need?* (2510.05244) | 2025–26 critiques: static benchmarks saturate; an input/output firewall at the agent–tool boundary is strong but benchmarks need fixing. | Preflight is dynamic by design (live target, live Crustdata); the firewall result suggests a reusable fix pattern for the fixer briefs. |

## 2. Direct jailbreaks and prompt extraction (C1–C7)

| Paper | What it showed | Preflight |
|---|---|---|
| Perez & Ribeiro, *Ignore Previous Prompt* (2211.09527) | Goal hijacking and prompt leaking via simple override text. | C1 (override), C3 (extraction). |
| Wei, Haghtalab, Steinhardt, *Jailbroken* (2307.02483) | Two failure modes of safety training: competing objectives and mismatched generalisation (encodings, role play). | C2 (role play / developer mode), C4 (encoded requests), C5 (low-resource language). |
| Zou et al., *Universal and transferable adversarial attacks* (GCG, 2307.15043) | Optimised suffixes that transfer across models. | Out of scope for a product that attacks black-box agents; noted as roadmap (P2). |
| Chao et al., *PAIR* (2310.08419); Mehrotra et al., *TAP* (2312.02119) | An attacker LLM iteratively refines jailbreak prompts from the target's responses; TAP adds tree search and pruning. | Our persona attacker (`llm/attacker.py`) is a one-branch PAIR; adding a TAP-style refinement loop with the judge as the scorer is the highest-value upgrade. |
| Russinovich et al., *Crescendo* (2404.01833); *AutoAdv* (2511.02376); *X-Teaming* (2504.13203) | Multi-turn escalation from benign to harmful, automated. | C6 (multi-turn escalation) exists as P1; the persona attacker supports it. |
| Anil et al., *Many-shot jailbreaking* (Anthropic, 2024) | Long contexts filled with faux dialogues erode refusals. | H2 context-flooding seeds borrow the mechanism for budget attacks; a many-shot C-seed is a cheap addition. |
| *Capability-based scaling trends for LLM-based red teaming* (2505.20162) | Stronger attacker models beat stronger targets; PAIR/TAP outperform Crescendo at equal query budgets. | Justifies using the `strong` tier for the attacker in `full` mode. |
| OpenAI, *The Instruction Hierarchy* (2404.13208) | Training models to privilege system over user over tool text. | The principle our fixer rediscovers in `prompts/system.md`; Preflight verifies it empirically per target. |

## 3. Excessive agency, confused deputies, downstream injection (E1, E2, G1–G4, D4)

| Paper | What it showed | Preflight |
|---|---|---|
| Liu et al., *Prompt injection attack against LLM-integrated applications* (2306.05499); Liu et al., *Formalizing and benchmarking prompt injection* (2310.12815) | Injection as a general attack class against apps that compose LLM output into downstream systems. | E1 (model-written SQL), E6. |
| Zhang et al., *Agent Security Bench* (2410.02644) | 10 scenarios, 400+ tools, 27 attack types; finds high success for prompt injection and tool-misuse across agents. | Families C, D, E, G together cover ASB's main attack types on a single realistic target. |
| *Taming various privilege escalation in LLM-based agent systems* (2601.11893); *Capability gates are not authorization* (2606.28679) | Confused-deputy failures are pervasive in agent frameworks: capability to call a tool is mistaken for authorization. | G1, G2, A6 (role from chat), D4. The fixer's authority fix enforces session role in code, which is the paper's recommendation. |
| *Red-teaming coding agents from a tool-invocation perspective* (2509.05755) | Tool-invocation hijacking leads to RCE in coding agents including Claude Code. | Reminder that Preflight's own fixers are agents too: they run with a restricted tool allowlist and only inside the target's `editable_paths`. |
| Fang et al., *LLM agents can autonomously hack websites* (2402.06664) | Agents chain tools to achieve attacker goals end to end. | Motivates the "attack the system, not the model" framing. |
| *A survey on trustworthy LLM agents: threats and countermeasures* (2503.09648) | Taxonomy across intrinsic (brain, memory, tools) and extrinsic (user, agent, environment) threats. | Used to sanity-check family coverage; the missing axis is memory/long-horizon state (roadmap). |

## 4. Reliability, resource exhaustion, honesty (A, B, H, I3)

| Source | Point | Preflight |
|---|---|---|
| OWASP Top 10 for LLM Applications 2025 (LLM06 Excessive Agency, LLM09 Misinformation, LLM10 Unbounded Consumption) | The industry taxonomy auditors ask about. | Every attack carries its OWASP id; the scorecard groups by it. |
| Chaos engineering (Netflix, *Principles of Chaos*); SRE fault injection | Inject faults in production-like conditions, observe recovery. | B1–B8 through the chaos proxy; `retry`/`honesty` graders; the retry fix (bounded attempts, backoff, Retry-After) is textbook. |
| *Redefining AI red teaming in the agentic era: from weeks to hours* (2605.04019) | Argues red-teaming agents must be continuous and automated, integrated with the dev loop. | This is Preflight's thesis: find → fix → prove → regress on every change. |

## 5. Testing methodology Preflight adopts from the literature

- **Deterministic graders before LLM judges** (HarmBench 2402.04249 and garak 2406.11036 both stress reproducible scoring): canary strings, tool watchlists, SQL AST checks, cost caps decide first; the judge only handles fuzzy rubrics.
- **Replay K times** because single-shot results on stochastic agents are noise (AgentDojo and HarmBench report variance across runs): a fix counts only when it passes K/K.
- **Hold-out against overfitting** (the risk the adaptive-attack paper and Mend's own README both flag): regression tests are the original seeds, and the after-pass reruns the whole catalog, so a fix that only special-cases one seed shows up as other seeds still failing.
- **Attack the deployed system, not a benchmark copy**: live target, real Crustdata data through a proxy, real code fixes, which is where the benchmark-critique papers (AgentDyn, firewalls paper) say the field needs to go.

## 6. Next additions ranked by value

1. TAP/PAIR-style adaptive attacker loop using the judge as scorer (2310.08419, 2312.02119).
2. Crescendo multi-turn escalation seeds for C6 and G4 (2404.01833).
3. ChatInject-style template-token payload variant for D1 (2509.22830).
4. Memory/long-horizon seeds (session leak F4, stale-context) per the trustworthy-agents survey (2503.09648).
5. A pre-built "firewall at the tool boundary" fix pattern offered to fixers (2510.05244).
