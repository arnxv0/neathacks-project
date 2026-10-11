"""Registry of sandbox targets: one JSON entry per target, kept OUTSIDE the clone so the cloned repo cannot forge it.

Layout under the sandbox root (`$PREFLIGHT_SANDBOX_DIR`, default `<repo>/sandbox`):
  targets/<slug>/           the clone (third-party code; never executed on the host)
  registry/<slug>.json      this entry; <slug>.brief.md / .onboard.patch / .onboard.log / .runtime.json / .Dockerfile next to it
"""
from __future__ import annotations
import datetime as dt, json, os, pathlib, re, shutil, threading
from typing import Any
from pydantic import BaseModel, Field
from .. import config

class RegistryError(RuntimeError):
    """`code` is a stable machine-readable reason; the API maps it to an HTTP status."""
    def __init__(self, message: str, code: str = "invalid_state"):
        super().__init__(message)
        self.code = code

# cloning -> cloned -> onboarding -> needs_review -> ready | unsupported | error
TRANSITIONS: dict[str, set[str]] = {
    "cloning": {"cloned", "error"},
    "cloned": {"onboarding", "needs_review", "error"},          # needs_review directly when the repo ships its own preflight.yaml
    "onboarding": {"needs_review", "unsupported", "error"},
    "needs_review": {"ready", "onboarding", "error"},           # ready ONLY through onboard.approve()
    "ready": {"needs_review", "onboarding", "error"},           # reviewed files changed -> back to review
    "unsupported": {"onboarding"},
    "error": {"onboarding", "needs_review"},
}
META_SUFFIXES = (".json", ".json.tmp", ".brief.md", ".onboard.patch", ".onboard.log", ".runtime.json", ".Dockerfile",
                 ".Dockerfile.dockerignore", ".fixes.patch", ".target.log")

_URL = re.compile(r"https://github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)/([A-Za-z0-9._-]{1,100})")
_SLUG = re.compile(r"[a-z0-9][a-z0-9._-]{0,150}")
_lock = threading.RLock()

class Entry(BaseModel):
    slug: str
    url: str
    owner: str
    repo: str
    status: str = "cloning"
    cloned_at: str | None = None
    head_sha: str | None = None
    contract_native: bool = False          # the repo ships its own preflight.yaml
    stack: dict[str, Any] = Field(default_factory=dict)   # inspect summary
    manifest_path: str | None = None
    trusted: bool = False                  # owner says "this is my code": enables --allow-fix and the no-Docker fallback
    approved_fingerprint: str | None = None
    approved_at: str | None = None
    fix_base_sha: str | None = None
    notes: list[str] = Field(default_factory=list)
    last_error: str | None = None
    error_code: str | None = None
    updated_at: str | None = None

def parse_url(url: str) -> tuple[str, str]:
    """(owner, repo) for exactly `https://github.com/<owner>/<repo>[.git]`; anything else raises."""
    m = _URL.fullmatch(url) if isinstance(url, str) else None
    if not m:
        raise RegistryError("only public repositories given as https://github.com/<owner>/<repo> are accepted", "invalid_url")
    owner, repo = m.group(1), m.group(2)
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not repo or ".." in repo or repo == "." or repo.startswith(("-", ".")) or "--" in owner:
        raise RegistryError("invalid owner or repository name", "invalid_url")
    return owner, repo

def slug_for(url: str) -> str:
    owner, repo = parse_url(url)
    return f"{owner}--{repo}".lower()

def canonical_url(url: str) -> str:
    owner, repo = parse_url(url)
    return f"https://github.com/{owner}/{repo}"

def check_slug(slug: str) -> str:
    if not isinstance(slug, str) or not _SLUG.fullmatch(slug) or ".." in slug:
        raise RegistryError(f"unknown target {slug!r}", "not_found")
    return slug

# ---- paths ----
def root() -> pathlib.Path:
    return pathlib.Path(os.getenv("PREFLIGHT_SANDBOX_DIR") or config.ROOT / "sandbox").resolve()

def targets_dir() -> pathlib.Path:
    return root() / "targets"

def registry_dir() -> pathlib.Path:
    return root() / "registry"

def _inside(path: pathlib.Path, parent: pathlib.Path) -> pathlib.Path:
    p, base = path.resolve(), parent.resolve()
    if p == base or base not in p.parents:
        raise RegistryError(f"{path} is outside the sandbox", "path_escape")
    return p

def clone_dir(slug: str) -> pathlib.Path:
    return _inside(targets_dir() / check_slug(slug), targets_dir())

def meta_path(slug: str, suffix: str) -> pathlib.Path:
    """registry/<slug><suffix>, e.g. `.json`, `.brief.md`, `.onboard.patch`."""
    if suffix not in META_SUFFIXES:
        raise RegistryError(f"unknown registry file suffix {suffix!r}", "path_escape")
    return _inside(registry_dir() / f"{check_slug(slug)}{suffix}", registry_dir())

def read_meta(slug: str, suffix: str, limit: int = 400_000) -> str | None:
    p = meta_path(slug, suffix)
    return p.read_text(errors="replace")[:limit] if p.is_file() else None

# ---- entries ----
def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def save(entry: Entry) -> Entry:
    entry.updated_at = _now()
    p = meta_path(entry.slug, ".json")
    with _lock:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = meta_path(entry.slug, ".json.tmp")
        tmp.write_text(json.dumps(entry.model_dump(), indent=2, default=str))
        os.replace(tmp, p)
    return entry

def get(slug: str) -> Entry:
    p = meta_path(slug, ".json")
    if not p.is_file():
        raise RegistryError(f"unknown target {slug!r}", "not_found")
    return Entry.model_validate(json.loads(p.read_text()))

def list_entries() -> list[Entry]:
    d = registry_dir()
    out = []
    for p in sorted(d.glob("*.json")) if d.exists() else []:
        try:
            e = Entry.model_validate(json.loads(p.read_text()))
        except Exception:
            continue                      # <slug>.runtime.json and anything malformed
        if p.name == f"{e.slug}.json":
            out.append(e)
    return out

def create(url: str) -> Entry:
    owner, repo = parse_url(url)
    slug = slug_for(url)
    with _lock:
        if meta_path(slug, ".json").exists():
            raise RegistryError(f"{slug} is already registered", "already_exists")
        return save(Entry(slug=slug, url=canonical_url(url), owner=owner, repo=repo))

def update(slug: str, **fields: Any) -> Entry:
    """Set plain fields. `status` is rejected here on purpose: use set_status()."""
    if "status" in fields:
        raise RegistryError("status changes go through set_status()", "invalid_state")
    with _lock:
        e = get(slug)
        for k, v in fields.items():
            setattr(e, k, v)
        return save(e)

def set_status(slug: str, status: str, *, error: str | None = None, code: str | None = None, note: str | None = None, **fields: Any) -> Entry:
    with _lock:
        e = get(slug)
        if status != e.status and status not in TRANSITIONS.get(e.status, set()):
            raise RegistryError(f"{slug}: cannot go from {e.status} to {status}", "invalid_state")
        e.status = status
        e.last_error, e.error_code = (error, code) if status in ("error", "unsupported") else (None, None)
        if status != "ready":
            e.approved_fingerprint = e.approved_at = None
        if note:
            e.notes = (e.notes + [f"{_now()} {note}"])[-30:]
        for k, v in fields.items():
            setattr(e, k, v)
        return save(e)

def by_path(path: pathlib.Path | str | None) -> Entry | None:
    """The sandbox entry whose clone IS `path`; None for the built-in target and for anything else."""
    if path is None:
        return None
    p = pathlib.Path(path).resolve()
    if p.parent != targets_dir():
        return None
    try:
        return get(p.name)
    except RegistryError:
        return None

def remove(slug: str) -> None:
    """Delete the clone, its fixer worktrees and every registry file of this slug. Each path is re-resolved and must
    stay inside the sandbox; a symlink in place of the clone is unlinked, never followed."""
    check_slug(slug)
    with _lock:
        for d in (targets_dir() / slug, targets_dir() / f"{slug}-worktrees"):
            if d.is_symlink():
                d.unlink()
            elif d.exists():
                shutil.rmtree(_inside(d, targets_dir()))
        for suffix in META_SUFFIXES:
            p = registry_dir() / f"{slug}{suffix}"
            if p.is_symlink() or p.is_file():
                p.unlink()
