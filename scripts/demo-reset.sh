#!/bin/bash
# Reset the demo target to its unfixed state and clear Preflight's regression suite + ledger, so the recorded demo starts clean.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-../acmesales-copilot}"
export PATH="$HOME/.local/bin:$PATH"
( cd "$TARGET" \
  && git worktree prune \
  && for b in $(git branch --list 'fix/*' | tr -d ' *'); do git branch -D "$b" >/dev/null; done \
  && git checkout -q -B main v0-unfixed \
  && git cherry-pick -q a1111bb 2>/dev/null || true \
  && git log --oneline | head -3 )
rm -rf "${TARGET}-worktrees"
rm -f regressions/*.yaml
rm -rf ledger/* && touch ledger/.gitkeep
rm -f STOP
echo "target reset to v0-unfixed (+ entire-graph instructions); regressions and ledger cleared"
