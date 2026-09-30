import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");

/**
 * Selector window: the harness truncates each skill's `description` to
 * ~100 chars when rendering the skills list in the system prompt. The
 * use-condition ("Use when …") must appear inside that window, otherwise
 * the selector sees only a self-description and never invokes the skill.
 */
const SELECTOR_WINDOW = 100;

function skillDescription(): string {
  const text = readFileSync(join(CWD, "SKILL.md"), "utf-8");
  const m = /^description:\s*"(.*)"$/m.exec(text);
  if (!m) throw new Error("SKILL.md: missing `description:` frontmatter line");
  return m[1];
}

describe("SKILL.md description: selector visibility", () => {
  it("places the 'Use when' trigger inside the ~100-char selector window", () => {
    const d = skillDescription();
    expect(d.slice(0, SELECTOR_WINDOW)).toContain("Use when");
  });

  it("keeps package.json description byte-identical to SKILL.md (drift guard)", () => {
    const pkg = JSON.parse(
      readFileSync(join(CWD, "package.json"), "utf-8"),
    ) as { description?: string };
    expect(pkg.description).toBe(skillDescription());
  });
});
