#!/usr/bin/env bash
# Sequential Thinking wrapper — shell entry point.
# Delegates to sequential-thinking.py.
# Usage: bash scripts/sequential-thinking.sh --thought "..." [options]
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/sequential-thinking.py" "$@"