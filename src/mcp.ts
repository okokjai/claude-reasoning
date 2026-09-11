import { pathToFileURL } from "node:url";
// src/mcp.ts — MCP stdio server (spec §10.1)
//   Tools: cr_reason({ question, mode? }), cr_resume({ threadId, input })
//   Thin shells over reason()/resume(); thread namespace shared with the CLI
//   through the same SQLite store, so an interrupt raised via MCP can be
//   answered by `cr-reasoning resume` and vice versa.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reason, resume } from "./kernel/executor.js";
import { resolveInvoker, resolveDbPath } from "./adapters/invoker-resolver.js";
import type { PrimaryMode } from "./kernel/types.js";

const MODES: readonly PrimaryMode[] = ["decision", "design", "diagnostic", "innovation", "optimization"];

export async function startMcpServer(): Promise<void> {
  const invoker = await resolveInvoker();
  const dbPath = resolveDbPath();

  const server = new McpServer({ name: "cr-reasoning-v2", version: "2.0.0" });

  server.tool(
    "cr_reason",
    "Run the full reasoning pipeline on a question; returns threadId plus the final (or interrupted) state.",
    {
      question: z.string().min(1),
      mode: z.enum(["decision", "design", "diagnostic", "innovation", "optimization"]).optional(),
    },
    async ({ question, mode }) => {
      const { threadId, state } = await reason(question, {
        invoker,
        dbPath,
        mode: mode as PrimaryMode | undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ threadId, state }) }],
      };
    }
  );

  server.tool(
    "cr_resume",
    "Resume a paused reasoning thread; supply the user's clarification, or omit input to continue after a crash.",
    {
      threadId: z.string().min(1),
      input: z.string().optional(),
    },
    async ({ threadId, input }) => {
      const { state } = await resume(threadId, input, { invoker, dbPath });
      return {
        content: [{ type: "text", text: JSON.stringify({ threadId, state }) }],
      };
    }
  );

  await server.connect(new StdioServerTransport());
}

// A stdio server must start itself: the guard keeps `import` in tests inert
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMcpServer().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
