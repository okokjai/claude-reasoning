// test/fixtures/offline-tool-adapter.mjs
// Offline ToolAdapter for entry-point tests. cli.ts/mcp.ts load it when
// CR_REASONING_TOOL_MODULE is set — no network, no credentials. Returns one
// result per search whose `url` is the literal anchor "src-0", matching the
// [src-0] citations in test/fixtures/happy-path.tsv so the Stage 5.5 source
// check passes against honest Stage 3 evidence.
export function createToolAdapter() {
  return {
    async search(query) {
      return [
        {
          url: "src-0",
          title: "AlphaWorks is good",
          snippet: `offline fixture evidence for: ${query}`,
        },
      ];
    },
  };
}
