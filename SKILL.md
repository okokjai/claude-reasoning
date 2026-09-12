---
name: claude-reasoning
version: 2.0.0
description: Graph-based reasoning pipeline (LangGraphJS host). Trigger only —
  execution is delegated to the claude-reasoning MCP tool or CLI.
triggers: ["reasoning", "structured reasoning", "deep analysis", "root cause"]
---
# claude-reasoning — Router (execution delegated)
1. Preferred: invoke MCP tool `claude_reason` / `cr_reason` with the user's question.
2. Fallback (no MCP): run `npx claude-reasoning run "<question>" --json`.
Do NOT read prompts/ files into context; the host runtime loads them.
