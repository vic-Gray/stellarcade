#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config core.hooksPath .githooks

echo "Hooks enabled for this clone."
echo "Current hooksPath: $(git config --get core.hooksPath)"
