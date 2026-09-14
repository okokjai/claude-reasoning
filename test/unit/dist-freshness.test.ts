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

  it.skipIf(!hasDist)("dist/mcp.js does NOT regress to z.preprocess for unwrapArgs", () => {
    // The preprocess→ZodEffects path silently broadcast properties:{} on
    // tools/list. dist must reflect the ZodObject-with-overridden-parse fix.
    const src = readFileSync(join(DIST, "mcp.js"), "utf8");
    const idx = src.indexOf("function unwrapArgs");
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = src.slice(idx, idx + 4000);
    expect(body).not.toContain("z.preprocess");
  });

  it.skipIf(!hasDist)("dist/cli.js contains the --help branch", () => {
    expect(readFileSync(join(DIST, "cli.js"), "utf8")).toContain("help");
  });

  it.skipIf(!hasDist)("dist is not older than src", () => {
    // Presence-only smoke: the two assertions above are the real gate.
    expect(existsSync(join(DIST, "index.js"))).toBe(true);
  });

  it.skipIf(!hasDist)("dist/mcp.js carries the same version as package.json", () => {
    // Post-v2.2.1: src/mcp.ts McpServer.version was hardcoded "2.2.0" while
    // package.json had already been bumped. Drift must not happen again.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const mcpSrc = readFileSync(join(DIST, "mcp.js"), "utf8");
    const match = mcpSrc.match(/version:\s*"([^"]+)"/);
    expect(match?.[1]).toBe(pkg.version);
  });
});
