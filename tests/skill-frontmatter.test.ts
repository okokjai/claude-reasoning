import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
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

  it("frontmatter enforces mandatory trigger wording and core engineering keywords", () => {
    const d = skillDescription();
    expect(d).toMatch(/^Use (?:when|before answering)/i);
    expect(d).toMatch(/\b(?:debug|root-cause|architecture|decision)\b/i);
  });

  it("keeps package.json description byte-identical to SKILL.md (drift guard)", () => {
    const pkg = JSON.parse(
      readFileSync(join(CWD, "package.json"), "utf-8"),
    ) as { description?: string };
    expect(pkg.description).toBe(skillDescription());
  });

  it("keeps host .omp skill-descriptions.db synchronized if present (cache drift guard)", () => {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const dbPath = join(home, ".omp", "agent", "skill-descriptions.db");
    const promptPath = join(home, ".bun", "install", "global", "node_modules",
      "@oh-my-pi", "pi-coding-agent", "src", "prompts", "skills", "compress-description.md");
    if (!existsSync(dbPath) || !existsSync(promptPath)) return;

    const prompt = readFileSync(promptPath, "utf-8");
    const key = new Bun.CryptoHasher("sha256")
      .update(prompt).update("\0").update("claude-reasoning").update("\0")
      .update(skillDescription()).digest("hex");

    const { Database } = require("bun:sqlite");
    const db = new Database(dbPath);
    const row = db.query("SELECT description FROM skill_descriptions WHERE key = ?").get(key) as
      | { description?: string }
      | null;
    db.close();

    expect(row).not.toBeNull();
    expect(row?.description).toBe(skillDescription());
  });

  it("keeps installed .omp and .claude skill directories synchronized if present (install drift guard)", () => {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const pkg = JSON.parse(readFileSync(join(CWD, "package.json"), "utf-8")).version;

    const ompSkillFm = join(home, ".omp", "agent", "skills", "claude-reasoning", "SKILL.md");
    if (existsSync(ompSkillFm)) {
      const v = /^version:\s*(\S+)/m.exec(readFileSync(ompSkillFm, "utf-8"))?.[1];
      expect(v).toBe(pkg);
    }

    const claudeSkillFm = join(home, ".claude", "skills", "claude-reasoning", "SKILL.md");
    if (existsSync(claudeSkillFm)) {
      const v = /^version:\s*(\S+)/m.exec(readFileSync(claudeSkillFm, "utf-8"))?.[1];
      expect(v).toBe(pkg);
    }
  });

  it("keeps all version surfaces aligned across the repository (drift guard)", () => {
    const pkg = JSON.parse(readFileSync(join(CWD, "package.json"), "utf-8")).version;
    const skillFm = /^version:\s*(\S+)/m.exec(readFileSync(join(CWD, "SKILL.md"), "utf-8"))?.[1];
    const skillTitle = /^# claude-reasoning (\S+)/m.exec(readFileSync(join(CWD, "SKILL.md"), "utf-8"))?.[1];
    const readme = /^# claude-reasoning (\S+)/m.exec(readFileSync(join(CWD, "README.md"), "utf-8"))?.[1];
    const thinkHeader = /claude-reasoning (\S+) -/.exec(readFileSync(join(CWD, "scripts", "think.ts"), "utf-8"))?.[1];
    const svgContent = readFileSync(join(CWD, "assets", "architecture-dashboard.svg"), "utf-8");
    const changelogTop = /^## \[(.+?)\]/m.exec(readFileSync(join(CWD, "CHANGELOG.md"), "utf-8"))?.[1];

    expect([skillFm, skillTitle, readme, thinkHeader, changelogTop]).toEqual([pkg, pkg, pkg, pkg, pkg]);
    expect(svgContent).not.toMatch(/>v\d+\.\d+\.\d+<\/text>/);
  });
});

describe("SKILL.md: Path B load contract", () => {
  const text = () => readFileSync(join(CWD, "SKILL.md"), "utf-8");

  it("declares a Step -1 load contract listing the four reference files", () => {
    const t = text();
    expect(t).toContain("## Step -1: Load Contract");
    for (const ref of [
      "references/critical-lenses.md",
      "references/source-tiers.md",
      "references/hallucination-gates.md",
      "references/conclusion-card.md",
    ]) {
      expect(t).toContain(ref);
    }
  });

  it("gates the first Path B thought on reading the contract", () => {
    expect(text()).toMatch(/Do not send the first Path B thought until.*Step -1/i);
  });
});

describe("State file schema v3 documentation", () => {
  it("documents historyIndex / checkedAtHistoryIndex in SKILL.md", () => {
    const t = readFileSync(join(CWD, "SKILL.md"), "utf-8");
    expect(t).toContain("historyIndex");
    expect(t).toContain("checkedAtHistoryIndex");
  });

  it("documents historyIndex / checkedAtHistoryIndex in README.md", () => {
    const t = readFileSync(join(CWD, "README.md"), "utf-8");
    expect(t).toContain("historyIndex");
    expect(t).toContain("checkedAtHistoryIndex");
  });
});

describe("SKILL.md: clock calibration and claim dates", () => {
  it("documents clock calibration (Step -2) and the --claimDate flag", () => {
    const t = readFileSync(join(CWD, "SKILL.md"), "utf-8");
    expect(t).toMatch(/## Step -2: Calibrate clock/);
    expect(t).toMatch(/`today`[\s\S]*?only[\s\S]*?date source/i);
    expect(t).toMatch(/\| `--claimDate` \|/);
  });
});

