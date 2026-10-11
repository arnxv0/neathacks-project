#!/usr/bin/env python3
"""Mark stale fix attempts as `aborted` in a file ledger (idempotent; prints every change).

A coordinator process stopped at the wall-clock cap can leave an attempt at status `replaying` with `replay: null`;
when `preflight resume` later produced an approved attempt for the same cluster, that stale row is superseded but still
shows up as the newest attempt. This script sets exactly those rows (status `replaying`, `replay` null, and an approved
attempt of the same cluster written later) to status `aborted`. Nothing else is touched. Follow with
`uv run preflight db sync <assessment>` so the SQLite mirror matches the files.

Usage: python3 scripts/ledger-repair.py <assessment_id> [--dry-run] [--ledger DIR]
"""
from __future__ import annotations
import argparse, json, pathlib, sys

ap = argparse.ArgumentParser()
ap.add_argument("assessment_id")
ap.add_argument("--ledger", default=str(pathlib.Path(__file__).resolve().parents[1] / "ledger"))
ap.add_argument("--dry-run", action="store_true")
args = ap.parse_args()

fixes = pathlib.Path(args.ledger) / args.assessment_id / "fixes"
if not fixes.is_dir():
    sys.exit(f"no fixes directory at {fixes}")

changed = 0
for cluster in sorted(p for p in fixes.iterdir() if p.is_dir()):
    attempts = []
    for f in sorted(cluster.glob("attempt-*/attempt.json")):
        attempts.append((f, json.loads(f.read_text()), f.stat().st_mtime))
    approved_at = [m for _, a, m in attempts if a.get("status") == "approved"]
    if not approved_at:
        continue
    latest_approved = max(approved_at)
    for f, a, m in attempts:
        if a.get("status") == "replaying" and a.get("replay") is None and m < latest_approved:
            print(f"{args.assessment_id}/{cluster.name} attempt {a.get('n')}: replaying (replay=null, written before the approved attempt) -> aborted")
            if not args.dry_run:
                a["status"] = "aborted"
                f.write_text(json.dumps(a, indent=2))
            changed += 1
print(f"{'would change' if args.dry_run else 'changed'} {changed} attempt(s)")
