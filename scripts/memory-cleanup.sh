#!/usr/bin/env bash
# memory-cleanup.sh — Reasoning memory cleanup and rotation
# Usage: bash scripts/memory-cleanup.sh [--dry-run] [--keep N]
#   --dry-run  Only show cleanup plan, do not delete
#   --keep N   Keep the most recent N reasoning logs (default 20)
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MEMORY_DIR="${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}"
DRY_RUN=false
KEEP=20

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --keep)    KEEP="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

LOGS_DIR="$MEMORY_DIR/reasoning-logs"
CACHE_DIR="$MEMORY_DIR/reasoning-patterns/cache"
ANTI_DIR="$MEMORY_DIR/reasoning-anti-patterns"

echo "=== Memory cleanup (dry_run=$DRY_RUN, keep=$KEEP) ==="

# 1. Reasoning logs: keep the most recent N
if [ -d "$LOGS_DIR" ]; then
  LOG_COUNT=$(ls -1 "$LOGS_DIR" 2>/dev/null | wc -l)
  echo "[reasoning-logs] Total $LOG_COUNT entries, keeping newest $KEEP"
  if [ "$LOG_COUNT" -gt "$KEEP" ]; then
    REMOVE=$((LOG_COUNT - KEEP))
    echo "  Will remove $REMOVE oldest log(s):"
    ls -1t "$LOGS_DIR" | tail -n "$REMOVE" | while read -r f; do
      echo "  - $f"
      if [ "$DRY_RUN" = false ]; then
        rm -f "$LOGS_DIR/$f"
      fi
    done
    if [ "$DRY_RUN" = true ]; then
      echo "  (dry-run: no deletion performed)"
    fi
  else
    echo "  Nothing to clean"
  fi
else
  echo "[reasoning-logs] Directory does not exist, skipping"
fi

# 2. Cache: deduplicate by prefix (keep newest version)
if [ -d "$CACHE_DIR" ]; then
  echo "[cache] Checking for duplicates..."
  DUP_COUNT=0
  # Dedup key is the filename prefix (before underscore), keep newest modified
  for prefix in $(ls "$CACHE_DIR" 2>/dev/null | sed 's/_.*//' | sort -u); do
    files=$(ls -1t "$CACHE_DIR/${prefix}_"* 2>/dev/null)
    count=$(echo "$files" | wc -l)
    if [ "$count" -gt 1 ]; then
      DUP_COUNT=$((DUP_COUNT + count - 1))
      echo "  Duplicate prefix '$prefix': $count entries, keeping newest 1"
      echo "$files" | tail -n "+2" | while read -r f; do
        echo "    - $f"
        if [ "$DRY_RUN" = false ]; then
          rm -f "$CACHE_DIR/$f"
        fi
      done
    fi
  done
  if [ "$DUP_COUNT" -eq 0 ]; then
    echo "  No duplicates"
  fi
  if [ "$DRY_RUN" = true ]; then
    echo "  (dry-run: no deletion performed)"
  fi
else
  echo "[cache] Directory does not exist, skipping"
fi

# 3. Anti-patterns: no auto-delete, list for manual review
echo "[anti-patterns] No auto-delete. Current files (please review manually):"
if [ -d "$ANTI_DIR" ]; then
  ls -1 "$ANTI_DIR" 2>/dev/null | while read -r f; do
    echo "  - $f"
  done
else
  echo "  (directory does not exist)"
fi

echo "=== Cleanup complete ==="