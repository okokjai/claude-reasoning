// src/kernel/prompt-loader.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const OUTPUT_OVERRIDE =
  "--- SYSTEM OVERRIDE: OUTPUT PROTOCOL ---\nRespond with EXACTLY ONE valid JSON object matching the provided schema. No markdown fences, no commentary.";

export class PromptLoader {
  constructor(private readonly promptsDir: string) {}

  load(relPath: string): string {
    return readFileSync(join(this.promptsDir, relPath), "utf8");
  }

  renderStage(relPath: string, vars: Record<string, string>): string {
    const substituted = this.load(relPath).replace(/\{\{(\w+)\}\}/g, (m, key) =>
      key in vars ? vars[key] : m
    );
    return `${substituted}\n\n${OUTPUT_OVERRIDE}`;
  }
}
