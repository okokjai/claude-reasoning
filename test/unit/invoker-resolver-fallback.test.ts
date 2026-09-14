// test/unit/invoker-resolver-fallback.test.ts
// RED reproduction for the 401 root cause:
//   `npx claude-reasoning run ...` executed from a cwd that lacks ./config.yaml
//   silently resolved to an empty apiKey, then the remote endpoint rejected
//   with HttpInvoker: 401 Unauthorized.
//
// Contract: when no explicit --config / CR_REASONING_CONFIG / cwd
// ./config.yaml exists, resolveInvoker() must fall back to the user-level
// config at $HOME/.claude/claude-reasoning/config.yaml. If that file
// supplies baseUrl+apiKey+model, the invoker must come back configured.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { resolveInvoker } from "../../src/adapters/invoker-resolver.js";
import { HttpInvoker } from "../../src/adapters/http-invoker.js";

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
  "HOME",
  "USERPROFILE",
] as const;

describe("resolveInvoker user-level config fallback", () => {
  let saved: Record<string, string | undefined>;
  let savedCwd: string;
  let scratchDir: string;
  let fakeHome: string;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    savedCwd = process.cwd();
    scratchDir = mkdtempSync(join(tmpdir(), "cr-cwd-"));
    fakeHome = mkdtempSync(join(tmpdir(), "cr-home-"));
    // Point HOME/USERPROFILE at the fake home so the test is hermetic.
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    // cwd has NO config.yaml — the bug scenario.
    process.chdir(scratchDir);
  });

  afterEach(() => {
    process.chdir(savedCwd);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(scratchDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("falls back to ~/.claude/claude-reasoning/config.yaml when cwd has no config.yaml", async () => {
    // Arrange: populate the user-level config with credentials.
    const userCfgDir = join(fakeHome, ".claude", "claude-reasoning");
    mkdirSync(userCfgDir, { recursive: true });
    writeFileSync(
      join(userCfgDir, "config.yaml"),
      [
        'baseUrl: "https://user-level.example/v1"',
        'apiKey: "sk-user-level-key"',
        'model: "user-level-model"',
      ].join("\n"),
      "utf8"
    );

    const inv = await resolveInvoker();
    expect(inv).toBeInstanceOf(HttpInvoker);
    // Inspect the resolved config — HttpInvoker exposes it on .config.
    const cfg = (inv as HttpInvoker & { config?: { baseUrl?: string; apiKey?: string; model?: string } }).config;
    expect(cfg?.baseUrl).toBe("https://user-level.example/v1");
    expect(cfg?.apiKey).toBe("sk-user-level-key");
    expect(cfg?.model).toBe("user-level-model");
  });

  it("still prefers ./config.yaml over the user-level fallback", async () => {
    // cwd-local config wins.
    writeFileSync(
      join(scratchDir, "config.yaml"),
      [
        'baseUrl: "https://cwd.example/v1"',
        'apiKey: "sk-cwd"',
        'model: "cwd-model"',
      ].join("\n"),
      "utf8"
    );
    const userCfgDir = join(fakeHome, ".claude", "claude-reasoning");
    mkdirSync(userCfgDir, { recursive: true });
    writeFileSync(
      join(userCfgDir, "config.yaml"),
      [
        'baseUrl: "https://user-level.example/v1"',
        'apiKey: "sk-user-level-key"',
        'model: "user-level-model"',
      ].join("\n"),
      "utf8"
    );

    const inv = await resolveInvoker();
    const cfg = (inv as HttpInvoker & { config?: { baseUrl?: string } }).config;
    expect(cfg?.baseUrl).toBe("https://cwd.example/v1");
  });

  it("does NOT silently fall back when --config / CR_REASONING_CONFIG points at a missing file", async () => {
    // An explicit path is a user commitment; missing file = typo = loud error.
    await expect(resolveInvoker(join(scratchDir, "does-not-exist.yaml"))).rejects.toThrow(
      /not found|does not exist/i
    );
  });

  it("treats empty-string config fields as unset so placeholders don't shadow user-level", async () => {
    // Repo-shipped placeholder config.yaml has baseUrl/apiKey/model = "".
    // User-level has real values. Per-field merge must let real values through.
    writeFileSync(
      join(scratchDir, "config.yaml"),
      ['baseUrl: ""', 'apiKey: ""', 'model: ""'].join("\n") + "\n",
      "utf8"
    );
    const userCfgDir = join(fakeHome, ".claude", "claude-reasoning");
    mkdirSync(userCfgDir, { recursive: true });
    writeFileSync(
      join(userCfgDir, "config.yaml"),
      ['baseUrl: "https://user-level.example/v1"', 'apiKey: "sk-user-level-key"', 'model: "user-level-model"'].join("\n") + "\n",
      "utf8"
    );

    const inv = await resolveInvoker();
    const cfg = (inv as HttpInvoker & { config?: { baseUrl?: string; apiKey?: string; model?: string } }).config;
    expect(cfg?.baseUrl).toBe("https://user-level.example/v1");
    expect(cfg?.apiKey).toBe("sk-user-level-key");
    expect(cfg?.model).toBe("user-level-model");
  });

  it("treats empty-string env vars as unset so CR_REASONING_* doesn't shadow config.yaml", async () => {
    // An env var explicitly set to "" must behave as if unset; otherwise
    // `VAR=` in a shell rc file would silently blank the credentials.
    process.env.CR_REASONING_API_KEY = "";
    process.env.CR_REASONING_MODEL = "";
    process.env.CR_REASONING_BASE_URL = "https://env-override.example/v1";
    writeFileSync(
      join(scratchDir, "config.yaml"),
      ['baseUrl: "https://cwd.example/v1"', 'apiKey: "sk-cwd-real"', 'model: "cwd-real-model"'].join("\n") + "\n",
      "utf8"
    );

    const inv = await resolveInvoker();
    const cfg = (inv as HttpInvoker & { config?: { baseUrl?: string; apiKey?: string; model?: string } }).config;
    expect(cfg?.baseUrl).toBe("https://env-override.example/v1");
    expect(cfg?.apiKey).toBe("sk-cwd-real");
    expect(cfg?.model).toBe("cwd-real-model");
  });
});
