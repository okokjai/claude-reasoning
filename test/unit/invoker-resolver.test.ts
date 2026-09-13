// test/unit/invoker-resolver.test.ts
// Contract: explicit --config path that does not exist must fail loud
// (user made a typo / pointed at wrong file); only the implicit default
// ./config.yaml may be absent silently when env supplies the fields.
import { describe, it, expect } from "vitest";
import { resolveInvoker } from "../../src/adapters/invoker-resolver.js";

const ENV_KEYS = [
  "CR_REASONING_BASE_URL",
  "CR_REASONING_API_KEY",
  "CR_REASONING_MODEL",
  "CR_REASONING_CONFIG",
  "CR_REASONING_INVOKER_MODULE",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
] as const;

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}
function restoreEnv(saved: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("resolveInvoker", () => {
  it("throws when an explicit --config path does not exist", async () => {
    const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    clearEnv();
    // Even with env supplying baseUrl, a missing EXPLICIT path is a user error.
    process.env.CR_REASONING_BASE_URL = "http://env.local";
    try {
      await expect(resolveInvoker("definitely-not-here.yaml")).rejects.toThrow(
        /not found|does not exist/i
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("resolves from env when implicit ./config.yaml is absent", async () => {
    const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    const savedCwd = process.cwd();
    clearEnv();
    process.env.CR_REASONING_BASE_URL = "http://env.local";
    try {
      // Move cwd to a directory with no config.yaml so the implicit default
      // resolves to a missing file — env alone must satisfy resolution.
      process.chdir("test");
      const inv = await resolveInvoker();
      expect(inv).toBeDefined();
    } finally {
      process.chdir(savedCwd);
      restoreEnv(saved);
    }
  });
});
