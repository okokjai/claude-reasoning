import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "C:/tmp/claude-reasoning-1.2.0";
const DST = "C:/tmp/DONE/claude-reasoning/prompts";
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

describe("Zero Migration prompt assets", () => {
  it("all 22 prompt files are byte-identical to v1.2.0 source", () => {
    const files = walk(DST).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(22);
    for (const dst of files) {
      const src = dst.replace(DST, SRC);
      expect(sha(dst), dst).toBe(sha(src));
    }
  });
});
