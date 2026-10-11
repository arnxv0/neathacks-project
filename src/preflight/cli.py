"""Preflight CLI."""
from __future__ import annotations
import pathlib
import typer
from rich.console import Console

app = typer.Typer(no_args_is_help=True, help="Preflight crash-tests an AI agent before launch.")
console = Console()

@app.command()
def run(target_dir: pathlib.Path = typer.Argument(..., help="directory containing preflight.yaml"),
        mode: str = typer.Option("dev", help="dev | full"),
        attacks: str = typer.Option(None, help="P0 | D1,E1 | all"),
        seeds: int = typer.Option(None, help="override seeds per attack"),
        label: str = typer.Option(None, help="free-text label stored in the manifest"),
        no_fix: bool = typer.Option(False, "--no-fix", help="stop after clustering (find only)")):
    """Attack, grade, cluster, find divergence, dispatch fixers, replay. Stops at AWAIT_APPROVAL."""
    from .coordinator import Coordinator
    Coordinator(target_dir, mode=mode, attacks=attacks, seeds=seeds, label=label, no_fix=no_fix).run()

@app.command()
def resume(assessment_id: str):
    """Resume an interrupted assessment from its ledger (reuses fixer commits already on the fix branches)."""
    from .coordinator import Coordinator, ensure_proxy
    ensure_proxy()
    Coordinator.from_ledger(assessment_id).resume()

@app.command()
def approve(assessment_id: str, cluster_id: str):
    """Merge the passing fix for a cluster, save it as a regression test; finishes the assessment when all clusters are resolved."""
    from .coordinator import Coordinator
    Coordinator.from_ledger(assessment_id).approve(cluster_id)

@app.command()
def reject(assessment_id: str, cluster_id: str, reason: str = typer.Option(..., "--reason")):
    from .coordinator import Coordinator
    Coordinator.from_ledger(assessment_id).reject(cluster_id, reason)

@app.command("request-changes")
def request_changes(assessment_id: str, cluster_id: str, comment: str = typer.Option(..., "--comment")):
    """Send the reviewer's comment back to the fixer; it revises, then replay runs again."""
    from .coordinator import Coordinator
    Coordinator.from_ledger(assessment_id).request_changes(cluster_id, comment)

@app.command()
def regress(target_dir: pathlib.Path, assessment_id: str = typer.Option(None, help="ledger to record into (default: new)")):
    """Run the saved regression suite against the target's current main."""
    from .coordinator import Coordinator
    from .ledger import new_assessment_id
    c = Coordinator(target_dir, mode="dev", attacks="all", assessment_id=assessment_id or ("regress-" + new_assessment_id()), label="regression-suite")
    from .attacks import catalog as cat
    c.specs = {s.id: s for s in cat.load_all()}
    c.ledger.write_manifest({"assessment_id": c.ledger.assessment_id, "state": "REGRESSION_SUITE", "target_dir": str(c.target_dir), "mode": "dev", "kind": "regress"})
    from .coordinator import ensure_proxy
    ensure_proxy()
    from .llm.gateway import Gateway
    c.gateway = Gateway(on_spend=c._spend)
    res = c.regress(emit=True)
    bad = [r for r in res if not r["passed"]]
    console.print(f"regressions: {len(res)} suites, {len(bad)} regressed")
    raise typer.Exit(code=1 if bad else 0)

@app.command()
def init(target_dir: pathlib.Path):
    """Validate preflight.yaml, check the target is up, verify ownership, discover tools."""
    from .target import loader, manifest, process
    import json
    spec = loader.load(target_dir)
    process.wait_healthy(spec.entry, timeout_s=10)
    process.verify_ownership(spec)
    man = manifest.build(spec)
    console.print_json(json.dumps(man, default=str))

@app.command()
def proxy(port: int = 8300):
    """Run the chaos proxy in the foreground."""
    import uvicorn
    from .chaos.proxy import app as proxy_app
    uvicorn.run(proxy_app, host="0.0.0.0", port=port)

@app.command()
def stop():
    """Kill switch: create the STOP file."""
    from . import config
    (config.ROOT / "STOP").write_text("stop")
    console.print("STOP file written")

@app.command()
def report(assessment_id: str):
    from .ledger import Ledger
    from .report import report as reportmod
    from .attacks import catalog
    led = Ledger(assessment_id)
    specs = {s.id: s for s in catalog.load_all()}
    rep = reportmod.write(led, specs)
    reportmod.print_scorecard(rep["scorecard"], title=assessment_id)

@app.command()
def web(host: str = "127.0.0.1", port: int = 8200):
    """Run the Preflight web API (REST + SSE) for the dashboard."""
    import uvicorn
    uvicorn.run("preflight.web.app:app", host=host, port=port, log_level="info")

if __name__ == "__main__":
    app()

db_app = typer.Typer(no_args_is_help=True, help="SQLite ledger store (ledger/preflight.sqlite, or $PREFLIGHT_DB).")
app.add_typer(db_app, name="db")

@db_app.command("sync")
def db_sync(assessment_id: str = typer.Argument(None, help="one assessment; default: every ledger directory")):
    """Rebuild the SQLite store from the file ledger (idempotent)."""
    from . import db
    from .ledger import Ledger
    out = [db.sync_assessment(Ledger(assessment_id))] if assessment_id else db.sync_all()
    for o in out:
        console.print(f"{o['assessment_id']}: {o['runs']} runs, {o['events']} events")
    console.print(f"store: {db.path()}")

@db_app.command("query")
def db_query(sql: str, as_json: bool = typer.Option(False, "--json")):
    """Run a read-only SELECT against the store."""
    import json as _json
    from rich.table import Table
    from . import db
    try:
        rows = db.query(sql)
    except ValueError as e:
        console.print(f"[red]{e}"); raise typer.Exit(2)
    if as_json:
        print(_json.dumps(rows, indent=2, default=str)); return
    if not rows:
        console.print("(no rows)"); return
    t = Table(*rows[0].keys())
    for r in rows:
        t.add_row(*[str(v)[:80] if v is not None else "" for v in r.values()])
    console.print(t)

def _fmt(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, dict):
        return ", ".join(f"{k}={_fmt(x)}" for k, x in v.items()) or "-"
    return str(v)

@db_app.command("stats")
def db_stats(assessment_id: str = typer.Argument(None, help="default: the most recently updated assessment"),
             as_json: bool = typer.Option(False, "--json")):
    """One-screen summary of an assessment: before/after scorecard, clusters, fixes, replays, regressions, recoveries."""
    import json as _json, sqlite3
    from rich.table import Table
    from . import db
    try:
        s = db.stats(assessment_id)
    except (LookupError, sqlite3.OperationalError) as e:
        console.print(f"[red]{e}"); raise typer.Exit(1)
    if as_json:
        print(_json.dumps(s, indent=2, default=str)); return
    t = Table("metric", "value", title=s["assessment_id"], show_lines=False)
    for k, v in s.items():
        t.add_row(k, _fmt(v))
    console.print(t)

@db_app.command("path")
def db_path():
    from . import db
    print(db.path())

@db_app.command("export")
def db_export(dest: pathlib.Path):
    """Copy the store to DEST as one self-contained SQLite file (checkpoints the WAL first)."""
    import shutil
    from . import db
    with db.connect() as c:
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    shutil.copy(db.path(), dest)
    console.print(f"exported {db.path()} -> {dest} ({dest.stat().st_size // 1024} KB)")
