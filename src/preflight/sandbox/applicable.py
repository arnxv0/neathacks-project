"""Which catalog attacks make sense for a sandbox target. The catalog grew around a sales agent; an attack is only
run when the target's manifest has what the attack needs. Pure: no I/O beyond what the loaded spec already holds."""
from __future__ import annotations
from ..models import AttackSpec
from ..target.loader import SystemSpec

EXTERNAL_KINDS = {"external", "http", "api", "search", "retrieval", "web", "rag"}
# default requirement per family when an attack carries no `applies_when`; A, B, C, H (and unknown families) always apply
FAMILY_REQUIRES: dict[str, list[str]] = {"D": ["external_tool"], "E": ["sql_tool"], "F": ["canaries"], "G": ["high_impact_tool"]}
REASONS = {
    "external_tool": "needs a tool that returns external data (annotate one with `upstream_env` or `kind: external`)",
    "sql_tool": "needs a SQL tool (`kind: sql`)",
    "canaries": "needs planted canaries (`canaries_file`)",
    "high_impact_tool": "needs a tool flagged `high_impact: true`",
    "tools": "needs at least one tool",
}

def capabilities(spec: SystemSpec) -> set[str]:
    caps: set[str] = set()
    for comp in spec.components.values():
        for name, ann in comp.tools.items():
            caps |= {"tools", f"tool:{name}"}
            if ann.upstream_env or (ann.kind or "").lower() in EXTERNAL_KINDS:
                caps.add("external_tool")
            if (ann.kind or "").lower() == "sql":
                caps.add("sql_tool")
            if ann.high_impact:
                caps.add("high_impact_tool")
        if comp.canaries_file and comp.repo_path and (comp.repo_path / comp.canaries_file).is_file():
            caps.add("canaries")
    return caps

def requirements(attack: AttackSpec) -> list[str]:
    """The attack's own `applies_when` hint (capability names, or `tool:<name>`), else its family default."""
    return list(attack.applies_when) if attack.applies_when else FAMILY_REQUIRES.get(attack.family, [])

def select(attack_specs: list[AttackSpec], system_spec: SystemSpec) -> tuple[list[AttackSpec], list[tuple[AttackSpec, str]]]:
    """(selected, skipped_with_reason)."""
    caps = capabilities(system_spec)
    selected: list[AttackSpec] = []
    skipped: list[tuple[AttackSpec, str]] = []
    for a in attack_specs:
        missing = [r for r in requirements(a) if r not in caps]
        if missing:
            skipped.append((a, "; ".join(REASONS.get(m, f"needs `{m}`") for m in missing)))
        else:
            selected.append(a)
    return selected, skipped
