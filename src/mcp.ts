import { pathToFileURL } from "node:url";
// src/mcp.ts — MCP stdio server (spec §10.1)
//   Tools: cr_reason / claude_reason ({ question, mode? }),
//          cr_resume / claude_resume ({ threadId, input })
//   Thin shells over reason()/resume(); thread namespace shared with the CLI
//   through the same SQLite store, so an interrupt raised via MCP can be
//   answered by `claude-reasoning resume` and vice versa.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reason, resume } from "./kernel/executor.js";
import { resolveInvoker, resolveDbPath } from "./adapters/invoker-resolver.js";
import { resolveToolAdapter } from "./adapters/tool-adapter-resolver.js";
import type { PrimaryMode } from "./kernel/types.js";

const MODES = ["decision", "design", "diagnostic", "innovation", "optimization"] as const;

// Some upstream models / protocol proxies double-wrap tool arguments as
// `{ arguments: { ...real } }` instead of `{ ...real }`. A bare Zod shape
// would reject that with -32602 before the handler runs, so each tool's
// inputSchema unwraps a payload consisting of a single `arguments` object
// key one level before validating.
//
// Implementation note: this MUST stay a ZodObject (not z.preprocess →
// ZodEffects). The MCP SDK's ListTools handler feeds tool.inputSchema
// through normalizeObjectSchema(), which returns undefined for non-object
// schemas and falls back to EMPTY_OBJECT_JSON_SCHEMA — silently advertising
// `properties:{}` to clients and producing -32602 "Required at question"
// on every real call. Overriding the parse methods on the ZodObject keeps
// `_def.typeName === "ZodObject"`, so `.shape` survives normalization and
// the broadcast schema is correct.
function unwrapArgs<T extends z.ZodRawShape>(shape: T): z.ZodObject<T> {
  const inner = z.object(shape);
  const unwrap = (data: unknown): unknown =>
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).length === 1 &&
    "arguments" in data &&
    (data as Record<string, unknown>).arguments !== null &&
    typeof (data as Record<string, unknown>).arguments === "object" &&
    !Array.isArray((data as Record<string, unknown>).arguments)
      ? (data as Record<string, unknown>).arguments
      : data;

  // Dispatch through the prototype methods so `this` still refers to `inner`
  // (so overridden .parse doesn't recurse) while unwrapping the input first.
  type ParseParams = Parameters<z.ZodObject<T>["parse"]>[1];
  const proto = z.ZodObject.prototype;
  inner.parse = function (this: z.ZodObject<T>, data: unknown, params?: ParseParams) {
    return proto.parse.call(this, unwrap(data), params);
  } as typeof inner.parse;
  inner.parseAsync = function (this: z.ZodObject<T>, data: unknown, params?: ParseParams) {
    return proto.parseAsync.call(this, unwrap(data), params);
  } as typeof inner.parseAsync;
  inner.safeParse = function (this: z.ZodObject<T>, data: unknown, params?: ParseParams) {
    return proto.safeParse.call(this, unwrap(data), params);
  } as typeof inner.safeParse;
  inner.safeParseAsync = function (this: z.ZodObject<T>, data: unknown, params?: ParseParams) {
    return proto.safeParseAsync.call(this, unwrap(data), params);
  } as typeof inner.safeParseAsync;
  inner.spa = inner.safeParseAsync;
  return inner;
}

export async function startMcpServer(): Promise<void> {
  const invoker = await resolveInvoker();
  const toolAdapter = await resolveToolAdapter();
  const dbPath = resolveDbPath();

  const server = new McpServer({ name: "claude-reasoning", version: "2.2.0" });

  server.registerTool(
    "cr_reason",
    {
      description:
        "Run the full reasoning pipeline on a question; returns threadId plus the final (or interrupted) state.",
      inputSchema: unwrapArgs({
        question: z.string().min(1),
        mode: z.enum(MODES).optional(),
      }),
    },
    async ({ question, mode }) => {
      const { threadId, state } = await reason(question, {
        invoker,
        toolAdapter,
        dbPath,
        mode: mode as PrimaryMode | undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ threadId, state }) }],
      };
    }
  );
  server.registerTool(
    "cr_resume",
    {
      description:
        "Resume a paused reasoning thread; supply the user's clarification, or omit input to continue after a crash.",
      inputSchema: unwrapArgs({
        threadId: z.string().min(1),
        input: z.string().optional(),
      }),
    },
    async ({ threadId, input }) => {
      const { state } = await resume(threadId, input, { invoker, toolAdapter, dbPath });
      return {
        content: [{ type: "text", text: JSON.stringify({ threadId, state }) }],
      };
    }
  );

  // Backward-compatible aliases — identical thin shells over reason()/resume()
  server.registerTool(
    "claude_reason",
    {
      description:
        "Run the full reasoning pipeline on a question; returns threadId plus the final (or interrupted) state.",
      inputSchema: unwrapArgs({
        question: z.string().min(1),
        mode: z.enum(MODES).optional(),
      }),
    },
    async ({ question, mode }) => {
      const { threadId, state } = await reason(question, {
        invoker,
        toolAdapter,
        dbPath,
        mode: mode as PrimaryMode | undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ threadId, state }) }],
      };
    }
  );

  server.registerTool(
    "claude_resume",
    {
      description:
        "Resume a paused reasoning thread; supply the user's clarification, or omit input to continue after a crash.",
      inputSchema: unwrapArgs({
        threadId: z.string().min(1),
        input: z.string().optional(),
      }),
    },
    async ({ threadId, input }) => {
      const { state } = await resume(threadId, input, { invoker, toolAdapter, dbPath });
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
