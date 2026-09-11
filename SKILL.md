---
name: claude-reasoning-v2
version: 2.0.0
description: Graph-based reasoning pipeline (LangGraphJS host). Trigger only —
  execution is delegated to the cr-reasoning-v2 MCP tool or CLI.
triggers: ["reasoning", "structured reasoning", "deep analysis", "root cause"]
---
# cr-reasoning-v2 — Router (execution delegated)
1. Preferred: invoke MCP tool `cr_reason` with the user's question.
2. Fallback (no MCP): run `npx cr-reasoning-v2 run "<question>" --json`.
Do NOT read prompts/ files into context; the host runtime loads them.
