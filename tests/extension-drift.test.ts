import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");

describe("extension drift guard", () => {
  it("synced heuristic block in skill-router.ts matches scripts/router-heuristics.ts semantics", () => {
    const ext = readFileSync(join(CWD, "extensions", "skill-router.ts"), "utf-8");
    const block = /\/\/ ---- begin synced block: router-heuristics ----([\s\S]*?)\/\/ ---- end synced block/.exec(ext);
    expect(block).not.toBeNull();

    // Same constants and regexes must appear verbatim in both files
    const src = readFileSync(join(CWD, "scripts", "router-heuristics.ts"), "utf-8");
    for (const token of [
      "claude-reasoning-deterministic-gate",
      "CONTRAST_RE",
      "OPEN_ENDED_RE",
      "MULTI_PATH_RE",
      "FAILURE_RE",
    ]) {
      const srcLine = src.split("\n").find(l => l.includes(token) && l.includes("="));
      expect(srcLine).toBeDefined();
      expect(block![1]).toContain(token);
      // regex literal must match exactly
      const re = /= *(\/[^/]+\/[a-z]*)/.exec(srcLine!);
      if (re) expect(block![1]).toContain(re[1]);
    }
  });
});
