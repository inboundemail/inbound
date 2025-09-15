#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

echo "Configuring git hooks path to .githooks"
git config core.hooksPath .githooks

# Make hooks executable
if [ -d .githooks ]; then
  chmod +x .githooks/* || true
fi

echo "Git hooks installed (core.hooksPath=.githooks)."
