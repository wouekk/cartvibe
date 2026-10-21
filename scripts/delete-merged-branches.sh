#!/usr/bin/env bash
# One-off: deletes the remote branches that are already part of main (and the old language-and-polish branch, which
# feature/redesign contains). Run it yourself from a checkout with push access: git refuses nothing here, but the
# deletes are permanent on GitHub.
set -euo pipefail
branches=(
  chore/agent-docs chore/handoff-claude-code-app chore/phase-3-plan
  feature/clean-theme feature/container-paths feature/health-tags feature/image-rename feature/list-receipts
  feature/overview-dashboard feature/phase-3-backlog feature/phase-3-new feature/phase-3-quick-wins
  feature/phase-3-simplify feature/receipt-products feature/shopping-list-phase-1 feature/theme-modes
  feature/language-and-polish
)
for b in "${branches[@]}"; do
  git push origin --delete "$b" || echo "skipped $b"
done
git fetch --prune origin
