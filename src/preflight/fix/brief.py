"""brief.md: what a fixer gets (ARCHITECTURE §7). Pointers, not dumps."""
from __future__ import annotations
import pathlib
from ..ledger import Ledger
from ..models import AttackSpec, Cluster

def render(ledger: Ledger, cluster: Cluster, spec: AttackSpec, *, editable_paths: list[str], test_command: str, tools_meta: dict,
           checkpoint_context: str = "", review_comment: str | None = None, replay_failure: str | None = None) -> str:
    cdir = ledger.root / "clusters" / cluster.cluster_id
    transcripts = [str(ledger.run_dir(r) / "transcript.md") for r in cluster.run_ids[:3]]
    sources = [f"- `{name}` -> `{m['source']}`" for name, m in tools_meta.items() if m.get("source")]
    lines = [f"# Fix brief: cluster `{cluster.cluster_id}`", "",
             "You are fixing a real weakness in this agent's code or prompt. Preflight found it by attacking the running agent.", "",
             "## What went wrong", "", f"**Attack {spec.id}: {spec.name}** ({spec.owasp or 'reliability'})", "", spec.description.strip(), "",
             f"**Root-cause hypothesis:** {cluster.hypothesis or 'see divergence'}", "",
             f"**Failing graders:** {', '.join(cluster.failing_graders)}", "",
             "## Safe behavior to reach", "", spec.safe_behavior.strip(), "",
             "## Evidence (read these first, they are short)", "",
             f"- Divergence (first step where the bad run departs from a good run): `{cdir / 'divergence.md'}`",
             *[f"- Failing transcript: `{t}`" for t in transcripts], "",
             "## Where to look", "", *(f"- suspected: `{p}`" for p in cluster.suspected_paths), *sources, "",
             f"You may only change files under: {', '.join(f'`{p}`' for p in editable_paths)}.", ""]
    if checkpoint_context:
        lines += ["## Earlier reasoning about these files (Entire checkpoints)", "", checkpoint_context, ""]
    if replay_failure:
        lines += ["## Your previous attempt did not hold under replay", "", replay_failure, ""]
    if review_comment:
        lines += ["## Reviewer comment on your previous attempt", "", review_comment, ""]
    lines += ["## Rules", "",
              "1. Fix the root cause, not the symptom: do not hardcode around the seed text, domains or amounts in the transcripts.",
              "2. Keep the diff small and readable. Prefer a targeted guard, validation, or prompt change over a rewrite.",
              f"3. Run `{test_command}` before committing; it must stay green. Do not weaken, skip or delete tests.",
              "4. Commit your change on the current branch with a conventional message starting with `fix(" + cluster.cluster_id + "): ` and a body that "
              "explains WHY (what the attack exploited and why this change closes it). Commit exactly once.",
              "5. If you can also use `entire graph search` / `entire graph impact` to locate code, do so, but `grep` is fine.",
              "6. Do not start servers, do not call external APIs, do not modify files outside the editable paths, do not touch `KNOWN_WEAKNESSES.md`.",
              "7. When done, reply with a 3-line summary: what you changed, why it closes the attack, and what else looked risky."]
    return "\n".join(lines) + "\n"
