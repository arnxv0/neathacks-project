"""Run ledger: everything on disk (ARCHITECTURE §5)."""
from __future__ import annotations
import datetime as dt, json, pathlib, uuid
from typing import Any
from . import config, db
from .events import EventBus
from .models import Cluster, FixAttempt, RunRecord, Step

def new_assessment_id() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:4]

class Ledger:
    def __init__(self, assessment_id: str, base: pathlib.Path | None = None):
        self.assessment_id = assessment_id
        self.root = (base or config.LEDGER_DIR) / assessment_id
        for d in ("runs", "clusters", "fixes", "report"):
            (self.root / d).mkdir(parents=True, exist_ok=True)
        self.events = EventBus(self.root / "events.jsonl", on_emit=lambda ev: db.insert_event(assessment_id, ev))

    # ---- manifest ----
    def write_manifest(self, data: dict) -> None:
        self._write_json(self.root / "manifest.json", data)
        db.upsert_assessment(self.assessment_id, data)

    def manifest(self) -> dict:
        p = self.root / "manifest.json"
        return json.loads(p.read_text()) if p.exists() else {}

    def update_manifest(self, **kv: Any) -> None:
        m = self.manifest(); m.update(kv); self.write_manifest(m)

    # ---- runs ----
    def run_dir(self, run_id: str) -> pathlib.Path:
        d = self.root / "runs" / run_id; d.mkdir(parents=True, exist_ok=True); return d

    def write_run(self, run: RunRecord, steps: list[Step] | None = None, transcript: str | None = None, trace: dict | None = None) -> None:
        d = self.run_dir(run.run_id)
        self._write_json(d / "run.json", run.model_dump())
        if steps is not None:
            (d / "steps.jsonl").write_text("".join(json.dumps(s.model_dump(), default=str) + "\n" for s in steps))
        if transcript is not None:
            (d / "transcript.md").write_text(transcript)
        if trace is not None:
            self._write_json(d / "trace.json", trace)
        if run.verdicts:
            self._write_json(d / "verdicts.json", {k: v.model_dump() for k, v in run.verdicts.items()})
        db.upsert_run(run, steps)

    def read_run(self, run_id: str) -> RunRecord:
        return RunRecord.model_validate_json((self.root / "runs" / run_id / "run.json").read_text())

    def read_steps(self, run_id: str) -> list[Step]:
        p = self.root / "runs" / run_id / "steps.jsonl"
        if not p.exists():
            return []
        return [Step.model_validate_json(l) for l in p.read_text().splitlines() if l.strip()]

    def runs(self, kind: str | None = None) -> list[RunRecord]:
        out = []
        for p in sorted((self.root / "runs").glob("*/run.json")):
            r = RunRecord.model_validate_json(p.read_text())
            if kind is None or r.kind == kind:
                out.append(r)
        return out

    # ---- clusters ----
    def write_cluster(self, c: Cluster, divergence_md: str | None = None) -> None:
        d = self.root / "clusters" / c.cluster_id; d.mkdir(parents=True, exist_ok=True)
        self._write_json(d / "cluster.json", c.model_dump())
        db.upsert_cluster(self.assessment_id, c)
        if divergence_md is not None:
            (d / "divergence.md").write_text(divergence_md)

    def clusters(self) -> list[Cluster]:
        return [Cluster.model_validate_json(p.read_text()) for p in sorted((self.root / "clusters").glob("*/cluster.json"))]

    def read_cluster(self, cluster_id: str) -> Cluster:
        return Cluster.model_validate_json((self.root / "clusters" / cluster_id / "cluster.json").read_text())

    # ---- fixes ----
    def fix_dir(self, cluster_id: str, n: int | None = None) -> pathlib.Path:
        d = self.root / "fixes" / cluster_id
        if n is not None:
            d = d / f"attempt-{n}"
        d.mkdir(parents=True, exist_ok=True); return d

    def write_attempt(self, a: FixAttempt) -> None:
        self._write_json(self.fix_dir(a.cluster_id, a.n) / "attempt.json", a.model_dump())
        db.upsert_attempt(self.assessment_id, a)

    def attempts(self, cluster_id: str) -> list[FixAttempt]:
        d = self.root / "fixes" / cluster_id
        if not d.exists():
            return []
        return [FixAttempt.model_validate_json(p.read_text()) for p in sorted(d.glob("attempt-*/attempt.json"))]

    # ---- misc ----
    def _write_json(self, path: pathlib.Path, data: Any) -> None:
        path.write_text(json.dumps(data, indent=2, default=str))

    def write_readme(self, text: str) -> None:
        (self.root / "README.md").write_text(text)

def list_assessments(base: pathlib.Path | None = None) -> list[str]:
    base = base or config.LEDGER_DIR
    if not base.exists():
        return []
    return sorted([p.name for p in base.iterdir() if p.is_dir() and (p / "manifest.json").exists()], reverse=True)
