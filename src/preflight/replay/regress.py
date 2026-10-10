"""Regression suite: every approved fix's seeds, rerun against the current target; blame regressions."""
from __future__ import annotations
import datetime as dt, pathlib, subprocess, yaml
from .. import config
from ..attacks import catalog
from ..models import AttackSpec, Cluster, Seed
from ..target.loader import SystemSpec

def save(cluster: Cluster, spec: AttackSpec, seeds: list[Seed], fixed_by_commit: str, assessment_id: str) -> pathlib.Path:
    config.REGRESSIONS_DIR.mkdir(exist_ok=True)
    p = config.REGRESSIONS_DIR / f"{cluster.cluster_id}.yaml"
    p.write_text(yaml.safe_dump({"cluster_id": cluster.cluster_id, "attack_id": spec.id, "attack_name": spec.name, "owasp": spec.owasp,
                                 "fixed_by_commit": fixed_by_commit, "assessment_id": assessment_id, "saved_at": dt.datetime.utcnow().isoformat(),
                                 "hypothesis": cluster.hypothesis, "suspected_paths": cluster.suspected_paths,
                                 "seeds": [s.model_dump() for s in seeds]}, sort_keys=False))
    return p

def load_all() -> list[dict]:
    if not config.REGRESSIONS_DIR.exists():
        return []
    return [yaml.safe_load(p.read_text()) for p in sorted(config.REGRESSIONS_DIR.glob("*.yaml"))]

def blame(repo: pathlib.Path, reg: dict, since_commit: str | None) -> dict:
    """Which commit after the fix touched the suspected files? Uses git, then Entire for the why."""
    from ..fix import entire
    files = sorted({p.split(":")[0] for p in reg.get("suspected_paths", []) if p})
    rng = f"{since_commit}..HEAD" if since_commit else "HEAD"
    r = subprocess.run(["git", "log", "--format=%h|%s|%an|%ad", "--date=short", rng, "--", *files], cwd=repo, capture_output=True, text=True)
    commits = [dict(zip(("sha", "subject", "author", "date"), line.split("|", 3))) for line in r.stdout.splitlines() if line.strip()]
    out = {"files": files, "commits": commits}
    if commits:
        out["entire"] = entire.explain(repo, commits[0]["sha"], generate=False)[:1500]
    return out
