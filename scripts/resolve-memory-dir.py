#!/usr/bin/env python3
"""Resolve the effective CLAUDE_MEMORY_DIR.

Priority:
1. settings.json env.CLAUDE_MEMORY_DIR (works across shells)
2. $CLAUDE_MEMORY_DIR env var
3. Canonical project memory root ~/.claude/projects/<project>/memory
   — if several roots exist, the one with the largest entry count wins
     (the most-populated index is the authoritative memory root)
4. legacy default ~/.claude/memory

The canonical root is preferred over the deprecated ~/.claude/memory:
memories migrated on 2026-08-30 (memory-dir-canonical).
"""
import json
import os
import glob


def main():
    # 1. settings.json (the authoritative config)
    settings_path = os.path.expanduser("~/.claude/settings.json")
    try:
        with open(settings_path, encoding="utf-8") as f:
            settings = json.load(f)
        configured = settings.get("env", {}).get("CLAUDE_MEMORY_DIR", "") or ""
        if configured:
            print(configured.replace("\\", "/"))
            return
    except Exception:
        pass

    # 2. env var fallback
    env_dir = os.environ.get("CLAUDE_MEMORY_DIR", "") or ""
    if env_dir:
        print(env_dir.replace("\\", "/"))
        return

    # 3. canonical project memory root (~/.claude/projects/<project>/memory)
    #    Most-populated index wins; ties broken by sorted project name.
    candidates = glob.glob(os.path.join(os.path.expanduser("~/.claude/projects"), "*", "memory"))
    if candidates:
        def entry_count(path):
            try:
                return len(os.listdir(path))
            except OSError:
                return 0
        chosen = max(candidates, key=lambda p: (entry_count(p), p))
        print(chosen.replace("\\", "/"))
        return

    # 4. legacy default
    print(os.path.expanduser("~/.claude/memory").replace("\\", "/"))


if __name__ == "__main__":
    main()
