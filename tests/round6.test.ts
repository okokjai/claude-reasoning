import { describe, it, expect, beforeEach } from "bun:test";
import { execFileSync } from "child_process";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const STATE = join(ROOT, "tests", `.think_state.round6-${process.pid}.json`);
const ENV = { ...process.env, THINK_STATE_FILE: STATE };

function run(args: string[]): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("bun", ["scripts/think.ts", ...args], { cwd: ROOT, env: ENV, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e: unknown) {
    // execFileSync's thrown error shape; verified fields only, never a bare any.
    const err = e as { status?: number; stdout?: unknown; stderr?: unknown };
    return { code: err.status ?? 1, out: err.stdout?.toString() ?? "", err: err.stderr?.toString() ?? "" };
  }
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("Session clock", () => {
  beforeEach(() => { if (existsSync(STATE)) unlinkSync(STATE); });

  it("--status on a fresh session reports today's date", () => {
    const r = run(["--status"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.today).toMatch(ISO);
  });

  it("--reset reports today's date", () => {
    const r = run(["--reset"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).today).toMatch(ISO);
  });

  it("first thought sets startedAt; terminating thought sets endedAt", () => {
    run(["--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true", "--mode", "path-a"]);
    run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    const t = run(["--thought", "t3", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(t.code).toBe(0);
    const s = JSON.parse(readFileSync(STATE, "utf-8"));
    expect(s.startedAt).toMatch(ISO);
    expect(s.endedAt).toMatch(ISO);
  });
});
