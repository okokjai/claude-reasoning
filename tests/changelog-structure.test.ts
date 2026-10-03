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
