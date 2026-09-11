// test/unit/invoker.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { strictParse, SchemaViolationError } from "../../src/kernel/invoker.js";
import { MockLlmInvoker } from "../mocks/mock-invoker.js";

const S = z.object({ answer: z.string() });

describe("strictParse", () => {
  it("parses fenced JSON", () => {
    expect(strictParse('```json\n{"answer":"a"}\n```', S)).toEqual({ answer: "a" });
  });
  it("parses JSON embedded in prose", () => {
    expect(strictParse('Here: {"answer":"a"}', S)).toEqual({ answer: "a" });
  });
  it("tolerates trailing commas (wrapper-format only)", () => {
    expect(strictParse('{"answer":"a",}', S)).toEqual({ answer: "a" });
  });
  it("THROWS SchemaViolationError on schema violation and on non-JSON", () => {
    expect(() => strictParse('{"answer":42}', S)).toThrow(SchemaViolationError);
    expect(() => strictParse("no json here", S)).toThrow(SchemaViolationError);
  });
});

describe("MockLlmInvoker", () => {
  it("returns fixture keyed by user-message substring", async () => {
    const mock = new MockLlmInvoker({ STAGE4: '{"ok":true}' });
    await expect(mock.invoke([{ system: "s", user: "STAGE4 ctx" }])).resolves.toBe('{"ok":true}');
  });
  it("throws when no fixture matches (no silent fallback)", async () => {
    await expect(new MockLlmInvoker({}).invoke([{ system: "s", user: "x" }])).rejects.toThrow();
  });
});
