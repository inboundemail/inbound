#!/usr/bin/env bash

set -euo pipefail

# Configuration
PROJECT_ID="curly-king-52150024"
ENV_FILE=".env.local"

# Ensure neon CLI exists
if ! command -v neon >/dev/null 2>&1; then
  echo "GITNEON | ERROR: 'neon' CLI not found in PATH. Install Neon CLI first." >&2
  exit 1
fi

# Determine repository root and run from there
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# Current git branch
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
# Sanitize for Neon (replace slashes and spaces)
SANITIZED_BRANCH="${BRANCH_NAME//\//-}"
SANITIZED_BRANCH="${SANITIZED_BRANCH// /-}"
NEON_BRANCH="local/neon-${SANITIZED_BRANCH}"

# Ensure Neon branch exists (create if missing)
set +e
CREATE_OUTPUT=$(neon branches create --project-id "$PROJECT_ID" --name "$NEON_BRANCH" --output json 2>&1)
CREATE_STATUS=$?
set -e

if [ $CREATE_STATUS -ne 0 ]; then
  if ! echo "$CREATE_OUTPUT" | grep -qi "branch already exists"; then
    echo "GITNEON | ERROR: Neon CLI error creating branch:\n$CREATE_OUTPUT" >&2
    exit 1
  fi
fi

# Get connection string using Neon CLI per spec
set +e
CONNECTION_URI=$(neon connection-string "$NEON_BRANCH" --project-id "$PROJECT_ID" 2>/dev/null | tail -n1 | tr -d '\n' | sed 's/[[:space:]]*$//')
GET_STATUS=$?
set -e

if [ $GET_STATUS -ne 0 ] || [ -z "$CONNECTION_URI" ]; then
  echo "GITNEON | ERROR: Failed to obtain connection string for branch '$NEON_BRANCH'." >&2
  exit 1
fi

# Write/update .env.local
if [ ! -f "$ENV_FILE" ]; then
  echo "DATABASE_URL=$CONNECTION_URI" > "$ENV_FILE"
else
  if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    # macOS BSD sed requires empty string after -i
    sed -i '' -e "s|^DATABASE_URL=.*$|DATABASE_URL=$CONNECTION_URI|" "$ENV_FILE"
  else
    printf "\nDATABASE_URL=%s\n" "$CONNECTION_URI" >> "$ENV_FILE"
  fi
fi

echo "GITNEON | Updated $ENV_FILE with DATABASE_URL for Neon branch '$NEON_BRANCH' (git: '$BRANCH_NAME'). Connection URI: ${CONNECTION_URI:0:10}..."
