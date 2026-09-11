// test/integration/mcp.test.ts
// Contract (plan Task 8b, spec §10.1): `src/mcp.ts` is a launchable stdio
// server exposing `cr_reason` and `cr_resume` over the shared graph.
//
// The CLI test cannot cover this: it treats the entry point as a program with
// arguments, while MCP clients spawn it as a bare server. A module that only
// *exports* the server still type-checks and still passes the CLI test, but
// fails every real harness with "MCP error -32000: Connection closed".
// Driving the real JSON-RPC handshake over stdio pins the actual contract.
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
    tools?: Array<{ name: string }>;
    content?: Array<{ type: string; text?: string }>;
  };
}

interface McpSession {
  replies: JsonRpcReply[];
  stderr: string;
  exitStatus: number | null;
  child: ChildProcess;
}

/**
 * Drives one JSON-RPC session over the child's stdio; resolves once the last
 * request is answered or the server exits. No wall-clock timer: an
 * unanswered request is caught by the vitest test timeout, and the caller's
 * `finally` reaps the child either way.
 */
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
      } catch {
        /* partial line; the rest arrives with the next chunk */
      }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on("close", (status) => settle(status));

  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  return promise;
}

describe("MCP stdio entry point (Task 8b)", () => {
  it("serves cr_reason over a real stdio handshake", async () => {
    const db: TempDb = tempDb();
    let session: McpSession | undefined;
    try {
      session = await runMcp(
        [
          {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "cr-test", version: "1.0" },
            },
          },
          { jsonrpc: "2.0", method: "notifications/initialized" },
          { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "cr_reason",
              arguments: { question: "Should we adopt AlphaWorks?", mode: "design" },
            },
          },
        ],
        {
          CR_REASONING_INVOKER_MODULE: resolve("test/fixtures/offline-invoker.mjs"),
          CR_REASONING_FIXTURES: resolve("test/fixtures/happy-path.tsv"),
          CR_REASONING_DB_PATH: db.dbPath,
        }
      );

      expect(
        session.exitStatus,
        `server exited before answering. stderr: ${session.stderr}`
      ).toBeNull();

      const tools = session.replies.find((r) => r.id === 2)?.result?.tools ?? [];
      expect(tools.map((t) => t.name).sort()).toEqual(["cr_reason", "cr_resume"]);

      const call = session.replies.find((r) => r.id === 3);
      expect(call?.error).toBeUndefined();
      const payload = JSON.parse(call?.result?.content?.[0]?.text ?? "{}");
      expect(payload.threadId).toMatch(/^cr-/);
      expect(payload.state.primary_mode).toBe("design");
      expect(payload.state.conclusion_card).toBe("final card");
    } finally {
      session?.child.kill();
      db.cleanup();
    }
  });
});
