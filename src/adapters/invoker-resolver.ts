// src/adapters/invoker-resolver.ts
// Shared invoker wiring for cli.ts and mcp.ts.
//
// Production: per-field resolution order is
//   CR_REASONING_* env → generic env (ANTHROPIC_* / OPENAI_*) → config.yaml.
// config.yaml is OPTIONAL: when every required field resolves from env, the file
// is not consulted. Missing baseUrl fails loud.
//
// Config file lookup order for the implicit default:
//   1. explicit --config / CR_REASONING_CONFIG  → must exist; fail loud if not.
//   2. ./config.yaml                              → optional.
//   3. ~/.claude/claude-reasoning/config.yaml     → optional user-level fallback.
//      Lets `npx claude-reasoning run ...` work from any cwd once the user has
//      populated their global config, instead of silently 401-ing.
//
// Test hook: CR_REASONING_INVOKER_MODULE names a JS module exporting
// `createInvoker(env)`. The entry points never import test code; the hook keeps
// the offline suite free of network access and credentials.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import type { LlmInvoker } from "../kernel/invoker.js";
import type { HttpInvokerConfig } from "./http-invoker.js";

function userLevelConfigPath(): string | undefined {
  const home = homedir();
  if (!home) return undefined;
  return join(home, ".claude", "claude-reasoning", "config.yaml");
}

function readConfig(explicitPath?: string): Record<string, unknown> {
  if (explicitPath !== undefined || process.env.CR_REASONING_CONFIG !== undefined) {
    // Explicit path is a user commitment: a missing file is almost certainly
    // a typo — fail loud, do NOT fall back to the user-level config.
    const candidate = explicitPath ?? process.env.CR_REASONING_CONFIG!;
    if (!existsSync(candidate)) {
      throw new Error(`Invoker config not found: ${candidate}`);
    }
    return parseYaml(readFileSync(candidate, "utf8")) as Record<string, unknown>;
  }
  // Implicit default: prefer ./config.yaml, else fall back to the user-level
  // config so `npx claude-reasoning` works from any cwd. Both optional.
  // Per-field merge (cwd wins, then user-level); an empty string in the cwd
  // copy counts as "unset" so a repo-shipped placeholder doesn't shadow the
  // user-level credentials.
  const cwdConfig = "config.yaml";
  const cwdCfg: Record<string, unknown> = existsSync(cwdConfig)
    ? (parseYaml(readFileSync(cwdConfig, "utf8")) as Record<string, unknown>)
    : {};
  const userConfig = userLevelConfigPath();
  const userCfg: Record<string, unknown> =
    userConfig && existsSync(userConfig)
      ? (parseYaml(readFileSync(userConfig, "utf8")) as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...userCfg };
  for (const [k, v] of Object.entries(cwdCfg)) {
    if (v !== undefined && v !== null && v !== "") merged[k] = v;
  }
  return merged;
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
  // Per-field "non-empty" helper: treats unset, undefined, null, and "" as
  // equivalent so a placeholder env var doesn't shadow real credentials.
  const pick = (...vals: Array<string | undefined>): string | undefined =>
    vals.find((v) => v !== undefined && v !== null && v !== "");
  const baseUrl = pick(
    env.CR_REASONING_BASE_URL,
    env.ANTHROPIC_BASE_URL,
    env.OPENAI_BASE_URL,
    cfg.baseUrl as string | undefined
  );
  if (!baseUrl) {
    throw new Error(
      "Invoker needs a baseUrl: set CR_REASONING_BASE_URL (or ANTHROPIC_BASE_URL / OPENAI_BASE_URL), or create ./config.yaml"
    );
  }
  // Only treat baseUrl as "came from Anthropic" when ANTHROPIC_BASE_URL itself
  // supplied a non-empty value. An empty-string placeholder must not flip the
  // wire protocol to "anthropic" while a sibling var supplies the actual URL.
  const baseUrlFromAnthropic =
    env.CR_REASONING_BASE_URL === undefined &&
    env.ANTHROPIC_BASE_URL !== undefined &&
    env.ANTHROPIC_BASE_URL !== "";
  const httpConfig: HttpInvokerConfig = {
    baseUrl,
    protocol: baseUrlFromAnthropic ? "anthropic" : "openai",
    apiKey: pick(
      env.CR_REASONING_API_KEY,
      env.ANTHROPIC_AUTH_TOKEN,
      env.ANTHROPIC_API_KEY,
      env.OPENAI_API_KEY,
      cfg.apiKey as string | undefined
    ),
    model: pick(
      env.CR_REASONING_MODEL,
      env.ANTHROPIC_MODEL,
      cfg.model as string | undefined
    ),
  };
  return new HttpInvoker(httpConfig);
}

/** dbPath override honored by CLI/MCP shells; undefined falls back to the executor default. */
export function resolveDbPath(): string | undefined {
  return process.env.CR_REASONING_DB_PATH;
}
