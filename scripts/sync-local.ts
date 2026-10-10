#!/usr/bin/env bun
/**
 * scripts/sync-local.ts
 *
 * Synchronizes the current workspace state to all local host skill directories
 * and the host .omp SQLite descriptions database.
 *
 * Targets:
 * 1. ~/.claude/skills/claude-reasoning
 * 2. ~/.omp/agent/skills/claude-reasoning
 * 3. ~/.omp/agent/skill-descriptions.db (key: 9a1cc97e...)
 */

import { cpSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const HOME = process.env.USERPROFILE || process.env.HOME || "";

if (!HOME) {
  console.error("FAIL: Unable to determine HOME / USERPROFILE directory.");
  process.exit(1);
}

const targets = [
  join(HOME, ".claude", "skills", "claude-reasoning"),
  join(HOME, ".omp", "agent", "skills", "claude-reasoning"),
];

console.log("=== Syncing claude-reasoning to local host targets ===");

for (const target of targets) {
  if (existsSync(target)) {
    try {
      rmSync(target, { recursive: true, force: true });
      cpSync(CWD, target, { recursive: true, filter: (src) => !src.includes(".git") && !src.includes("node_modules") });
      console.log(`[OK] Synced files -> ${target}`);
    } catch (err) {
      console.error(`[ERR] Failed syncing -> ${target}:`, err);
    }
  } else {
    console.log(`[SKIP] Target does not exist -> ${target}`);
  }
}

// Sync SQLite database cache if present
const dbPath = join(HOME, ".omp", "agent", "skill-descriptions.db");
if (existsSync(dbPath)) {
  try {
    const { Database } = require("bun:sqlite");
    const db = new Database(dbPath);
    const skillMd = readFileSync(join(CWD, "SKILL.md"), "utf-8");
    const m = /^description:\s*"(.*)"$/m.exec(skillMd);
    if (m && m[1]) {
      const desc = m[1];
      db.query(
        "UPDATE skill_descriptions SET description = ? WHERE key = '9a1cc97e6681acc302dd40c332bf76c2b39d34ace2e7a6fe3ba920b2687994bf'"
      ).run(desc);
      console.log(`[OK] Updated SQLite description cache -> ${dbPath}`);
    }
  } catch (err) {
    console.error(`[ERR] Failed updating SQLite cache:`, err);
  }
}

console.log("=== Local synchronization complete ===");
