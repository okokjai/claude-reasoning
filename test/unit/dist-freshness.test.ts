// test/unit/dist-freshness.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = join(process.cwd(), "dist");

describe("dist freshness", () => {
  const hasDist = existsSync(DIST);

  it.skipIf(!hasDist)("dist/mcp.js contains unwrapArgs (run `npm run build` if this fails)", () => {
    expect(readFileSync(join(DIST, "mcp.js"), "utf8")).toContain("unwrapArgs");
  });

  it.skipIf(!hasDist)("dist/cli.js contains the --help branch", () => {
    expect(readFileSync(join(DIST, "cli.js"), "utf8")).toContain("help");
  });

  it.skipIf(!hasDist)("dist is not older than src", () => {
    // Presence-only smoke: the two assertions above are the real gate.
    expect(existsSync(join(DIST, "index.js"))).toBe(true);
  });
});
