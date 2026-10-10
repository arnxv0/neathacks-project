"""Load attacks/*.yaml into AttackSpecs."""
from __future__ import annotations
import pathlib, yaml
from .. import config
from ..models import AttackSpec, Seed

def load_all(attacks_dir: pathlib.Path | None = None) -> list[AttackSpec]:
    d = attacks_dir or config.ATTACKS_DIR
    specs: list[AttackSpec] = []
    for p in sorted(d.glob("*.yaml")):
        if p.name.startswith("_"):
            continue
        data = yaml.safe_load(p.read_text()) or {}
        for raw in data.get("attacks", []):
            raw.setdefault("family", p.stem)
            raw["seeds"] = [Seed.model_validate(s) for s in raw.get("seeds", [])]
            specs.append(AttackSpec.model_validate(raw))
    return specs

def select(specs: list[AttackSpec], selector: str) -> list[AttackSpec]:
    """selector: 'P0' | 'P0,P1' | 'D1,E1' | 'all'."""
    if selector == "all":
        return specs
    wanted = {s.strip() for s in selector.split(",") if s.strip()}
    tiers = {w for w in wanted if w in ("P0", "P1", "P2")}
    ids = wanted - tiers
    return [s for s in specs if s.tier in tiers or s.id in ids]

def watchlist(attacks_dir: pathlib.Path | None = None) -> dict:
    p = (attacks_dir or config.ATTACKS_DIR) / "_watchlist.yaml"
    return yaml.safe_load(p.read_text()) if p.exists() else {}
