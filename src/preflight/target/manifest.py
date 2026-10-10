"""Discover tool schemas from each component and merge yaml annotations (ARCHITECTURE §3.3)."""
from __future__ import annotations
import httpx
from .loader import SystemSpec

def build(spec: SystemSpec) -> dict:
    out = {"system": spec.system, "components": {}}
    warnings: list[str] = []
    for name, comp in spec.components.items():
        tools: dict[str, dict] = {}
        discovered = []
        if comp.tools_endpoint:
            discovered = httpx.get(comp.tools_endpoint, timeout=10).json()
        for t in discovered:
            ann = comp.tools.get(t["name"])
            tools[t["name"]] = {"description": t.get("description"), "schema": t.get("schema"),
                                "annotated": ann is not None, **(ann.model_dump() if ann else {})}
            if ann is None:
                warnings.append(f"{name}.{t['name']}: discovered but not annotated (default risk)")
        for tname, ann in comp.tools.items():
            if tname not in tools:
                raise RuntimeError(f"{name}.{tname}: annotated in preflight.yaml but not discovered from {comp.tools_endpoint} (stale yaml)")
            if ann.source and comp.repo_path:
                path = ann.source.split(":")[0]
                if not (comp.repo_path / path).exists():
                    raise RuntimeError(f"{name}.{tname}: source path {path} does not exist in {comp.repo_path}")
        out["components"][name] = {"chat_endpoint": comp.chat_endpoint, "repo": str(comp.repo_path), "editable_paths": comp.editable_paths,
                                   "test_command": comp.test_command, "tools": tools, "calls": comp.calls}
    out["warnings"] = warnings
    return out
