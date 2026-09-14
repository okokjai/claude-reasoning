// test/unit/mcp-schema-broadcast.test.ts
// Reproduction for the live `-32602 Required at question` failure:
//   registerTool({ inputSchema: unwrapArgs(shape) }) stores a ZodEffects.
//   The SDK's ListTools handler calls normalizeObjectSchema(tool.inputSchema)
//   which only accepts ZodObject; for ZodEffects it returns undefined and the
//   broadcast falls back to EMPTY_OBJECT_JSON_SCHEMA. Clients then send `{}`,
//   and the runtime parse rejects with "Required at question".
//
// Contract under test: every tool's broadcast `inputSchema` must expose
// `properties.question` (and `properties.mode`/`threadId`/`input`) AND must
// still tolerate the `{ arguments: {...} }` double-wrap produced by upstream
// proxies — the original motivation for unwrapArgs.
import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { tempDb, type TempDb } from "../mocks/temp-db.js";

const MCP_ENTRY = resolve("src/mcp.ts");
const TSX = resolve("node_modules/tsx/dist/cli.mjs");

interface JsonRpcReply {
  id?: number;
  error?: { code?: number; message?: string };
  result?: {
    tools?: Array<{
      name: string;
      inputSchema?: {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };
    }>;
    content?: Array<{ type: string; text?: string }>;
  };
}

interface McpSession {
  replies: JsonRpcReply[];
  stderr: string;
  exitStatus: number | null;
  child: ChildProcess;
}

function runMcp(requests: unknown[], env: NodeJS.ProcessEnv): Promise<McpSession> {
  const { promise, resolve } = Promise.withResolvers<McpSession>();
  const child = spawn(process.execPath, [TSX, MCP_ENTRY], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lastId = (requests[requests.length - 1] as { id: number }).id;
  const replies: JsonRpcReply[] = [];
  let stderr = "";
  let settled = false;
  const settle = (exitStatus: number | null) => {
    if (settled) return;
    settled = true;
    child.kill();
    resolve({ replies, stderr, exitStatus, child });
  };
  child.stdout.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const reply = JSON.parse(line) as JsonRpcReply;
        replies.push(reply);
        if (reply.id === lastId) settle(null);
      } catch { /* partial line */ }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on("close", (status) => settle(status));
  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  return promise;
}

describe("MCP inputSchema broadcast (bug: properties:{} caused -32602)", () => {
  it("tools/list advertises the real question/mode properties, not an empty object", async () => {
    const db: TempDb = tempDb();
    let session: McpSession | undefined;
    try {
      session = await runMcp(
        [
          {
            jsonrpc: "2.0", id: 1, method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "cr-schema-test", version: "1.0" },
            },
          },
          { jsonrpc: "2.0", method: "notifications/initialized" },
          { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        ],
        {
          CR_REASONING_INVOKER_MODULE: resolve("test/fixtures/offline-invoker.mjs"),
          CR_REASONING_FIXTURES: resolve("test/fixtures/happy-path.tsv"),
          CR_REASONING_TOOL_MODULE: resolve("test/fixtures/offline-tool-adapter.mjs"),
          CR_REASONING_DB_PATH: db.dbPath,
        }
      );

      const tools = session.replies.find((r) => r.id === 2)?.result?.tools ?? [];
      const crReason = tools.find((t) => t.name === "cr_reason");
      expect(crReason, "cr_reason must be advertised").toBeDefined();
      const props = crReason?.inputSchema?.properties ?? {};
      expect(
        Object.keys(props).sort(),
        `cr_reason broadcast inputSchema.properties must include question+mode; got ${JSON.stringify(props)}`
      ).toEqual(["mode", "question"]);
      expect(crReason?.inputSchema?.required).toContain("question");

      const crResume = tools.find((t) => t.name === "cr_resume");
      const resumeProps = crResume?.inputSchema?.properties ?? {};
      expect(Object.keys(resumeProps).sort()).toEqual(["input", "threadId"]);
      expect(crResume?.inputSchema?.required).toContain("threadId");
    } finally {
      session?.child.kill();
      db.cleanup();
    }
  });

  it("tools/call accepts the { arguments: {...} } double-wrap from upstream proxies", async () => {
    const db: TempDb = tempDb();
    let session: McpSession | undefined;
    try {
      session = await runMcp(
        [
          {
            jsonrpc: "2.0", id: 1, method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "cr-unwrap-test", version: "1.0" },
            },
          },
          { jsonrpc: "2.0", method: "notifications/initialized" },
          {
            jsonrpc: "2.0", id: 2, method: "tools/call",
            params: {
              name: "cr_reason",
              // The proxy shape that motivated unwrapArgs in the first place.
              arguments: { arguments: { question: "q?", mode: "design" } },
            },
          },
        ],
        {
          CR_REASONING_INVOKER_MODULE: resolve("test/fixtures/offline-invoker.mjs"),
          CR_REASONING_FIXTURES: resolve("test/fixtures/happy-path.tsv"),
          CR_REASONING_TOOL_MODULE: resolve("test/fixtures/offline-tool-adapter.mjs"),
          CR_REASONING_DB_PATH: db.dbPath,
        }
      );

      const call = session.replies.find((r) => r.id === 2);
      expect(
        call?.error,
        `double-wrapped call must not be rejected. stderr: ${session.stderr}`
      ).toBeUndefined();
      const payload = JSON.parse(call?.result?.content?.[0]?.text ?? "{}");
      expect(payload.threadId).toMatch(/^cr-/);
    } finally {
      session?.child.kill();
      db.cleanup();
    }
  });
});
