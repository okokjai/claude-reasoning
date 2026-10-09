import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");

/**
 * CHANGELOG section structure: within a single `## [x.y.z]` version block, each
 * `### Heading` must appear at most once. A duplicated heading is a merge
 * remnant — content split across two sections the reader will not connect.
 */
function versionSections(): Array<{ version: string; headings: string[] }> {
  const lines = readFileSync(join(CWD, "CHANGELOG.md"), "utf-8").split(/\r?\n/);
  const sections: Array<{ version: string; headings: string[] }> = [];
  let current: { version: string; headings: string[] } | null = null;
  for (const line of lines) {
    const version = /^## \[(.+?)\]/.exec(line);
    if (version) {
      current = { version: version[1], headings: [] };
      sections.push(current);
      continue;
    }
    const heading = /^### (.+)$/.exec(line);
    if (heading && current) current.headings.push(heading[1].trim());
  }
  return sections;
}

describe("CHANGELOG.md structure", () => {
  it("has no duplicate ### heading within a version section", () => {
    const dupes: string[] = [];
    for (const { version, headings } of versionSections()) {
      const seen = new Set<string>();
      for (const h of headings) {
        if (seen.has(h)) dupes.push(`${version}: ### ${h}`);
        seen.add(h);
      }
    }
    expect(dupes).toEqual([]);
  });
  it("documents repository-wide version surface drift guard in latest CHANGELOG version", () => {
    const changelog = readFileSync(join(CWD, "CHANGELOG.md"), "utf-8");
    const latestSection = changelog.split(/^## \[/m)[1] ?? "";
    expect(latestSection).toContain("Repository-wide version surface drift guard");
  });
  it("does not hard-code numeric test-file counts in README.md", () => {
    const readme = readFileSync(join(CWD, "README.md"), "utf-8");
    expect(readme).not.toMatch(/across \d+ files/);
    expect(readme).toContain("runs the comprehensive regression suite.");
  });
});

/**
 * The gate count is a contract: adding a gate means updating every site that
 * names the range. A stale `6-10` in a comment or doc is a doc/code mismatch,
 * not a cosmetic one — it tells the reader the new gate does not exist.
 */
describe("gate-range references stay in sync with the GATES switchboard", () => {

  it("derives the gate count from the switchboard itself", () => {
    // Derive switchboard keys count by splitting the capture block by line.
    const rawGates = /\bconst GATES = \{([^}]*)\}/.exec(readFileSync(join(CWD, "scripts", "think.ts"), "utf-8"))?.[1] ?? "";
    const switchboardCount = rawGates.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//") && l.includes(":")).length;
    const TOTAL_GATES = 5 + switchboardCount;
    expect(TOTAL_GATES).toBe(11);
  });

  it.each(["scripts/think.ts", "SKILL.md", "README.md"])("%s has no stale gate range", (file) => {
    const text = readFileSync(join(CWD, file), "utf-8");
    const stale = text.match(/[Gg]ates? 6[-–]10([^0-9]|$)/g) ?? [];
    expect(stale).toEqual([]);
  });
});
