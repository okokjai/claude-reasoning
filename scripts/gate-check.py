#!/usr/bin/env python3
"""Gate Check — Stop hook core logic.

Compares trail vs contract. Prints JSON decision to stdout:
  {"decision": "continue"}                 -> allow stopping
  {"decision": "block", "reason": "..."}   -> prevent stop, inject missing list

Only hard_required items are blocking (no false positives on pure reasoning).
"""
import json
import os
import sys

# Force UTF-8 for stdout so the Stop hook JSON reason is not mangled by locale encoding (Windows cp950)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CONTRACTS_DIR = os.path.expanduser("~/.claude/reasoning-contracts")
TRAIL_DIR = os.path.expanduser("~/.claude/reasoning-trail")


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        print(json.dumps({"decision": "continue"}))
        return

    session_id = payload.get("session_id", "") or ""
    contract_path = os.path.join(CONTRACTS_DIR, session_id + ".json")
    trail_path = os.path.join(TRAIL_DIR, session_id + ".jsonl")

    # Kill switch: no contract -> not a reasoning session -> allow
    if not os.path.exists(contract_path):
        print(json.dumps({"decision": "continue"}))
        return

    with open(contract_path, encoding="utf-8") as f:
        contract = json.load(f)

    # Load trail tool occurrences
    tool_counts = {}
    if os.path.exists(trail_path):
        with open(trail_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    tool = entry.get("tool", "")
                    tool_counts[tool] = tool_counts.get(tool, 0) + 1
                except Exception:
                    continue

    missing = []
    for req in contract.get("hard_required", []):
        tool = req.get("tool")
        minc = req.get("min_count", 1)
        got = tool_counts.get(tool, 0)
        if got < minc:
            missing.append(f"- {req.get('stage')}: 需要調用 `{tool}` 至少 {minc} 次，trail 記錄為 {got} 次（{req.get('why','')}）")

    if missing:
        # Check stop_hook_active to prevent infinite loop:
        # if stop_hook_active is true, we already blocked once this turn.
        # Blocking again would trap the model in an endless loop.
        if payload.get("stop_hook_active", False):
            # Allow the stop but warn via reason
            print(json.dumps({
                "decision": "continue",
                "reason": "Previous block already served; allowing stop with residual unmet requirements.",
                "hookSpecificOutput": {
                    "additionalContext": (
                        "⚠️ **注意：以下強制工具調用仍未滿足，但已 block 過一次，不再重複攔截。**\n\n"
                        + "\n".join(missing)
                        + "\n\n請在下一輪補做。"
                    )
                }
            }, ensure_ascii=False))
            return

        reason = "Execution Gate Intercepted: 推理流程未完成契約要求"
        context = (
            "🚧 **Execution Gate 攔截：推理流程未完成契約要求**\n\n"
            "以下強制工具調用缺失，無法停止。請補做後再輸出結論：\n\n"
            + "\n".join(missing)
            + "\n\n（此判定由 Stop hook 依 trail 生成，模型不可更改。）"
        )
        print(json.dumps({
            "decision": "block",
            "reason": reason,
            "hookSpecificOutput": {
                "additionalContext": context
            }
        }, ensure_ascii=False))
        return

    print(json.dumps({"decision": "continue"}))


if __name__ == "__main__":
    main()