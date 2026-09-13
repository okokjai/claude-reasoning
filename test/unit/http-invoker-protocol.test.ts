// test/unit/http-invoker-protocol.test.ts
import { describe, it, expect } from "vitest";
import { buildRequest, extractReply } from "../../src/adapters/http-invoker.js";

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
