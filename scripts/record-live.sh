#!/bin/bash
# Record a live Preflight run for the demo video, isolated from the real evidence:
# a throwaway clone of the target at v0-unfixed, its own ledger and its own regression suite.
# Stop `make dev-host` first (tmux kill-session -t preflight): this uses the same ports.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
SRC="${TARGET:-../acmesales-copilot}"
LIVE="$(cd .. && pwd)/acmesales-copilot-live"
export PREFLIGHT_LEDGER_DIR="$PWD/ledger-live" PREFLIGHT_REGRESSIONS_DIR="$PWD/regressions-live"

rm -rf "$LIVE" "${LIVE}-worktrees" "$PREFLIGHT_LEDGER_DIR" "$PREFLIGHT_REGRESSIONS_DIR"
mkdir -p "$PREFLIGHT_LEDGER_DIR" "$PREFLIGHT_REGRESSIONS_DIR"
git clone -q "$SRC" "$LIVE"
( cd "$LIVE" && git checkout -q -B main v0-unfixed && { git cherry-pick -q a1111bb 2>/dev/null || git cherry-pick --abort 2>/dev/null || true; } )
[ -f "$SRC/.env" ] && cp "$SRC/.env" "$LIVE/.env"
( cd "$LIVE" && uv sync -q )

tmux kill-session -t preflight-live 2>/dev/null || true
E="PREFLIGHT_LEDGER_DIR=$PREFLIGHT_LEDGER_DIR PREFLIGHT_REGRESSIONS_DIR=$PREFLIGHT_REGRESSIONS_DIR"
tmux new-session -d -s preflight-live -n proxy "$E uv run preflight proxy --port 8300"
tmux new-window -t preflight-live -n target "cd $LIVE && CRUSTDATA_BASE_URL=http://127.0.0.1:8300 uv run uvicorn app.main:app --host 127.0.0.1 --port 8100"
tmux new-window -t preflight-live -n api "$E uv run preflight web --port 8200"
tmux new-window -t preflight-live -n web "cd apps/web && npm run dev"
for url in http://127.0.0.1:8100/health http://127.0.0.1:8200/api/health http://127.0.0.1:3000; do
  for _ in $(seq 90); do curl -sf -o /dev/null "$url" && break; sleep 1; done
  curl -sf -o /dev/null "$url" || { echo "not up: $url (tmux attach -t preflight-live)"; exit 1; }
done

cd apps/video
TARGET_DIR="$LIVE" node scripts/record-live.mjs
for f in public/live/*.webm; do ffmpeg -y -loglevel error -i "$f" -c:v libx264 -pix_fmt yuv420p -r 30 -crf 20 -movflags +faststart "${f%.webm}.mp4" && rm "$f"; done
echo "done: apps/video/public/live/ (live.mp4 + marks.json). Stop the stack: tmux kill-session -t preflight-live"
