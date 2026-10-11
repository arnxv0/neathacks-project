"""Static inspection of a cloned repo. Reads files only: nothing is imported, installed or executed, symlinks are not followed."""
from __future__ import annotations
import json, os, pathlib, re, tomllib

SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".tox", "site-packages", "vendor", "target"}
MAX_FILES = 5000
MAX_READ = 256 * 1024
ENV_FILES = (".env.example", ".env.sample", ".env.template", "example.env", ".env.dist")

# dependency name (normalised: lower case, `_` -> `-`) -> framework label
LLM_FRAMEWORKS = {
    "openai": "openai", "anthropic": "anthropic", "@anthropic-ai/sdk": "anthropic", "litellm": "litellm",
    "langchain": "langchain", "langchain-core": "langchain", "langchain-openai": "langchain", "langchain-anthropic": "langchain",
    "langchain-community": "langchain", "@langchain/core": "langchain", "@langchain/openai": "langchain", "@langchain/anthropic": "langchain",
    "langgraph": "langgraph", "@langchain/langgraph": "langgraph",
    "llama-index": "llama-index", "llama-index-core": "llama-index", "llamaindex": "llama-index",
    "crewai": "crewai", "autogen": "autogen", "pyautogen": "autogen", "autogen-agentchat": "autogen", "ag2": "autogen",
    "pydantic-ai": "pydantic-ai", "pydantic-ai-slim": "pydantic-ai", "openai-agents": "openai", "@openai/agents": "openai",
    "ai": "vercel-ai", "google-generativeai": "google-genai", "google-genai": "google-genai",
}
SERVERS = {"fastapi": "fastapi", "flask": "flask", "express": "express", "starlette": "starlette", "django": "django", "aiohttp": "aiohttp"}
# import root -> framework label, for repos that do not declare their dependencies
PY_IMPORTS = {"openai": "openai", "anthropic": "anthropic", "litellm": "litellm", "langchain": "langchain", "langchain_core": "langchain",
              "langchain_openai": "langchain", "langchain_anthropic": "langchain", "langgraph": "langgraph", "llama_index": "llama-index",
              "crewai": "crewai", "autogen": "autogen", "pydantic_ai": "pydantic-ai", "agents": "openai"}
_IMPORT = re.compile(r"^\s*(?:from|import)\s+([A-Za-z_][A-Za-z0-9_]*)", re.M)
_REQ = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")
_ENV = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]{1,80})\s*=", re.M)
_PY_APP = re.compile(r"\b(FastAPI|Flask|Starlette)\s*\(")
_PY_MAIN = re.compile(r"""if\s+__name__\s*==\s*['"]__main__['"]|^def\s+main\s*\(""", re.M)
_RAW_LLM = re.compile(r"/chat/completions|/v1/messages|/v1/responses")
_JS_APP = re.compile(r"\bexpress\s*\(\s*\)|createServer\s*\(|new\s+Hono\s*\(|fastify\s*\(")

def _norm(name: str) -> str:
    return name.strip().lower().replace("_", "-")

def _read(p: pathlib.Path) -> str:
    try:
        if p.is_symlink() or not p.is_file():
            return ""
        with p.open("rb") as f:
            return f.read(MAX_READ).decode("utf-8", errors="replace")
    except OSError:
        return ""

def _files(root: pathlib.Path) -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not os.path.islink(os.path.join(base, d)))
        for name in sorted(files):
            out.append(pathlib.Path(base) / name)
            if len(out) >= MAX_FILES:
                return out
    return out

def _req_names(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith(("-", "git+", "http://", "https://")):
            continue
        m = _REQ.match(line)
        if m:
            out.append(_norm(m.group(1)))
    return out

def _pyproject_deps(text: str) -> tuple[list[str], str | None]:
    try:
        data = tomllib.loads(text)
    except Exception:
        return [], None
    specs: list[str] = list((data.get("project") or {}).get("dependencies") or [])
    for group in ((data.get("project") or {}).get("optional-dependencies") or {}).values():
        specs += list(group or [])
    for group in (data.get("dependency-groups") or {}).values():
        specs += [s for s in group or [] if isinstance(s, str)]
    poetry = ((data.get("tool") or {}).get("poetry") or {})
    names = [_norm(k) for k in (poetry.get("dependencies") or {}) if k.lower() != "python"]
    names += [n for s in specs for n in _req_names(str(s))]
    return names, ("poetry" if poetry else None)

def inspect(root: pathlib.Path) -> dict:
    """JSON-able summary for the UI and the onboarder brief."""
    root = pathlib.Path(root)
    files = _files(root)
    rel = {p: p.relative_to(root).as_posix() for p in files}
    top = {r for r in rel.values() if "/" not in r}
    deps: set[str] = set()
    languages: list[str] = []
    package_manager = None

    if "pyproject.toml" in top:
        names, pm = _pyproject_deps(_read(root / "pyproject.toml"))
        deps |= set(names); package_manager = pm
    for r in sorted(top):
        if re.fullmatch(r"requirements[\w.-]*\.txt", r):
            deps |= set(_req_names(_read(root / r)))
    py_files = [p for p in files if p.suffix == ".py"]
    if py_files or {"pyproject.toml", "requirements.txt", "setup.py"} & top:
        languages.append("python")
        package_manager = package_manager or ("uv" if "uv.lock" in top else "poetry" if "poetry.lock" in top else
                                              "pip" if {"requirements.txt", "pyproject.toml", "setup.py"} & top else None)
    pkg: dict = {}
    if "package.json" in top:
        try:
            pkg = json.loads(_read(root / "package.json")) or {}
        except Exception:
            pkg = {}
        languages.append("typescript" if "tsconfig.json" in top else "javascript")
        for key in ("dependencies", "devDependencies"):
            deps |= {str(k).lower() for k in (pkg.get(key) or {})}
        if "python" not in languages:
            package_manager = "pnpm" if "pnpm-lock.yaml" in top else "yarn" if "yarn.lock" in top else "npm"

    frameworks = {LLM_FRAMEWORKS[d] for d in deps if d in LLM_FRAMEWORKS}
    servers = {SERVERS[d] for d in deps if d in SERVERS}
    entry_points: list[dict] = []
    for p in py_files[:800]:
        text = _read(p)
        if not text:
            continue
        for mod in set(_IMPORT.findall(text)):
            if mod in PY_IMPORTS and (mod != "agents" or "openai" in text):
                frameworks.add(PY_IMPORTS[mod])
            if mod in SERVERS:
                servers.add(SERVERS[mod])
        if _RAW_LLM.search(text):
            frameworks.add("llm-http")      # talks to a chat-completions style endpoint without an SDK
        m = _PY_APP.search(text)
        if m:
            entry_points.append({"path": rel[p], "kind": "http_app", "detail": m.group(1)})
        elif _PY_MAIN.search(text) and "test" not in rel[p].lower():
            entry_points.append({"path": rel[p], "kind": "main"})
    for p in [f for f in files if f.suffix in (".js", ".mjs", ".cjs", ".ts")][:800]:
        if _JS_APP.search(_read(p)):
            entry_points.append({"path": rel[p], "kind": "http_app", "detail": "node"})
    if pkg.get("main"):
        entry_points.append({"path": str(pkg["main"]), "kind": "main", "detail": "package.json main"})
    if (pkg.get("scripts") or {}).get("start"):
        entry_points.append({"path": "package.json", "kind": "script", "detail": f"npm start: {str(pkg['scripts']['start'])[:120]}"})

    env_vars: list[str] = []
    for name in ENV_FILES:
        if name in top:
            env_vars += [v for v in _ENV.findall(_read(root / name)) if v not in env_vars]
    dockerfile = next((r for r in ("Dockerfile", "dockerfile", "Containerfile") if r in top), None)
    notes = []
    if len(files) >= MAX_FILES:
        notes.append(f"only the first {MAX_FILES} files were inspected")
    if any(r in top for r in (".mcp.json",)) or any(r.startswith(".claude/") for r in rel.values()):
        notes.append("repo ships Claude Code configuration (.claude/ or .mcp.json); the onboarder ignores it")
    return {
        "languages": languages, "package_manager": package_manager, "dependency_count": len(deps),
        "frameworks": sorted(frameworks), "servers": sorted(servers),
        "entry_points": sorted(entry_points, key=lambda e: (e["kind"] != "http_app", e["path"].count("/"), e["path"]))[:25],
        "contract_native": "preflight.yaml" in top, "has_adapter": "preflight_adapter.py" in top,
        "dockerfile": dockerfile, "env_vars": env_vars[:60], "has_tests": any(r.startswith(("tests/", "test/")) or "/tests/" in r for r in rel.values()),
        "file_count": len(files), "is_agent_candidate": bool(frameworks), "notes": notes,
    }
