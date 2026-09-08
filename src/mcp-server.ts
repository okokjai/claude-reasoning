#!/usr/bin/env node
/**
 * Claude Reasoning MCP Server
 * Exposes claude-reasoning DAG pipeline as MCP tools.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createExecutor } from "./kernel/executor.js";
import { loadConfig } from "./kernel/config-loader.js";

const server = new Server(
  {
    name: "claude-reasoning",
    version: "2.0.6",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "cr_reason",
        description:
          "Execute the claude-reasoning graph pipeline (contracts A0-A4, C0-C2, stages S0-S6, P0 anti-hallucination & conclusion gates). Supports CoT, ToT, ReAct, and DAC paradigms.",
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The core question, proposal, or problem to analyze through the DAG reasoning pipeline.",
            },
            mode: {
              type: "string",
              enum: ["full", "skeleton"],
              default: "full",
              description: "Execution mode: 'full' to run pipeline, 'skeleton' to validate DAG structure & reachability.",
            },
          },
          required: ["question"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "cr_reason") {
    const args = request.params.arguments;
    if (!args || typeof args !== "object" || !("question" in args) || typeof args.question !== "string") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Invalid arguments: 'question' (string) is required.",
          },
        ],
      };
    }
    const question = args.question;
    const mode = "mode" in args && args.mode === "skeleton" ? "skeleton" : "full";

    let executor;
    try {
      const config = loadConfig();
      executor = createExecutor(config);
      const result = await executor.run({ question }, mode);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Reasoning pipeline execution failed: ${message}`,
          },
        ],
      };
    } finally {
      if (executor) {
        await executor.close();
      }
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
