#!/usr/bin/env bun
/**
 * scripts/sync-local.ts
 *
 * 1. Syncs this repo to local host skill dirs (~/.claude/skills, ~/.omp/agent/skills).
 * 2. Writes the full SKILL.md description into ~/.omp/agent/skill-descriptions.db
 *    under the runtime-computed key sha256(compressPrompt + NUL + name + NUL + desc),
 *    bypassing the never-running smol-model compressor. Orphan rows previously
 *    written by this script are GC'd via scripts/.sync-state.json.
 * 3. Deploys extensions/skill-router.ts to ~/.omp/agent/extensions/.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const STATE_FILE = join(CWD, "scripts", ".sync-state.json");
const PROMPT_TEMPLATE_PATH = join(
  HOME, ".bun", "install", "global", "node_modules",
  "@oh-my-pi", "pi-coding-agent", "src", "prompts", "skills", "compress-description.md",
);

export function computeKey(promptTemplate: string, name: string, description: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(promptTemplate).update("\0").update(name).update("\0").update(description)
    .digest("hex");
}

function skillFrontmatter(): { name: string; description: string } {
  const md = readFileSync(join(CWD, "SKILL.md"), "utf-8");
  const name = /^name:\s*(.+)$/m.exec(md)?.[1]?.trim();
  const description = /^description:\s*"(.*)"$/m.exec(md)?.[1];
  if (!name || !description) throw new Error("SKILL.md: missing name/description frontmatter");
  return { name, description };
}

interface SyncState { writtenKeys: string[] }

function readState(stateFile: string = STATE_FILE): SyncState {
  try { return JSON.parse(readFileSync(stateFile, "utf-8")); }
  catch { return { writtenKeys: [] }; }
}

export function syncDb(
  dbPath: string,
  promptTemplate: string,
  name: string,
  description: string,
  stateFile: string = STATE_FILE,
): { key: string; removed: string[] } {
  const { Database } = require("bun:sqlite");
  const key = computeKey(promptTemplate, name, description);
  const state = readState(stateFile);
  const removed: string[] = [];

  const db = new Database(dbPath);
  try {
    db.run("INSERT OR REPLACE INTO skill_descriptions (key, description) VALUES (?, ?)", [key, description]);
    for (const oldKey of state.writtenKeys) {
      if (oldKey === key) continue;
      db.run("DELETE FROM skill_descriptions WHERE key = ?", [oldKey]);
      removed.push(oldKey);
    }
  } finally {
    db.close();
  }
  writeFileSync(stateFile, JSON.stringify({ writtenKeys: [key] }, null, 2));
  return { key, removed };
}

if (!HOME) {
  console.error("FAIL: Unable to determine HOME / USERPROFILE directory.");
  process.exit(1);
}

console.log("=== Syncing claude-reasoning to local host targets ===");

// 1. Skill directories
const targets = [
  join(HOME, ".claude", "skills", "claude-reasoning"),
  join(HOME, ".omp", "agent", "skills", "claude-reasoning"),
];
for (const target of targets) {
  if (!existsSync(target)) { console.log(`[SKIP] ${target}`); continue; }
  try {
    rmSync(target, { recursive: true, force: true });
    cpSync(CWD, target, { recursive: true, filter: s => !s.includes(".git") && !s.includes("node_modules") });
    console.log(`[OK] Synced -> ${target}`);
  } catch (err) { console.error(`[ERR] ${target}:`, err); }
}

// 2. skill-descriptions.db under the real runtime key
const dbPath = join(HOME, ".omp", "agent", "skill-descriptions.db");
if (existsSync(dbPath) && existsSync(PROMPT_TEMPLATE_PATH)) {
  try {
    const prompt = readFileSync(PROMPT_TEMPLATE_PATH, "utf-8");
    const { name, description } = skillFrontmatter();
    const { key, removed } = syncDb(dbPath, prompt, name, description);
    console.log(`[OK] DB updated key=${key.slice(0, 16)}… removed=${removed.length} orphan(s)`);
  } catch (err) { console.error("[ERR] DB sync failed:", err); }
} else {
  console.log("[SKIP] DB or prompt template missing — never writing under a guessed key");
}

// 3. Deploy router extension
const extSrc = join(CWD, "extensions", "skill-router.ts");
const extDstDir = join(HOME, ".omp", "agent", "extensions");
if (existsSync(extSrc)) {
  mkdirSync(extDstDir, { recursive: true });
  copyFileSync(extSrc, join(extDstDir, "skill-router.ts"));
  console.log(`[OK] Deployed extension -> ${join(extDstDir, "skill-router.ts")}`);
}

console.log("=== Local synchronization complete ===");
