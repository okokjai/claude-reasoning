#!/usr/bin/env bash
# Gate Check — Stop hook wrapper. Delegates to gate-check.py.
set -u
stdin_payload=$(cat)
[ -z "$stdin_payload" ] && exit 0
printf '%s' "$stdin_payload" | python3 "$(dirname "$0")/gate-check.py"