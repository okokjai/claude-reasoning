// src/adapters/invoker-resolver.ts
// Shared invoker wiring for cli.ts and mcp.ts.
//
// Production: per-field resolution order is
//   CR_REASONING_* env → generic env (ANTHROPIC_* / OPENAI_*) → config.yaml.
// config.yaml is OPTIONAL: when every required field resolves from env, the file
// is not consulted. Missing baseUrl fails loud.
//
// Test hook: CR_REASONING_INVOKER_MODULE names a JS module exporting
// `createInvoker(env)`. The entry points never import test code; the hook keeps
// the offline suite free of network access and credentials.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import type { LlmInvoker } from "../kernel/invoker.js";
import type { HttpInvokerConfig } from "./http-invoker.js";

function readConfig(explicitPath?: string): Record<string, unknown> {
  const candidate = explicitPath ?? process.env.CR_REASONING_CONFIG ?? "config.yaml";
  if (!existsSync(candidate)) {
    // Explicit path (--config or CR_REASONING_CONFIG) is a user commitment:
    // a missing file is almost certainly a typo — fail loud.
    if (explicitPath !== undefined || process.env.CR_REASONING_CONFIG !== undefined) {
      throw new Error(`Invoker config not found: ${candidate}`);
    }
    // Implicit default ./config.yaml is OPTIONAL: env may already carry
    // everything the invoker needs.
    return {};
  }
  return parseYaml(readFileSync(candidate, "utf8")) as Record<string, unknown>;
}

export async function resolveInvoker(configPath?: string): Promise<LlmInvoker> {
  if (process.env.CR_REASONING_INVOKER_MODULE) {
    const mod = (await import(
      pathToFileURL(process.env.CR_REASONING_INVOKER_MODULE).href
    )) as { createInvoker(env: NodeJS.ProcessEnv): LlmInvoker };
    return mod.createInvoker(process.env);
  }
  const { HttpInvoker } = await import("./http-invoker.js");
  const cfg = readConfig(configPath);
  const env = process.env;
  const baseUrl =
    env.CR_REASONING_BASE_URL ??
    env.ANTHROPIC_BASE_URL ??
    env.OPENAI_BASE_URL ??
    (cfg.baseUrl as string | undefined);
  if (!baseUrl) {
    throw new Error(
      "Invoker needs a baseUrl: set CR_REASONING_BASE_URL (or ANTHROPIC_BASE_URL / OPENAI_BASE_URL), or create ./config.yaml"
    );
  }
  const baseUrlFromAnthropic = env.CR_REASONING_BASE_URL === undefined && env.OPENAI_BASE_URL === undefined && env.ANTHROPIC_BASE_URL !== undefined;
  const httpConfig: HttpInvokerConfig = {
    baseUrl,
    protocol: baseUrlFromAnthropic ? "anthropic" : "openai",
    apiKey:
      env.CR_REASONING_API_KEY ??
      env.ANTHROPIC_AUTH_TOKEN ??
      env.ANTHROPIC_API_KEY ??
      env.OPENAI_API_KEY ??
      (cfg.apiKey as string | undefined),
    model: env.CR_REASONING_MODEL ?? env.ANTHROPIC_MODEL ?? (cfg.model as string | undefined),
  };
  return new HttpInvoker(httpConfig);
}

/** dbPath override honored by CLI/MCP shells; undefined falls back to the executor default. */
export function resolveDbPath(): string | undefined {
  return process.env.CR_REASONING_DB_PATH;
}
