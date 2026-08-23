#!/usr/bin/env bash
# Gate Check — Stop hook wrapper. Delegates to gate-check.py.
set -u
read -r stdin_payload || exit 0
printf '%s' "$stdin_payload" | python3 "$(dirname "$0")/gate-check.py"