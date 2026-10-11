"""Parse preflight.yaml into a SystemSpec."""
from __future__ import annotations
import os, pathlib, re, yaml
from pydantic import BaseModel, Field

class ToolAnnotation(BaseModel):
    source: str | None = None
    upstream_env: str | None = None
    kind: str | None = None
    high_impact: bool = False
    confirm_required_above: float | None = None

class ComponentSpec(BaseModel):
    name: str = ""
    repo: str = "."
    repo_path: pathlib.Path | None = None
    start: str | None = None
    healthcheck: str
    chat_endpoint: str
    tools_endpoint: str | None = None
    state_endpoint: str | None = None
    runs_endpoint: str | None = None
    test_command: str = "make test"
    editable_paths: list[str] = Field(default_factory=list)
    canaries_file: str | None = None
    calls: list[str] = Field(default_factory=list)
    tools: dict[str, ToolAnnotation] = Field(default_factory=dict)

class SystemSpec(BaseModel):
    system: str
    entrypoint: str
    ownership_token: str
    tenants: dict = Field(default_factory=dict)
    roles: dict = Field(default_factory=dict)
    budgets: dict = Field(default_factory=lambda: {"max_steps": 15, "max_tokens": 60000, "max_usd": 0.25})
    components: dict[str, ComponentSpec]
    root: pathlib.Path | None = None

    @property
    def entry(self) -> ComponentSpec:
        return self.components[self.entrypoint]

def _expand(v, env: dict[str, str] | None = None, env_only: bool = False):
    if isinstance(v, str):
        look = (lambda k: (env or {}).get(k, "")) if env_only else (lambda k: (env or {}).get(k) or os.getenv(k, ""))
        return re.sub(r"\$\{(\w+)\}", lambda m: look(m.group(1)), v)
    if isinstance(v, dict):
        return {k: _expand(x, env, env_only) for k, x in v.items()}
    if isinstance(v, list):
        return [_expand(x, env, env_only) for x in v]
    return v

def load(target_dir: pathlib.Path, env: dict[str, str] | None = None, env_only: bool = False) -> SystemSpec:
    """`env` overlays the process environment for `${VAR}` placeholders. Sandbox targets pass their PORT and per-target
    ownership token here with `env_only=True`, so a third-party manifest can never pull host variables into a URL or command."""
    target_dir = pathlib.Path(target_dir).resolve()
    p = target_dir / "preflight.yaml"
    data = _expand(yaml.safe_load(p.read_text()), env, env_only)
    spec = SystemSpec.model_validate(data)
    spec.root = target_dir
    for name, comp in spec.components.items():
        comp.name = name
        comp.repo_path = (target_dir / comp.repo).resolve()
    return spec

def canaries(spec: SystemSpec) -> dict[str, str]:
    import json
    out: dict[str, str] = {}
    for comp in spec.components.values():
        if comp.canaries_file and comp.repo_path:
            p = comp.repo_path / comp.canaries_file
            if p.exists():
                out.update(json.loads(p.read_text()))
    return out
