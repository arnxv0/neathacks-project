"""Checks on a sandbox target's `preflight.yaml` (third-party or machine-written, so never trusted) and the review
patch a human approves. Uses the real loader; adds the rules that keep a manifest from reaching outside its container."""
from __future__ import annotations
import hashlib, pathlib, re
from urllib.parse import urlparse
import yaml
from ..target import loader
from ..target.loader import SystemSpec
from .clone import safe_git

ALLOWED_PLACEHOLDERS = {"PORT", "PREFLIGHT_OWNERSHIP_TOKEN"}
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
TOKEN_PLACEHOLDER = "${PREFLIGHT_OWNERSHIP_TOKEN}"
RESERVED_ENV = re.compile(r"^(PATH|HOME|HOST|PORT|USER|SHELL|PWD|LD_.*|DYLD_.*|PYTHON.*|NODE_.*|PREFLIGHT_.*|LITELLM_.*|TARGET_MODEL|DOCKER_.*)$")
ENV_NAME = re.compile(r"[A-Z][A-Z0-9_]{1,63}")
MAX_UNTRACKED_BYTES = 200_000
_PROBE_ENV = {"PORT": "18999", "PREFLIGHT_OWNERSHIP_TOKEN": "probe-token"}

def _rel_inside(clone: pathlib.Path, rel: str) -> bool:
    p = (clone / rel).resolve()
    return not pathlib.PurePosixPath(rel).is_absolute() and (p == clone or clone in p.parents)

def check(clone: pathlib.Path, env: dict[str, str] | None = None) -> tuple[SystemSpec | None, list[str]]:
    """(spec, problems). `spec` is loaded with `env` (PORT + ownership token) and nothing from the host environment."""
    clone = pathlib.Path(clone).resolve()
    env = env or _PROBE_ENV
    path = clone / "preflight.yaml"
    if path.is_symlink() or not path.is_file():
        return None, ["preflight.yaml is missing at the repository root (or is a symlink)"]
    text = path.read_text(errors="replace")
    if len(text) > 200_000:
        return None, ["preflight.yaml is implausibly large"]
    problems: list[str] = []
    extra = set(re.findall(r"\$\{(\w+)\}", text)) - ALLOWED_PLACEHOLDERS
    if extra:
        problems.append(f"placeholders other than ${{PORT}} and ${{PREFLIGHT_OWNERSHIP_TOKEN}} are not allowed: {sorted(extra)}")
    try:
        raw = yaml.safe_load(text) or {}
        if str(raw.get("ownership_token", "")).strip() != TOKEN_PLACEHOLDER:
            problems.append(f"ownership_token must be exactly {TOKEN_PLACEHOLDER}")
        spec = loader.load(clone, env=env, env_only=True)
    except Exception as e:
        return None, problems + [f"preflight.yaml does not load: {str(e)[:400]}"]
    if spec.entrypoint not in spec.components:
        return None, problems + [f"entrypoint {spec.entrypoint!r} is not a component"]
    for name, comp in spec.components.items():
        if comp.repo_path != clone:
            problems.append(f"{name}: repo must be `.` (a sandbox target is one repository)")
        if not (comp.start or "").strip():
            problems.append(f"{name}: start command is missing")
        for field in ("healthcheck", "chat_endpoint", "tools_endpoint", "state_endpoint", "runs_endpoint"):
            url = getattr(comp, field)
            if url is None and field in ("tools_endpoint", "state_endpoint"):
                continue
            u = urlparse(url or "")
            try:
                port = u.port
            except ValueError:
                port = None
            if u.scheme != "http" or u.hostname not in ALLOWED_HOSTS or str(port) != env["PORT"]:
                problems.append(f"{name}.{field} must be http://localhost:${{PORT}}/... (got {url!r})")
        for rel in [*comp.editable_paths, *([comp.canaries_file] if comp.canaries_file else [])]:
            if not _rel_inside(clone, rel):
                problems.append(f"{name}: path {rel!r} leaves the repository")
        for tname, ann in comp.tools.items():
            if ann.source:
                src = ann.source.split(":")[0]
                if not _rel_inside(clone, src) or not (clone / src).exists():
                    problems.append(f"{name}.tools.{tname}: source {src!r} does not exist in the repository")
            if ann.upstream_env and (not ENV_NAME.fullmatch(ann.upstream_env) or RESERVED_ENV.match(ann.upstream_env)):
                problems.append(f"{name}.tools.{tname}: upstream_env {ann.upstream_env!r} is not an allowed variable name")
    return spec, problems

def review_patch(clone: pathlib.Path, list_ignored: bool = True) -> str:
    """Everything that differs from the cloned commit: `git diff` for tracked files plus the full text of untracked files,
    rendered as new-file diffs. This is what the human reads before approving."""
    clone = pathlib.Path(clone)
    out = [safe_git(["diff", "--no-ext-diff", "--no-textconv", "HEAD"], clone).stdout]
    status = safe_git(["status", "--porcelain", "--untracked-files=all", "--ignored"], clone).stdout
    ignored = []
    for line in status.splitlines():
        code, rel = line[:2], line[3:].strip().strip('"')
        p = clone / rel
        if code == "!!":
            ignored.append(rel)
        elif code == "??":
            if p.is_symlink() or not p.is_file():
                out.append(f"diff --git a/{rel} b/{rel}\nnew file (not a regular file: symlink or special, content not shown)\n")
                continue
            data = p.read_bytes()[:MAX_UNTRACKED_BYTES + 1]
            body = data[:MAX_UNTRACKED_BYTES].decode("utf-8", errors="replace")
            lines = body.splitlines()
            out.append(f"diff --git a/{rel} b/{rel}\nnew file mode 100644\n--- /dev/null\n+++ b/{rel}\n@@ -0,0 +1,{len(lines)} @@\n" +
                       "".join(f"+{l}\n" for l in lines) + ("+[... truncated by Preflight ...]\n" if len(data) > MAX_UNTRACKED_BYTES else ""))
    if ignored and list_ignored:
        out.append("# git-ignored files present in the clone (not shown): " + ", ".join(sorted(ignored)[:40]) + "\n")
    return "".join(o for o in out if o)

def fingerprint(clone: pathlib.Path) -> str:
    """Identity of what was reviewed: the checked-out commit plus the review patch. A target only starts while this
    still matches the value recorded at approval."""
    head = safe_git(["rev-parse", "HEAD"], pathlib.Path(clone)).stdout.strip()
    return hashlib.sha256((head + "\n" + review_patch(clone, list_ignored=False)).encode()).hexdigest()
