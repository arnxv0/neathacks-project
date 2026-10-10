#!/bin/bash
# Susceptibility probe: which target model falls for D1/D2 at least sometimes?
cd "$(dirname "$0")/.."
for model in "$@"; do
  pkill -f "uvicorn app.main:app" 2>/dev/null; sleep 1
  (cd ../acmesales-copilot && CRUSTDATA_BASE_URL=http://127.0.0.1:8300 TARGET_MODEL=$model uv run uvicorn app.main:app --host 127.0.0.1 --port 8100 > /tmp/acmesales-$model.log 2>&1 &)
  sleep 5
  echo "################ model=$model"
  timeout 900 uv run preflight run ../acmesales-copilot --mode dev --attacks D1,D2 --seeds 3 --label "probe:$model" 2>&1 | grep -E "PASS|FAIL|succeeded|spend" 
done
