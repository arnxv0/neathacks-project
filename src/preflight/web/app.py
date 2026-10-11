"""Preflight web API: REST over the ledger + SSE event stream + review actions. The Next.js app talks to this."""
from __future__ import annotations
import asyncio, json, os, pathlib, subprocess, sys, threading
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from .. import config
from ..events import read_events
from ..ledger import Ledger, list_assessments
from . import index
from ..fix.backends.claude_code import clean_env

app = FastAPI(title="Preflight API", version="0.1.0")
# Same-origin behind Caddy in production: PREFLIGHT_CORS_ORIGINS=https://host (comma-separated); "*" for local dev.
CORS_ORIGINS = [o.strip() for o in os.getenv("PREFLIGHT_CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
JOBS: dict[str, subprocess.Popen] = {}

def _cli(*args: str, log: pathlib.Path | None = None) -> subprocess.Popen:
    env = clean_env()
    if log:
        pathlib.Path(log).parent.mkdir(parents=True, exist_ok=True)   # a fresh clone has no ledger/ yet
    out = open(log, "ab") if log else subprocess.DEVNULL
    return subprocess.Popen([sys.executable, "-m", "preflight.cli", *args], cwd=config.ROOT, env=env, stdout=out, stderr=subprocess.STDOUT)

@app.get("/api/health")
def health():
    return {"ok": True, "ledger": str(config.LEDGER_DIR)}

@app.get("/api/assessments")
def assessments():
    return index.assessments()

@app.get("/api/assessments/latest")
def latest():
    ids = [a for a in list_assessments() if not a.startswith("regress-")]
    if not ids:
        raise HTTPException(404, "no assessments yet")
    return index.summary(ids[0])

@app.get("/api/assessments/{aid}")
def assessment(aid: str):
    if aid == "latest":
        return latest()
    if not (config.LEDGER_DIR / aid / "manifest.json").exists():
        raise HTTPException(404, "unknown assessment")
    return index.summary(aid)

@app.get("/api/assessments/{aid}/runs/{run_id}")
def run(aid: str, run_id: str):
    return index.run_detail(aid, run_id)

@app.get("/api/assessments/{aid}/clusters/{cluster_id}")
def cluster(aid: str, cluster_id: str):
    return index.cluster_detail(aid, cluster_id)

@app.get("/api/assessments/{aid}/events/history")
def events_history(aid: str, since: int = 0, limit: int = 2000):
    """All events so far (the SSE stream only carries new ones)."""
    return read_events(config.LEDGER_DIR / aid / "events.jsonl", since)[-limit:]

@app.get("/api/assessments/{aid}/events")
async def events(aid: str, since: int = 0):
    path = config.LEDGER_DIR / aid / "events.jsonl"
    async def gen():
        seq = since
        yield "retry: 1000\n\n"
        while True:
            for ev in read_events(path, seq):
                seq = ev["seq"]
                yield f"id: {seq}\nevent: {ev['type']}\ndata: {json.dumps(ev, default=str)}\n\n"
            await asyncio.sleep(0.5)
            yield ": keepalive\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

class StartIn(BaseModel):
    target_dir: str = str((config.ROOT / ".." / "acmesales-copilot").resolve())
    mode: str = "dev"
    attacks: str | None = None
    seeds: int | None = None
    no_fix: bool = False

@app.post("/api/assessments")
def start(body: StartIn):
    args = ["run", body.target_dir, "--mode", body.mode]
    if body.attacks:
        args += ["--attacks", body.attacks]
    if body.seeds:
        args += ["--seeds", str(body.seeds)]
    if body.no_fix:
        args += ["--no-fix"]
    before = set(list_assessments())
    proc = _cli(*args, log=config.LEDGER_DIR / "api-jobs.log")
    import time
    for _ in range(40):
        new = set(list_assessments()) - before
        if new:
            aid = sorted(new)[-1]; JOBS[aid] = proc
            return {"assessment_id": aid, "pid": proc.pid}
        time.sleep(0.25)
    return {"assessment_id": None, "pid": proc.pid}

class ReviewIn(BaseModel):
    comment: str | None = None

@app.post("/api/assessments/{aid}/clusters/{cluster_id}/approve")
def approve(aid: str, cluster_id: str):
    led = Ledger(aid)
    led.events.emit("review.action", cluster_id=cluster_id, action="approve")
    _cli("approve", aid, cluster_id, log=led.root / "review.log")
    return {"ok": True}

@app.post("/api/assessments/{aid}/clusters/{cluster_id}/reject")
def reject(aid: str, cluster_id: str, body: ReviewIn):
    led = Ledger(aid)
    led.events.emit("review.action", cluster_id=cluster_id, action="reject", comment=body.comment)
    _cli("reject", aid, cluster_id, "--reason", body.comment or "rejected by reviewer", log=led.root / "review.log")
    return {"ok": True}

@app.post("/api/assessments/{aid}/clusters/{cluster_id}/request-changes")
def request_changes(aid: str, cluster_id: str, body: ReviewIn):
    led = Ledger(aid)
    led.events.emit("review.action", cluster_id=cluster_id, action="request_changes", comment=body.comment)
    _cli("request-changes", aid, cluster_id, "--comment", body.comment or "please revise", log=led.root / "review.log")
    return {"ok": True}

class EditIn(BaseModel):
    files: dict[str, str]          # path -> new content (relative to the fix worktree)
    message: str = "reviewer edit"

@app.post("/api/assessments/{aid}/clusters/{cluster_id}/edit")
def edit(aid: str, cluster_id: str, body: EditIn):
    """Human edits the fix directly: write files in the fix worktree, commit as human, then replay."""
    from ..coordinator import Coordinator
    from ..fix import dispatcher
    c = Coordinator.from_ledger(aid)
    cluster = c.ledger.read_cluster(cluster_id)
    comp = c.spec.components[cluster.component]
    wt = dispatcher.worktrees_dir(comp.repo_path) / cluster_id
    for rel, content in body.files.items():
        p = (wt / rel).resolve()
        if not str(p).startswith(str(wt.resolve())) or not any(rel.startswith(e) for e in comp.editable_paths):
            raise HTTPException(400, f"{rel} is outside editable paths")
        p.write_text(content)
    env = clean_env()
    subprocess.run(["git", "add", "-A"], cwd=wt); subprocess.run(["git", "commit", "-q", "-m", f"fix({cluster_id}): {body.message} (reviewer edit)"], cwd=wt, env=env)
    led = c.ledger
    led.events.emit("review.action", cluster_id=cluster_id, action="edit", files=list(body.files))
    threading.Thread(target=_replay_human, args=(aid, cluster_id), daemon=True).start()
    return {"ok": True}

def _replay_human(aid: str, cluster_id: str) -> None:
    from ..coordinator import Coordinator
    from ..fix import dispatcher
    from ..models import FixAttempt
    from ..replay import replay as replaymod
    import subprocess as sp
    c = Coordinator.from_ledger(aid)
    cluster = c.ledger.read_cluster(cluster_id)
    comp = c.spec.components[cluster.component]
    wt = dispatcher.worktrees_dir(comp.repo_path) / cluster_id
    attempts = c.ledger.attempts(cluster_id)
    n = (attempts[-1].n if attempts else 0) + 1
    head = sp.run(["git", "rev-parse", "HEAD"], cwd=wt, capture_output=True, text=True).stdout.strip()
    diff = sp.run(["git", "diff", "main..HEAD"], cwd=wt, capture_output=True, text=True).stdout
    fdir = c.ledger.fix_dir(cluster_id, n); (fdir / "diff.patch").write_text(diff)
    a = FixAttempt(cluster_id=cluster_id, n=n, author="human", branch=dispatcher.branch_for(cluster_id), commit=head, diff_path=str(fdir / "diff.patch"), status="replaying")
    tests = sp.run(comp.test_command, shell=True, cwd=wt, capture_output=True, text=True); a.tests_green = tests.returncode == 0
    c.ledger.write_attempt(a)
    rep = replaymod.replay_cluster(c.ledger, cluster, c.spec, wt, c.mcfg.replay_k, specs=c.specs, seed_of=c.seed_of, guard=c.guard, **c._grading_kw())
    a.replay = rep; a.status = "passed" if rep.passed == rep.total and a.tests_green else "failed"; c.ledger.write_attempt(a)
    c.ledger.events.emit("replay.done", cluster_id=cluster_id, attempt=n, before=rep.before, after=rep.after, author="human")
    if a.status == "passed":
        c.ledger.events.emit("approval.needed", cluster_id=cluster_id, attempt=n, commit=head, before=rep.before, after=rep.after)

@app.get("/api/assessments/{aid}/clusters/{cluster_id}/files")
def fix_files(aid: str, cluster_id: str):
    from ..coordinator import Coordinator
    from ..fix import dispatcher
    c = Coordinator.from_ledger(aid)
    cluster = c.ledger.read_cluster(cluster_id)
    comp = c.spec.components[cluster.component]
    wt = dispatcher.worktrees_dir(comp.repo_path) / cluster_id
    files = subprocess.run(["git", "diff", "--name-only", "main..HEAD"], cwd=wt, capture_output=True, text=True).stdout.split()
    return {"files": {f: (wt / f).read_text() for f in files if (wt / f).exists()}}

@app.post("/api/stop")
def stop():
    (config.ROOT / "STOP").write_text("stop")
    return {"ok": True}

@app.delete("/api/stop")
def unstop():
    p = config.ROOT / "STOP"
    if p.exists():
        p.unlink()
    return {"ok": True}

@app.get("/api/regressions")
def regressions():
    from ..replay import regress
    return regress.load_all()

# ---- SQLite store (read-only) ----
@app.get("/api/db/schema")
def db_schema():
    from .. import db
    return db.schema()

@app.get("/api/db/query")
def db_query(sql: str, limit: int = 500):
    """Read-only SQL over the ledger store. Single SELECT only; the connection is opened read-only."""
    from fastapi import HTTPException
    from .. import db
    try:
        return {"rows": db.query(sql, limit=min(limit, 2000))}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"query failed: {e}")
