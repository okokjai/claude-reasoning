// test/unit/http-invoker-protocol.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRequest, extractReply, HttpInvoker } from "../../src/adapters/http-invoker.js";
import { resolveInvoker } from "../../src/adapters/invoker-resolver.js";

const msgs = [{ system: "SYS", user: "USR" }];

describe("buildRequest", () => {
  it("targets /v1/messages with Anthropic-shaped body", () => {
    const { url, init } = buildRequest({ baseUrl: "https://api.anthropic.com", protocol: "anthropic", model: "m", apiKey: "k" }, msgs);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("SYS");
    expect(body.messages).toEqual([{ role: "user", content: "USR" }]);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.response_format).toBeUndefined();
  });

  it("targets /chat/completions with OpenAI-shaped body", () => {
    const { url, init } = buildRequest({ baseUrl: "https://api.openai.com/v1", protocol: "openai", model: "m", apiKey: "k" }, msgs);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: "system", content: "SYS" }, { role: "user", content: "USR" }]);
    expect(body.max_tokens).toBeUndefined();
  });

  it("defaults to the OpenAI protocol when unset", () => {
    const { url } = buildRequest({ baseUrl: "https://x/v1", model: "m" }, msgs);
    expect(url).toBe("https://x/v1/chat/completions");
  });
});

describe("extractReply", () => {
  it("reads Anthropic content[0].text", () => {
    expect(extractReply({ content: [{ type: "text", text: "A" }] }, "anthropic")).toBe("A");
  });
  it("reads OpenAI choices[0].message.content", () => {
    expect(extractReply({ choices: [{ message: { content: "B" } }] }, "openai")).toBe("B");
  });
  it("returns empty string on unknown shape", () => {
    expect(extractReply({ nope: true }, "openai")).toBe("");
  });
});

describe("resolveInvoker protocol resolution", () => {
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

  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function getProtocol(invoker: unknown): string | undefined {
    return (invoker as { config?: { protocol?: string } })?.config?.protocol;
  }

  it("selects anthropic when ANTHROPIC_BASE_URL only is set", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://anthropic.example.com";
    const invoker = await resolveInvoker();
    expect(getProtocol(invoker)).toBe("anthropic");
  });

  it("selects anthropic when ANTHROPIC_BASE_URL and OPENAI_BASE_URL are both set", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://anthropic.example.com";
    process.env.OPENAI_BASE_URL = "https://openai.example.com";
    const invoker = await resolveInvoker();
    expect(getProtocol(invoker)).toBe("anthropic");
  });

  it("selects openai when CR_REASONING_BASE_URL is set", async () => {
    process.env.CR_REASONING_BASE_URL = "https://custom.example.com";
    process.env.ANTHROPIC_BASE_URL = "https://anthropic.example.com";
    const invoker = await resolveInvoker();
    expect(getProtocol(invoker)).toBe("openai");
  });

  it("selects openai when OPENAI_BASE_URL only is set", async () => {
    process.env.OPENAI_BASE_URL = "https://openai.example.com";
    const invoker = await resolveInvoker();
    expect(getProtocol(invoker)).toBe("openai");
  });
});
