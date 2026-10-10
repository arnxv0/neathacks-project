# Preflight — rules for agents working in this repo

- Preflight is target-agnostic. Never import or hardcode target code. The target is described only by its `preflight.yaml`.
- **Never read `../acmesales-copilot/KNOWN_WEAKNESSES.md`.** It exists only so a human can check what Preflight found.
- Attack only allowlisted targets that pass `/preflight-verify`. Money and email tools in the target are mocks; keep it that way.
- Caps are enforced in code (`config.yaml`): per-run and per-assessment $ caps, RPS, wall clock, `STOP` file kill switch. Never raise them to make a demo work; scale seeds down instead and note it in `DECISIONS.md`.
- LLM steps get pointers into the ledger, never pasted traces.
- Deterministic graders decide first; the LLM judge only handles fuzzy rubrics.
- Python 3.12 via uv (`uv run ...`). Frontend in `apps/web` is Next.js; add components only via `npx shadcn@latest add`, never hand-write registry components.
- Fixers (Claude Code) may edit only the target's `editable_paths`, must keep `test_command` green, must not weaken tests or hardcode around seeds.
- Log every budget/scope deviation in `DECISIONS.md` with a date.
