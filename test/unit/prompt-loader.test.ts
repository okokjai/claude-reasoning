// test/unit/prompt-loader.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PromptLoader, OUTPUT_OVERRIDE } from "../../src/kernel/prompt-loader.js";

describe("PromptLoader", () => {
  const loader = new PromptLoader("C:/tmp/DONE/cr-reasoning-v2/prompts");

  it("loads raw stage file verbatim", () => {
    expect(loader.load("stages/stage-4-synthesis.md")).toContain("Stage 4");
  });

  it("substitutes {{vars}} and appends OUTPUT_OVERRIDE exactly once, at the end", () => {
    const dir = mkdtempSync(join(tmpdir(), "pl-"));
    writeFileSync(join(dir, "tpl.md"), "Hello {{name}} bye");
    const out = new PromptLoader(dir).renderStage("tpl.md", { name: "VAL_123" });
    rmSync(dir, { recursive: true, force: true });
    expect(out).toContain("VAL_123");
    expect(out).not.toContain("{{name}}");
    expect(out.split(OUTPUT_OVERRIDE).length - 1).toBe(1);
    expect(out.trimEnd().endsWith(OUTPUT_OVERRIDE)).toBe(true);
  });

  it("throws on missing file", () => {
    expect(() => loader.load("stages/stage-99-nope.md")).toThrow();
  });
});
