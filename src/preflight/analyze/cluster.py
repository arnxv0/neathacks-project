"""Group failed runs by signature."""
from __future__ import annotations
import collections
from ..ledger import Ledger
from ..models import AttackSpec, Cluster, RunRecord
from .signature import signature

def build(ledger: Ledger, runs: list[RunRecord], specs: dict[str, AttackSpec]) -> list[Cluster]:
    groups: dict[str, dict] = collections.OrderedDict()
    for r in runs:
        if not r.failed or r.error:
            continue
        fam = specs[r.attack_id].family if r.attack_id in specs else r.attack_id[0]
        steps = ledger.read_steps(r.run_id)
        key, short = signature(r, steps, fam)
        g = groups.setdefault(key, {"short": short, "family": fam, "attacks": [], "runs": [], "graders": set()})
        g["attacks"].append(r.attack_id); g["runs"].append(r.run_id)
        g["graders"] |= {gname for gname, v in r.verdicts.items() if not v.passed}
    clusters = []
    for key, g in groups.items():
        attack_ids = sorted(set(g["attacks"]))
        cid = f"{'-'.join(attack_ids)}-{'-'.join(sorted(g['graders']))}-{g['short']}".lower()
        c = Cluster(cluster_id=cid, signature=key, family=g["family"], attack_ids=attack_ids, run_ids=g["runs"],
                    failing_graders=sorted(g["graders"]))
        clusters.append(c)
    return clusters
