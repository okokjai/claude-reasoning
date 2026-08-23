#!/usr/bin/env bash
# Trail Logger — PostToolUse hook.
# Environment-append log of tool calls for reasoning sessions.
# The model never writes this file directly.
set -u

print_allow() {
  printf '{"decision":"allow"}'
}

stdin_payload=$(cat)
[ -z "$stdin_payload" ] && { printf '{"decision":"allow"}'; exit 0; }

# Only record when a contract exists for this session (kill switch)
session_id=$(printf '%s' "$stdin_payload" | python3 -c "import sys,json;print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "")
[ -z "$session_id" ] && print_allow && exit 0

CONTRACTS_DIR="$HOME/.claude/reasoning-contracts"
TRAIL_DIR="$HOME/.claude/reasoning-trail"
CONTRACT="$CONTRACTS_DIR/$session_id.json"

# Kill switch: no contract => not a reasoning session => do nothing
[ -f "$CONTRACT" ] || { print_allow; exit 0; }

mkdir -p "$TRAIL_DIR"
TRAIL="$TRAIL_DIR/$session_id.jsonl"

tool_name=$(printf '%s' "$stdin_payload" | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
tool_input=$(printf '%s' "$stdin_payload" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {}) or {}
    # keep only small scalar fields (query/url), drop bulky nested data
    slim = {}
    for k in ('query','url','focus','prompt','command','cmd'):
        if k in ti and isinstance(ti[k], str) and len(ti[k]) < 200:
            slim[k] = ti[k]
    print(json.dumps(slim, ensure_ascii=False))
except Exception:
    print('{}')
" 2>/dev/null || echo "{}")

ts=$(date +%s)

# Append one JSONL line (environment-generated, append-only)
printf '{"ts":%s,"tool":"%s","input":%s}\n' "$ts" "$tool_name" "$tool_input" >> "$TRAIL"

print_allow
