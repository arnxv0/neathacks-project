"""Opt-in fixing for sandbox targets (`--allow-fix`). Off by default: sandbox targets are find-only.

Fixers run the repository's test command and a shell on the HOST, so this is only allowed for a target its owner
marked `trusted`. Fixes stay on local branches of the clone (the push URL was disabled at clone time) and are exported
as a patch file next to the registry entry. Nothing is ever pushed."""
from __future__ import annotations
import pathlib
from . import contract, registry
from .clone import safe_git
from .registry import Entry, RegistryError

IDENT = ["-c", "user.name=Preflight", "-c", "user.email=preflight@localhost", "-c", "commit.gpgsign=false"]

def require_allowed(entry: Entry) -> None:
    if not entry.trusted:
        raise RegistryError(f"{entry.slug}: fixing runs the repository's tests on this machine, so it is only available for a target "
                            "you marked as trusted (your own code). Run find-only, or trust the target first.", "fix_requires_trust")

def prepare(slug: str) -> Entry:
    """Give the fixers what they expect: a local `main` branch that contains the approved onboarding files."""
    entry = registry.get(slug)
    require_allowed(entry)
    clone = registry.clone_dir(slug)
    if entry.status != "ready" or entry.approved_fingerprint != contract.fingerprint(clone):
        raise RegistryError(f"{slug} is not approved in its current state", "not_approved")
    if entry.fix_base_sha:
        return entry
    safe_git(["checkout", "-q", "-B", "main"], clone)
    if safe_git(["status", "--porcelain"], clone).stdout.strip():
        safe_git(["add", "-A"], clone)
        r = safe_git([*IDENT, "commit", "-q", "--no-verify", "-m", "preflight: approved onboarding files (local only, never pushed)"], clone)
        if r.returncode != 0:
            raise RegistryError(f"could not commit the onboarding files locally: {r.stderr[-300:]}", "invalid_state")
    base = safe_git(["rev-parse", "HEAD"], clone).stdout.strip()
    # the same reviewed content is now a commit, so the approval is re-bound to it
    return registry.update(slug, fix_base_sha=base, approved_fingerprint=contract.fingerprint(clone))

def export_patch(slug: str) -> pathlib.Path | None:
    """Write every approved, merged fix since `prepare()` as one patch file and re-bind the approval to the new HEAD
    (the human approved that fix). Returns the patch path, or None when nothing was fixed."""
    entry = registry.get(slug)
    if not entry.fix_base_sha:
        return None
    clone = registry.clone_dir(slug)
    diff = safe_git(["diff", "--no-ext-diff", "--no-textconv", f"{entry.fix_base_sha}..HEAD"], clone).stdout
    path = registry.meta_path(slug, ".fixes.patch")
    path.write_text(diff)
    registry.update(slug, approved_fingerprint=contract.fingerprint(clone))
    return path
