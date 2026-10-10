import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { computeKey, syncDb } from "../scripts/sync-local";

const PROMPT = "Compress into one routing hint {{name}} {{description}}";
const NAME = "claude-reasoning";
const DESC = "Use when or before answering test description.";

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), "sync-test-"));
  const dbPath = join(dir, "s.db");
  const { Database } = require("bun:sqlite");
  const db = new Database(dbPath);
  db.run("CREATE TABLE skill_descriptions (key TEXT PRIMARY KEY, description TEXT NOT NULL)");
  db.close();
  return { dir, dbPath };
}

describe("computeKey", () => {
  it("matches sha256(prompt + NUL + name + NUL + desc)", () => {
    const expected = new Bun.CryptoHasher("sha256")
      .update(PROMPT).update("\0").update(NAME).update("\0").update(DESC).digest("hex");
    expect(computeKey(PROMPT, NAME, DESC)).toBe(expected);
  });
});

describe("syncDb", () => {
  it("inserts the description under the computed key", () => {
    const { dir, dbPath } = tmpDb();
    const state = join(dir, ".state.json");
    syncDb(dbPath, PROMPT, NAME, DESC, state);
    const { Database } = require("bun:sqlite");
    const db = new Database(dbPath);
    const row = db
      .query("SELECT description FROM skill_descriptions WHERE key = ?")
      .get(computeKey(PROMPT, NAME, DESC)) as { description: string } | null;
    db.close();
    expect(row?.description).toBe(DESC);
    rmSync(dir, { recursive: true });
  });

  it("removes keys it previously wrote that no longer match (orphan GC)", () => {
    const { dir, dbPath } = tmpDb();
    const state = join(dir, ".state.json");
    const r1 = syncDb(dbPath, PROMPT, NAME, "old description", state);
    const r2 = syncDb(dbPath, PROMPT, NAME, DESC, state);
    expect(r2.removed).toContain(r1.key);
    const { Database } = require("bun:sqlite");
    const db = new Database(dbPath);
    const stale = db
      .query("SELECT key FROM skill_descriptions WHERE key = ?")
      .get(r1.key);
    db.close();
    expect(stale).toBeNull();
    rmSync(dir, { recursive: true });
  });

  it("never deletes foreign rows", () => {
    const { dir, dbPath } = tmpDb();
    const { Database } = require("bun:sqlite");
    const dbInit = new Database(dbPath);
    dbInit.run(
      "INSERT INTO skill_descriptions (key, description) VALUES ('foreign-key', 'foreign')"
    );
    dbInit.close();
    const state = join(dir, ".state.json");
    syncDb(dbPath, PROMPT, NAME, DESC, state);
    const dbCheck = new Database(dbPath);
    const foreign = dbCheck
      .query("SELECT key FROM skill_descriptions WHERE key = 'foreign-key'").get();
    dbCheck.close();
    expect(foreign).not.toBeNull();
    rmSync(dir, { recursive: true });
  });
});
