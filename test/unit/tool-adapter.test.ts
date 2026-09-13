// test/unit/tool-adapter.test.ts
import { describe, it, expect } from "vitest";
import type { ToolAdapter, ToolResult } from "../../src/kernel/tool-adapter.js";

describe("ToolAdapter contract", () => {
  it("is satisfiable by a plain object and returns ToolResult[]", async () => {
    const adapter: ToolAdapter = {
      search: async (query: string): Promise<ToolResult[]> => [
        { url: `https://example.com/${query}`, title: "t", snippet: "s" },
      ],
    };
    const results = await adapter.search("probe");
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/probe");
  });

  it("permits an empty result set", async () => {
    const adapter: ToolAdapter = { search: async () => [] };
    await expect(adapter.search("nothing")).resolves.toEqual([]);
  });
});
