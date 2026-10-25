import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");

const canonicalBody = (src: string): string =>
  src
    .replace(/^\/\*\*[\s\S]*?\*\//, "")
    .replace(/export interface /g, "interface ")
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")
    .trim();

describe("extension drift guard", () => {
  it("synced heuristic block in skill-router.ts matches scripts/router-heuristics.ts verbatim", () => {
    const ext = readFileSync(join(CWD, "extensions", "skill-router.ts"), "utf-8");
    const block = /\/\/ ---- begin synced block: router-heuristics ----([\s\S]*?)\/\/ ---- end synced block/.exec(ext);
    expect(block).not.toBeNull();

    // The synced block must equal the canonical module body (minus `export`
    // keywords), so any behavior change to one surface fails here until synced.
    const src = readFileSync(join(CWD, "scripts", "router-heuristics.ts"), "utf-8");
    expect(block![1].trim()).toBe(canonicalBody(src));
  });

  it("keeps the removed heuristic symbols out of both surfaces", () => {
    for (const f of ["scripts/router-heuristics.ts", "extensions/skill-router.ts"]) {
      const t = readFileSync(join(CWD, f), "utf-8");
      for (const gone of ["CONTRAST_RE", "OPEN_ENDED_RE", "MULTI_PATH_RE", "FAILURE_RE", "structuralScore", "countFailures", "findSkillLoadIndex", "scoreThreshold", "failureThreshold"]) {
        expect(t).not.toContain(gone);
      }
    }
  });
});
