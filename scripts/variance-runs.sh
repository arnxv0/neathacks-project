#!/bin/bash
# Repeat the find-only attack pass against two target revisions (default: v0-unfixed and main), N times each,
# so the before/after claim comes with variance instead of a single number. Serves the revision on :8100 from a
# detached worktree, runs `preflight run --mode full --no-fix`, then swaps. Usage: scripts/variance-runs.sh [N] [revA] [revB]
set -uo pipefail
cd "$(dirname "$0")/.."
N="${1:-2}"; REV_A="${2:-v0-unfixed}"; REV_B="${3:-main}"
TARGET="${TARGET:-../acmesales-copilot}"
set -a; source .env; set +a
serve() {  # $1 = revision
  lsof -ti tcp:8100 | xargs -r kill 2>/dev/null; sleep 1; lsof -ti tcp:8100 | xargs -r kill -9 2>/dev/null
  rm -rf "${TARGET}-variance"; git -C "$TARGET" worktree prune
  git -C "$TARGET" worktree add -q --detach "${TARGET}-variance" "$1" || return 1
  ( cd "${TARGET}-variance" && ln -sfn "$(cd "$TARGET" && pwd)/.venv" .venv && cp "$TARGET/.env" .env \
    && CRUSTDATA_BASE_URL=http://127.0.0.1:8300 nohup uv run uvicorn app.main:app --host 127.0.0.1 --port 8100 > "/tmp/preflight-variance-$1.log" 2>&1 & )
  for i in $(seq 1 30); do curl -s -m 1 -o /dev/null -w "%{http_code}" http://127.0.0.1:8100/health | grep -q 200 && return 0; sleep 1; done
  return 1
}
for i in $(seq 1 "$N"); do
  for rev in "$REV_A" "$REV_B"; do
    serve "$rev" || { echo "could not serve $rev"; exit 1; }
    echo "=== run $i on $rev ($(git -C "$TARGET" rev-parse --short "$rev")) $(date +%H:%M:%S)"
    uv run preflight run "$TARGET" --mode full --no-fix --label "variance run $i on $rev" 2>&1 | grep -E "Assessment|succeeded|before|->" | tail -3
  done
done
serve "$REV_B" >/dev/null && echo "target back on $REV_B at :8100"
rm -rf "${TARGET}-variance"; git -C "$TARGET" worktree prune
