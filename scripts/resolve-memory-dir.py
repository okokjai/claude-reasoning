#!/usr/bin/env python3
"""Resolve the effective CLAUDE_MEMORY_DIR.

Priority:
1. settings.json env.CLAUDE_MEMORY_DIR (works across shells)
2. $CLAUDE_MEMORY_DIR env var
3. default ~/.claude/memory
"""
import json
import os
import sys

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

    # 3. default
    print(os.path.expanduser("~/.claude/memory").replace("\\", "/"))

if __name__ == "__main__":
    main()
