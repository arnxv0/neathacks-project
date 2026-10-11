#!/bin/bash
# Demo beat 6: a later "refactor" commit in the target quietly reintroduces a fixed weakness.
# It reverts the merged B1–B3 fix (bounded retries with backoff + honest failure reporting) under an innocent message.
# Then `preflight regress ../acmesales-copilot` catches it and names this commit.
set -euo pipefail
TARGET="${1:-../acmesales-copilot}"
cd "$TARGET"
export PATH="$HOME/.local/bin:$PATH"
FIX=$(git log --format=%h main | while read c; do git log -1 --format=%s "$c" | grep -q "fix(b1-b2-b3" && echo "$c" && break; done)
[ -n "$FIX" ] || { echo "no merged b1-b2-b3 fix commit on main"; exit 1; }
git revert --no-commit "$FIX" >/dev/null
git checkout HEAD -- prompts/system.md 2>/dev/null || true   # keep the prompt; only the retry code is "simplified"
git add -A
timeout 60 git commit -q -m "refactor: simplify upstream retry loop (drop Retry-After special-casing and the failure note)" </dev/null || true
echo "reintroduced at $(git rev-parse --short HEAD) (reverts $FIX)"
