// src/adapters/tool-adapter-resolver.ts
// Tool-adapter wiring for cli.ts and mcp.ts, mirroring invoker-resolver's test
// hook: CR_REASONING_TOOL_MODULE names a JS module exporting
// `createToolAdapter(env)`. When unset, returns undefined — the graph's
// built-in empty adapter then degrades Stage 3 to zero evidence and
// `Insufficient` instead of fabricating results.
import { pathToFileURL } from "node:url";
import type { ToolAdapter } from "../kernel/tool-adapter.js";

export async function resolveToolAdapter(): Promise<ToolAdapter | undefined> {
  const modulePath = process.env.CR_REASONING_TOOL_MODULE;
  if (!modulePath) return undefined;
  const mod = (await import(
    pathToFileURL(modulePath).href
  )) as { createToolAdapter?(env: NodeJS.ProcessEnv): ToolAdapter };
  if (typeof mod.createToolAdapter !== "function") {
    throw new Error(`tool adapter module ${modulePath} does not export createToolAdapter(env)`);
  }
  return mod.createToolAdapter(process.env);
}
