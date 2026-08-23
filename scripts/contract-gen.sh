#!/usr/bin/env bash
# Contract Generator — UserPromptSubmit hook wrapper.
set -u
read -r stdin_payload || exit 0
printf '%s' "$stdin_payload" | python3 "$(dirname "$0")/contract-gen.py"