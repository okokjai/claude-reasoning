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
});

/**
 * The gate count is a contract: adding a gate means updating every site that
 * names the range. A stale `6-10` in a comment or doc is a doc/code mismatch,
 * not a cosmetic one — it tells the reader the new gate does not exist.
 */
describe("gate-range references stay in sync with the GATES switchboard", () => {
  const GATE_COUNT = Object.keys(
    /\bconst GATES = \{([^}]*)\}/.exec(readFileSync(join(CWD, "scripts", "think.ts"), "utf-8"))?.[1] ?? "",
  ).filter(k => k.trim().length > 0).length;

  it("derives the gate count from the switchboard itself", () => {
    // Guard against the derivation silently becoming 0 (regex drift).
    expect(GATE_COUNT).toBeGreaterThanOrEqual(11);
  });

  it.each(["scripts/think.ts", "SKILL.md", "README.md"])("%s has no stale gate range", (file) => {
    const text = readFileSync(join(CWD, file), "utf-8");
    const stale = text.match(/[Gg]ates? 6[-–]10([^0-9]|$)/g) ?? [];
    expect(stale).toEqual([]);
  });
});
