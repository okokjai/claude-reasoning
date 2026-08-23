#!/usr/bin/env bash
# Comprehensive sync check: validates Memory index integrity, runtime tool availability, content consistency
set -u

RUNTIME_MODE=false
if [ "${1:-}" = "--runtime" ]; then
  RUNTIME_MODE=true
  shift
fi

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILL_FILE="$SKILL_DIR/SKILL.md"
# Read CLAUDE_MEMORY_DIR from settings.json first (survives across shell envs),
# then fall back to env var, then to default.
MEMORY_DIR="$(python3 "$(dirname "$0")/resolve-memory-dir.py" 2>/dev/null)"
if [ -z "$MEMORY_DIR" ]; then
  MEMORY_DIR="${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}"
fi
MCP_CONFIG="$HOME/.claude/mcp_servers.json"
CLAUDE_JSON="$HOME/.claude.json"
TODAY="$(date +%Y-%m-%d)"

FAIL=0

echo "=== Step 1: Memory directory integrity =="
for dir in reasoning-patterns reasoning-logs reasoning-anti-patterns; do
  if [ -d "$MEMORY_DIR/$dir" ] && [ -z "$(ls -A "$MEMORY_DIR/$dir" 2>/dev/null)" ]; then
    echo "  [FAIL] memory/$dir is empty"; FAIL=1
  fi
done
if [ -d "$MEMORY_DIR/reasoning-patterns/cache" ] && [ -z "$(ls -A "$MEMORY_DIR/reasoning-patterns/cache" 2>/dev/null)" ]; then
  echo "  [WARN] memory/reasoning-patterns/cache is empty"
fi

echo "== Step 2: Runtime tool detection =="
# Check sequential-thinking in mcp_servers.json
if [ -f "$MCP_CONFIG" ]; then
  if grep -q "sequential-thinking" "$MCP_CONFIG" 2>/dev/null; then
    echo "  [OK] sequential-thinking configured in mcp_servers.json"
  else
    echo "  [WARN] sequential-thinking not found in mcp_servers.json (may be session-injected)"
  fi
else
  echo "  [WARN] mcp_servers.json not found, skipping config check"
fi

# Check unified-fetch (global mcp_servers.json or .claude.json)
UF_FOUND=false
if [ -f "$MCP_CONFIG" ] && grep -q "unified-fetch" "$MCP_CONFIG" 2>/dev/null; then
  echo "  [OK] unified-fetch configured in mcp_servers.json"
  UF_FOUND=true
fi
if [ "$UF_FOUND" = false ] && [ -f "$CLAUDE_JSON" ]; then
  if grep -q "unified-fetch" "$CLAUDE_JSON" 2>/dev/null; then
    echo "  [OK] unified-fetch configured in .claude.json"
    UF_FOUND=true
  fi
fi
if [ "$UF_FOUND" = false ]; then
  echo "  [WARN] unified-fetch not found in mcp_servers.json or .claude.json"
fi

echo "== Step 3: Graph node completeness =="
NODE_FAIL=0
# Contract layer
for f in contracts/A0.md contracts/A1.md contracts/A2.md contracts/A3.md contracts/A4.md contracts/C0.md contracts/C1.md contracts/C2.md; do
  if [ ! -f "$SKILL_DIR/$f" ]; then echo "  [FAIL] Missing $f"; NODE_FAIL=1; fi
done
# Stage layer
for f in stages/stage-0-mini-brainstorming.md stages/stage-1-decomposition.md stages/stage-2-hypothesis.md stages/stage-3-verification.md stages/stage-4-synthesis.md stages/stage-5-critique.md stages/stage-5.5-hallucination-harness.md stages/stage-6-conclusion.md; do
  if [ ! -f "$SKILL_DIR/$f" ]; then echo "  [FAIL] Missing $f"; NODE_FAIL=1; fi
done
# Mode layer
for f in modes/diagnostic.md modes/design.md modes/decision.md modes/optimization.md modes/innovation.md; do
  if [ ! -f "$SKILL_DIR/$f" ]; then echo "  [FAIL] Missing $f"; NODE_FAIL=1; fi
done
# Quality layer + changelog
for f in quality/self-assessment.md CHANGELOG.md; do
  if [ ! -f "$SKILL_DIR/$f" ]; then echo "  [FAIL] Missing $f"; NODE_FAIL=1; fi
done
if [ "$NODE_FAIL" -eq 0 ]; then
  echo "  [OK] All node files present (8 contracts + 8 stages + 5 modes + 1 quality + 1 changelog)"
else
  FAIL=1
fi

echo "== Step 3.5: MEMORY.md index integrity =="
MEMORY_INDEX="$MEMORY_DIR/MEMORY.md"
MEMORY_MISS=0
if [ -f "$MEMORY_INDEX" ]; then
  # Extract all parenthesized .md references and verify files exist
  for ref in $(grep -oE '\([A-Za-z0-9_/-]+\.md\)' "$MEMORY_INDEX" 2>/dev/null | sed 's/[()]//g'); do
    if [ ! -f "$MEMORY_DIR/$ref" ]; then
      echo "  [FAIL] MEMORY.md references $ref but file does not exist"
      MEMORY_MISS=1
    fi
  done
  if [ "$MEMORY_MISS" -eq 0 ]; then
    echo "  [OK] All MEMORY.md references exist"
  else
    FAIL=1
  fi
else
  echo "  [WARN] MEMORY.md not found, skipping index check"
fi

echo "== Step 3.5: SKILL.md DAG reference integrity =="
# Extract all contracts/ stages/ modes/ quality/ references from SKILL.md DAG, compare with disk
DAG_REF_FAIL=0
for ref in $(grep -oE '(contracts|stages|modes|quality)/[A-Za-z0-9._-]+\.md' "$SKILL_FILE" 2>/dev/null | sort -u); do
  if [ ! -f "$SKILL_DIR/$ref" ]; then
    echo "  [FAIL] SKILL.md references $ref but file does not exist"
    DAG_REF_FAIL=1
  fi
done
if [ "$DAG_REF_FAIL" -eq 0 ]; then
  echo "  [OK] All SKILL.md references exist"
else
  FAIL=1
fi

# Reverse check: SKILL.md should not reference deleted scripts/eval/
if grep -q "scripts/eval\|fixtures\|run-eval\|evidence.json" "$SKILL_FILE" 2>/dev/null; then
  echo "  [FAIL] SKILL.md still references deleted Eval framework (scripts/eval/)"
  FAIL=1
else
  echo "  [OK] No Eval framework remnants"
fi

echo "== Step 4: Dead code checks =="
if [ -f "$SKILL_FILE" ]; then
  GHOST_COUNT=0
  # Check for Hound ghost values (quality_cap 31/, evidence_cap literal 3.5)
  if grep -q "3\.5" "$SKILL_FILE" 2>/dev/null; then
    echo "  [FAIL] evidence_cap still has Hound ghost value 3.5"
    GHOST_COUNT=$((GHOST_COUNT + 1))
  fi
  if grep -q "31/" "$SKILL_FILE" 2>/dev/null; then
    echo "  [FAIL] quality_cap still has Hound ghost value 31"
    GHOST_COUNT=$((GHOST_COUNT + 1))
  fi
  if [ "$GHOST_COUNT" -eq 0 ]; then
    echo "  [OK] No Hound ghost values"
  else
    FAIL=1
  fi

  # Check platform_mode is updated (no "CLI Hound Mode")
  if grep -q "CLI Hound Mode" "$SKILL_FILE" 2>/dev/null; then
    echo "  [FAIL] Platform mode still contains CLI Hound Mode"
    FAIL=1
  else
    echo "  [OK] Platform mode correctly updated"
  fi

  # Check version consistency: CHANGELOG latest version == frontmatter == title
  LATEST_VERSION=$(grep -m1 '^## v' "$SKILL_DIR/CHANGELOG.md" 2>/dev/null | sed 's/^## v//' | sed 's/ .*//')
  FRONTMATTER_VERSION=$(grep '^version: ' "$SKILL_FILE" 2>/dev/null | sed 's/version: //')
  TITLE_VERSION=$(grep '^# Claude Reasoning v' "$SKILL_FILE" 2>/dev/null | sed 's/.*v//' | sed 's/ —.*//')
  if [ -n "$LATEST_VERSION" ] && [ "$LATEST_VERSION" = "$FRONTMATTER_VERSION" ] && [ "$LATEST_VERSION" = "$TITLE_VERSION" ]; then
    echo "  [OK] Version consistent: v${LATEST_VERSION}"
  else
    echo "  [FAIL] Version mismatch: CHANGELOG=v${LATEST_VERSION:-?}, frontmatter=v${FRONTMATTER_VERSION:-?}, title=v${TITLE_VERSION:-?}"
    FAIL=1
  fi

  # Check can_branch=false downgrade rule exists (in stages/, SKILL.md, or architecture.md)
  if grep -q "can_branch=false" "$SKILL_FILE" 2>/dev/null || grep -qr "can_branch=false" "$SKILL_DIR/stages" "$SKILL_DIR/architecture.md" 2>/dev/null; then
    echo "  [OK] can_branch=false linear mode rule present"
  else
    echo "  [FAIL] Missing can_branch=false downgrade rule"
    FAIL=1
  fi

  # Check Verifier Separation principle exists (in stages/, SKILL.md, or architecture.md)
  if grep -q "Verifier Separation" "$SKILL_FILE" 2>/dev/null || grep -qr "Verifier Separation" "$SKILL_DIR/stages" "$SKILL_DIR/architecture.md" 2>/dev/null; then
    echo "  [OK] Verifier Separation principle present"
  else
    echo "  [FAIL] Missing Verifier Separation principle"
    FAIL=1
  fi

  # Check revision limit exists (in stages/, SKILL.md, or architecture.md)
  if grep -q "revision limit" "$SKILL_FILE" 2>/dev/null || grep -qr "revision limit" "$SKILL_DIR/stages" "$SKILL_DIR/architecture.md" 2>/dev/null; then
    echo "  [OK] Revision limit (max 3) present"
  else
    echo "  [FAIL] Missing revision limit"
    FAIL=1
  fi

  # Check denominator /50 calculation rule exists (in quality/ or SKILL.md)
  if grep -q "/50" "$SKILL_FILE" 2>/dev/null || grep -qr "/50" "$SKILL_DIR/quality" 2>/dev/null; then
    echo "  [OK] Denominator /50 calculation rule present"
  else
    echo "  [FAIL] Missing denominator /50 calculation rule"
    FAIL=1
  fi
fi

echo "== Step 4.5: Contract semantic checks =="
CONTRACT_FAIL=0
CAN_BRANCH_FILES=(
  "$SKILL_DIR/contracts/A2.md"
  "$SKILL_DIR/contracts/C1.md"
  "$SKILL_DIR/stages/stage-0-mini-brainstorming.md"
  "$SKILL_DIR/stages/stage-1-decomposition.md"
  "$SKILL_DIR/stages/stage-2-hypothesis.md"
  "$SKILL_DIR/stages/stage-5-critique.md"
)
for file in "${CAN_BRANCH_FILES[@]}"; do
  if grep -Eq 'can_branch[^[:cntrl:]]*(yes/no|yes\|no)' "$file" 2>/dev/null; then
    echo "  [FAIL] Legacy can_branch yes/no value in $(basename "$file")"
    CONTRACT_FAIL=1
  fi
done
if ! grep -q 'Stage 0/1/2/5 sequential-thinking calls' "$SKILL_DIR/contracts/C1.md"; then
  echo "  [FAIL] C1 does not cover Stage 0 linear fallback"
  CONTRACT_FAIL=1
fi
if ! grep -q 'Stage 0 remains mandatory' "$SKILL_DIR/contracts/C1.md"; then
  echo "  [FAIL] C1 does not preserve mandatory Stage 0 precedence"
  CONTRACT_FAIL=1
fi
if ! grep -q 'B9 → B5 → B6 → B7 → B8 → B9' "$SKILL_DIR/stages/stage-0-mini-brainstorming.md"; then
  echo "  [FAIL] Stage 0 B9 bounded loop is not explicit"
  CONTRACT_FAIL=1
fi
if ! grep -q 'no_new_angle' "$SKILL_DIR/stages/stage-0-mini-brainstorming.md"; then
  echo "  [FAIL] Stage 0 no_new_angle termination is missing"
  CONTRACT_FAIL=1
fi
if grep -q 'Stage 0 -> Stage 1.*stage_0_uncertainty' "$SKILL_DIR/contracts/C2.md"; then
  echo "  [FAIL] C2 retains dangling stage_0_uncertainty transfer"
  CONTRACT_FAIL=1
fi
if ! grep -q 'Stage 3 -> Stage 5.5.*claim_registry' "$SKILL_DIR/contracts/C2.md"; then
  echo "  [FAIL] C2 does not require claim_registry before Stage 5.5"
  CONTRACT_FAIL=1
fi
if ! grep -q 'Stage 4 -> Stage 5.*source_quality_matrix.*claim_verification_status.*data_gap_list' "$SKILL_DIR/contracts/C2.md"; then
  echo "  [FAIL] C2 does not pass verification aggregates to Stage 5"
  CONTRACT_FAIL=1
fi
if ! grep -q 'failure_route=stage-3' "$SKILL_DIR/contracts/C2.md" || ! grep -q 'failure_route=stage-5' "$SKILL_DIR/contracts/C2.md"; then
  echo "  [FAIL] C2 does not define both Stage 5.5 failure routes"
  CONTRACT_FAIL=1
fi
if ! grep -q 'Stage 6 -> Stage 1' "$SKILL_DIR/contracts/C2.md"; then
  echo "  [FAIL] C2 does not define the post-gate Stage 6 route"
  CONTRACT_FAIL=1
fi
if ! grep -q 'failure_route' "$SKILL_DIR/stages/stage-5.5-hallucination-harness.md"; then
  echo "  [FAIL] Stage 5.5 failure_route is missing"
  CONTRACT_FAIL=1
fi
if ! grep -q 'candidate_frame_count' "$SKILL_DIR/stages/stage-0-mini-brainstorming.md" || ! grep -q 'selected_frame_count' "$SKILL_DIR/stages/stage-0-mini-brainstorming.md"; then
  echo "  [FAIL] Stage 0 frame count fields are missing"
  CONTRACT_FAIL=1
fi
if ! grep -q 'no_new_angle.*iteration_count=0\|iteration_count=0.*no_new_angle' "$SKILL_DIR/stages/stage-0-mini-brainstorming.md"; then
  echo "  [FAIL] Stage 0 does not bind no_new_angle to iteration_count=0"
  CONTRACT_FAIL=1
fi
if ! grep -q 'revision_target.*problem_definition' "$SKILL_DIR/stages/stage-5-critique.md"; then
  echo "  [FAIL] Stage 5 does not forbid revision_target aliases"
  CONTRACT_FAIL=1
fi
if ! grep -q 'candidate input, not evidence' "$SKILL_DIR/contracts/C2.md" && ! grep -q 'candidate input, not evidence' "$SKILL_DIR/stages/stage-0-mini-brainstorming.md"; then
  echo "  [FAIL] Candidate/evidence boundary is missing"
  CONTRACT_FAIL=1
fi
if [ "$CONTRACT_FAIL" -eq 0 ]; then
  echo "  [OK] Cross-stage semantic contract checks passed"
else
  FAIL=1
fi

 echo "== Step 5: Date check =="
if [ -f "$SKILL_FILE" ]; then
  SKILL_DATE=$(grep -o '2026-08-[0-9][0-9]' "$SKILL_FILE" 2>/dev/null | head -1)
  if [ -z "$SKILL_DATE" ]; then
    echo "  [OK] SKILL.md has no date (graph-based, date in CHANGELOG.md)"
  elif [ "$SKILL_DATE" != "$TODAY" ]; then
    echo "  [WARN] SKILL.md date $SKILL_DATE differs from today $TODAY"
  else
    echo "  [OK] Date $SKILL_DATE matches today"
  fi
fi

echo "== Step 6: Quality cap consistency check (contracts/A2.md) =="
if [ -f "$SKILL_DIR/contracts/A2.md" ]; then
  # Check quality_cap has exactly 2 values (CLI/Desktop dual mode)
  QC_LINE=$(grep "quality_cap" "$SKILL_DIR/contracts/A2.md" | head -1)
  QC_COUNT=$(echo "$QC_LINE" | grep -oE '[0-9]+' | wc -l)
  if [ "$QC_COUNT" -eq 2 ]; then
    echo "  [OK] quality_cap has 2 values (CLI/Desktop)"
  else
    echo "  [FAIL] quality_cap has $QC_COUNT values (expected 2): $QC_LINE"
    FAIL=1
  fi
  # Check evidence_cap has exactly 2 values
  EC_LINE=$(grep "evidence_cap" "$SKILL_DIR/contracts/A2.md" | head -1)
  EC_COUNT=$(echo "$EC_LINE" | grep -oE '[0-9]+(\.[0-9]+)?' | wc -l)
  if [ "$EC_COUNT" -eq 2 ]; then
    echo "  [OK] evidence_cap has 2 values (CLI/Desktop)"
  else
    echo "  [FAIL] evidence_cap has $EC_COUNT values (expected 2): $EC_LINE"
    FAIL=1
  fi
fi


echo "== Step 7: README alignment (P0) =="
README_FAIL=0
README="$SKILL_DIR/README.md"
if [ -f "$README" ]; then
  if grep -q "DAG orchestration" "$README" 2>/dev/null; then
    echo "  [FAIL] README still contains 'DAG orchestration' (use forward DAG-shaped pipeline)"; README_FAIL=1
  else
    echo "  [OK] README DAG terminology aligned"
  fi
  if grep -q "@modelcontextprotocol/server-sequential-thinking" "$README" 2>/dev/null; then
    echo "  [OK] README uses @modelcontextprotocol package"
  else
    echo "  [FAIL] README missing @modelcontextprotocol/server-sequential-thinking"; README_FAIL=1
  fi
  if grep -q "@anthropic-ai/mcp-server-sequential-thinking" "$README" 2>/dev/null; then
    echo "  [FAIL] README still references legacy @anthropic-ai package"; README_FAIL=1
  fi
  if grep -q "can_branch" "$README" 2>/dev/null; then
    echo "  [OK] README documents can_branch"
  else
    echo "  [FAIL] README missing can_branch documentation"; README_FAIL=1
  fi
  if grep -q "candidate_frame_count" "$README" 2>/dev/null && grep -q "selected_frame_count" "$README" 2>/dev/null && grep -q "no_new_angle" "$README" 2>/dev/null; then
    echo "  [OK] README packet invariants present"
  else
    echo "  [FAIL] README missing Stage 0 packet invariants"; README_FAIL=1
  fi
  if grep -q "memory-cleanup.sh" "$README" 2>/dev/null; then
    echo "  [OK] README project tree includes memory-cleanup.sh"
  else
    echo "  [FAIL] README project tree missing memory-cleanup.sh"; README_FAIL=1
  fi
  if grep -q "claim_registry" "$README" 2>/dev/null && grep -q "failure_route" "$README" 2>/dev/null; then
    echo "  [OK] README claim lifecycle / failure routes documented"
  else
    echo "  [FAIL] README missing claim lifecycle / failure routes"; README_FAIL=1
  fi
else
  echo "  [WARN] README.md not found"
fi
if [ "$README_FAIL" -ne 0 ]; then FAIL=1; fi

echo "== Step 8: Contract closure (P1 semantic) =="
CLOSE_FAIL=0
# data_type enum closure
if grep -q "legacy alias.*internal-logic" "$SKILL_DIR/contracts/A0.md" 2>/dev/null && grep -q "legacy alias.*internal-logic" "$SKILL_DIR/contracts/A1.md" 2>/dev/null; then
  echo "  [OK] data_type enum closure (A1/A0 legacy alias documented)"
else
  echo "  [FAIL] data_type enum closure missing legacy alias note in A0/A1"; CLOSE_FAIL=1
fi
# Type A threshold consistency
if grep -q "not independently verified" "$SKILL_DIR/contracts/A3.md" 2>/dev/null && grep -q "not independently verified" "$SKILL_DIR/stages/stage-3-verification.md" 2>/dev/null; then
  echo "  [OK] Type A threshold unified (not independently verified)"
else
  echo "  [FAIL] Type A threshold not unified"; CLOSE_FAIL=1
fi
if grep -q "verification failed" "$SKILL_DIR/stages/stage-6-conclusion.md" 2>/dev/null; then
  echo "  [OK] Stage 6 Type A single-source = verification failed"
else
  echo "  [FAIL] Stage 6 missing single-source verification failed handling"; CLOSE_FAIL=1
fi
# C2 field closure: check key rows exist
if grep -q "A1 -> Stage 0" "$SKILL_DIR/contracts/C2.md" 2>/dev/null; then
  echo "  [OK] C2 has A1->Stage 0 edge"
else
  echo "  [FAIL] C2 missing A1->Stage 0 edge"; CLOSE_FAIL=1
fi
if grep -q "Stage 3 -> Stage 2" "$SKILL_DIR/contracts/C2.md" 2>/dev/null; then
  echo "  [OK] C2 has Stage 3->Stage 2 rerun edge"
else
  echo "  [FAIL] C2 missing Stage 3->Stage 2 edge"; CLOSE_FAIL=1
fi
if grep -q "Stage 6 -> Quality" "$SKILL_DIR/contracts/C2.md" 2>/dev/null && grep -q "hypothesis_count.*ambient" "$SKILL_DIR/contracts/C2.md" 2>/dev/null; then
  echo "  [OK] C2 Stage6->Quality includes ambient fields"
else
  echo "  [FAIL] C2 Stage6->Quality missing ambient fields"; CLOSE_FAIL=1
fi
# quality denominator
if grep -q "/36" "$SKILL_DIR/quality/self-assessment.md" 2>/dev/null && grep -q "/50" "$SKILL_DIR/quality/self-assessment.md" 2>/dev/null; then
  echo "  [OK] quality denominator /50 base + /36 simplified aligned"
else
  echo "  [FAIL] quality denominator not aligned (/50 + /36 expected)"; CLOSE_FAIL=1
fi
if [ "$CLOSE_FAIL" -ne 0 ]; then FAIL=1; fi

echo "== Step 9: Release/tag status (WARN only) =="
if git -C "$SKILL_DIR" tag --list 2>/dev/null | grep -q "v"; then
  echo "  [OK] git tags present: $(git -C "$SKILL_DIR" tag --list | tr '\n' ' ')"
else
  echo "  [WARN] no git tags yet (expected v1.1.0 after release)"
fi
if grep -q "^## Unreleased" "$SKILL_DIR/CHANGELOG.md" 2>/dev/null; then
  echo "  [WARN] CHANGELOG still has Unreleased section (move to v1.1.0 on release)"
fi
if [ -x "$(command -v gh 2>/dev/null)" ] || command -v gh >/dev/null 2>&1; then
  if gh release list --repo okokjai/claude-reasoning 2>/dev/null | grep -q "v"; then
    echo "  [OK] GitHub releases present"
  else
    echo "  [WARN] no GitHub releases yet (create v1.1.0 after tag)"
  fi
else
  echo "  [WARN] gh CLI not available, skip GitHub release check"
fi

if [ "$RUNTIME_MODE" = true ]; then
  echo "== Step 10: Runtime trail audit (execution enforcement) =="
  CONTRACTS_DIR="$HOME/.claude/reasoning-contracts"
  TRAIL_DIR="$HOME/.claude/reasoning-trail"
  if [ ! -d "$CONTRACTS_DIR" ] || [ -z "$(ls -A "$CONTRACTS_DIR" 2>/dev/null)" ]; then
    echo "  [WARN] No reasoning contracts found (no /claude-reasoning sessions run)"
  else
    for contract_file in "$CONTRACTS_DIR"/*.json; do
      session_id=$(basename "$contract_file" .json)
      trail_file="$TRAIL_DIR/$session_id.jsonl"
      echo "  -- Session: $session_id"
      if [ ! -f "$trail_file" ]; then
        echo "    [FAIL] trail missing (stopped before any tool call)"
        continue
      fi
      TMPFILE=$(mktemp /tmp/sync-check.XXXXXX 2>/dev/null || echo "/tmp/sync-check-$$.tmp")
      python3 - "$contract_file" "$trail_file" <<'PYEOF' > "$TMPFILE"
import json, sys
contract_path, trail_path = sys.argv[1], sys.argv[2]
with open(contract_path, encoding="utf-8") as f:
    contract = json.load(f)
counts = {}
st_fallback = 0
with open(trail_path, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            entry = json.loads(line)
            t = entry.get("tool", "")
            inp = entry.get("input", {}) or {}
            counts[t] = counts.get(t, 0) + 1
            if t == "Bash":
                cmd = str(inp.get("command", "") or inp.get("cmd", "") or "")
                if "sequential-thinking" in cmd:
                    st_fallback += 1
        except Exception: pass
any_fail = False
for req in contract.get("hard_required", []):
    tool = req.get("tool"); minc = req.get("min_count", 1); got = counts.get(tool, 0)
    if tool == "mcp__sequential-thinking__sequentialthinking" and got < minc and st_fallback >= minc:
        got = st_fallback
        status = "[OK] "
    else:
        status = "[OK] " if got >= minc else "[FAIL] "
    if status == "[FAIL] ":
        any_fail = True
    print(f"    {status}hard: {tool} x{got} (need {minc})")
for req in contract.get("soft_required", []):
    if "tool_group" in req:
        g = req["tool_group"]; got = sum(counts.get(t, 0) for t in g)
        status = "[OK] " if got >= req.get("min_count", 1) else "[WARN] "
        print(f"    {status}soft: {g[0]}... x{got} (need {req.get('min_count',1)})")
    else:
        tool = req.get("tool"); got = counts.get(tool, 0)
        print(f"    [INFO] soft: {tool} x{got} (advisory)")
sys.exit(1 if any_fail else 0)
PYEOF
      PY_EXIT=$?
      cat "$TMPFILE"
      if [ $PY_EXIT -ne 0 ]; then FAIL=1; fi
      rm -f "$TMPFILE"

    done
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  echo "=== All checks passed ==="
else
  echo "=== Sync issues / missing items detected ==="
  exit 1
fi
