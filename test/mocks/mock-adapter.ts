// test/mocks/mock-adapter.ts
// In-memory ToolAdapter for offline integration tests. Returns one plausible
// result per search call — never touches the network. The `url` is the literal
// anchor "src-0" so fixture conclusions citing [src-0] pass the gate's
// sourceCheck against the evidence_matrix this adapter produces.
import type { ToolAdapter, ToolResult } from "../../src/kernel/tool-adapter.js";

export function mockToolAdapter(): ToolAdapter {
  return {
    async search(query: string): Promise<ToolResult[]> {
      return [
        {
          url: "src-0",
          title: "AlphaWorks is good",
          snippet: `evidence for: ${query}`,
        },
      ];
    },
  };
}
