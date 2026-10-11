"""Targets API: the built-in target plus sandbox targets (public GitHub repos added by URL). See docs/SANDBOX_TARGETS.md.

Errors are `{"detail": {"code": <stable string>, "message": <plain words>}}` with the HTTP status from STATUS_OF."""
from __future__ import annotations
import pathlib, threading
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ... import config
from ...sandbox import clone as clonemod, fixing, onboard as onboardmod, registry, runtime
from ...sandbox.registry import Entry, RegistryError

router = APIRouter(prefix="/api/targets", tags=["targets"])
BUILTIN = "builtin"
STATUS_OF = {"invalid_url": 400, "not_found": 404, "path_escape": 404, "already_exists": 409, "invalid_state": 409, "not_approved": 409,
             "too_large": 413, "invalid_manifest": 422, "fix_requires_trust": 403, "docker_unavailable": 503, "clone_failed": 502,
             "onboarder_unavailable": 503}

def http_error(e: RegistryError) -> HTTPException:
    return HTTPException(STATUS_OF.get(e.code, 400), {"code": e.code, "message": str(e)})

def builtin_dir() -> pathlib.Path:
    return (config.ROOT / ".." / "acmesales-copilot").resolve()

def _builtin() -> dict:
    d = builtin_dir()
    return {"slug": BUILTIN, "kind": "builtin", "name": "acmesales-copilot", "url": None, "path": str(d), "status": "ready",
            "available": (d / "preflight.yaml").is_file(), "find_only": False, "trusted": True, "contract_native": True,
            "stack": {}, "notes": [], "last_error": None, "error_code": None}

def _view(e: Entry) -> dict:
    return {**e.model_dump(exclude={"approved_fingerprint"}), "kind": "sandbox", "name": f"{e.owner}/{e.repo}",
            "path": str(registry.targets_dir() / e.slug), "find_only": not e.trusted, "busy": _busy(e)}

def _busy(e: Entry) -> bool:
    """A background job is working on it. A job that has not touched the entry for 30 minutes is taken for dead
    (the API was restarted mid-clone or mid-onboarding), so the target can still be removed."""
    import datetime as dt
    if e.status not in ("cloning", "onboarding"):
        return False
    try:
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(e.updated_at)
    except (TypeError, ValueError):
        return False
    return age.total_seconds() < 1800

def _entry(slug: str) -> Entry:
    try:
        return registry.get(slug)
    except RegistryError as e:
        raise http_error(e)

def _background(fn, slug: str) -> None:
    threading.Thread(target=fn, args=(slug,), daemon=True, name=f"sandbox-{fn.__name__}-{slug}").start()

class AddIn(BaseModel):
    url: str

class TrustIn(BaseModel):
    trusted: bool

@router.get("")
def list_targets():
    return {"targets": [_builtin()] + [_view(e) for e in registry.list_entries()],
            "docker_available": runtime.docker_available(), "sandbox_root": str(registry.root())}

@router.post("", status_code=202)
def add_target(body: AddIn, wait: bool = False):
    """Register + clone + inspect. Returns at once with status `cloning` (poll GET /api/targets/{slug});
    `?wait=true` does the work inline and answers with the final entry or the 4xx that stopped it."""
    try:
        if wait:
            return _view(clonemod.add(body.url.strip()))
        entry = registry.create(body.url.strip())
    except RegistryError as e:
        raise http_error(e)
    _background(clonemod.fetch, entry.slug)
    return _view(entry)

@router.get("/{slug}")
def get_target(slug: str):
    if slug == BUILTIN:
        d = builtin_dir()
        m = d / "preflight.yaml"
        return {**_builtin(), "manifest": m.read_text() if m.is_file() else None, "onboard_patch": None, "brief": None, "runtime": None}
    e = _entry(slug)
    clone = registry.targets_dir() / e.slug
    m = clone / "preflight.yaml"
    manifest = m.read_text(errors="replace")[:200_000] if m.is_file() and not m.is_symlink() else None
    return {**_view(e), "manifest": manifest, "onboard_patch": registry.read_meta(slug, ".onboard.patch"),
            "brief": registry.read_meta(slug, ".brief.md"), "fixes_patch": registry.read_meta(slug, ".fixes.patch"),
            "onboard_log_tail": (registry.read_meta(slug, ".onboard.log") or "")[-4000:] or None, "runtime": runtime.status(slug)}

@router.post("/{slug}/onboard", status_code=202)
def onboard_target(slug: str):
    """Start the confined onboarder session (background). Poll GET /api/targets/{slug} until status leaves `onboarding`."""
    e = _entry(slug)
    if e.contract_native:
        raise HTTPException(409, {"code": "invalid_state", "message": "this repository ships its own preflight.yaml; review and approve it"})
    if "onboarding" not in registry.TRANSITIONS.get(e.status, set()):
        raise HTTPException(409, {"code": "invalid_state", "message": f"cannot onboard a target that is `{e.status}`"})
    try:
        e = registry.set_status(slug, "onboarding", note="onboarding requested")
    except RegistryError as ex:
        raise http_error(ex)
    _background(_onboard_job, slug)
    return _view(e)

def _onboard_job(slug: str) -> None:
    try:
        onboardmod.run(slug)
    except Exception as ex:   # never leave an entry stuck in `onboarding`
        try:
            registry.set_status(slug, "error", error=str(ex), code=getattr(ex, "code", "onboarder_failed"))
        except RegistryError:
            pass

@router.post("/{slug}/approve")
def approve_target(slug: str):
    _entry(slug)
    try:
        return _view(onboardmod.approve(slug))
    except RegistryError as e:
        raise http_error(e)

@router.post("/{slug}/trust")
def trust_target(slug: str, body: TrustIn):
    _entry(slug)
    return _view(registry.update(slug, trusted=body.trusted))

@router.delete("/{slug}")
def delete_target(slug: str):
    if slug == BUILTIN:
        raise HTTPException(400, {"code": "invalid_state", "message": "the built-in target cannot be removed"})
    e = _entry(slug)
    if _busy(e):
        raise HTTPException(409, {"code": "invalid_state", "message": f"target is busy ({e.status}); try again when it has finished"})
    runtime.purge(slug)
    registry.remove(slug)
    return {"ok": True, "slug": slug}

def resolve_for_run(target: str, allow_fix: bool) -> tuple[pathlib.Path, bool]:
    """(target_dir, sandbox?) for POST /api/assessments. Raises the 4xx that explains why a sandbox target cannot run."""
    if target == BUILTIN:
        return builtin_dir(), False
    e = _entry(target)
    try:
        runtime.require_ready(e)
        runtime.choose_mode(e)
        if allow_fix:
            fixing.require_allowed(e)
    except RegistryError as ex:
        raise http_error(ex)
    return registry.clone_dir(e.slug), True
