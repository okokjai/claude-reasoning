import { describe, it, expect, beforeEach } from "bun:test";
import { execFileSync } from "child_process";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const STATE = join(ROOT, "tests", `.think_state.round7-${process.pid}.json`);
const ENV = { ...process.env, THINK_STATE_FILE: STATE };

function run(args: string[]): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("bun", ["scripts/think.ts", ...args], { cwd: ROOT, env: ENV, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: unknown; stderr?: unknown };
    return { code: err.status ?? 1, out: err.stdout?.toString() ?? "", err: err.stderr?.toString() ?? "" };
  }
}

describe("Task 1: Lens catalog and --listLenses", () => {
  beforeEach(() => {
    if (existsSync(STATE)) unlinkSync(STATE);
  });

  it("--listLenses returns catalog with 11 lenses", () => {
    const r = run(["--listLenses"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.lenses).toHaveLength(11);
    expect(j.lenses.map((l: { id: string }) => l.id)).toContain("lens-6");
  });

  it("--listLenses --kind decision puts core lenses first", () => {
    const r = run(["--listLenses", "--kind", "decision"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    // decision core: 6, 10, 3
    expect(j.lenses[0].id).toBe("lens-6");
    expect(j.lenses[1].id).toBe("lens-10");
    expect(j.lenses[2].id).toBe("lens-3");
  });

  it("--listLenses --kind diagnostic puts core lenses first", () => {
    const r = run(["--listLenses", "--kind", "diagnostic"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    // diagnostic core: 8, 1
    expect(j.lenses[0].id).toBe("lens-8");
    expect(j.lenses[1].id).toBe("lens-1");
  });

  it("--listLenses fails with invalid --kind", () => {
    const r = run(["--listLenses", "--kind", "invalid-kind"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toContain("Invalid --kind");
  });

  it("lenses have required fields: id, name, type, kinds, requiredArtifact", () => {
    const r = run(["--listLenses"]);
    const j = JSON.parse(r.out);
    for (const l of j.lenses) {
      expect(typeof l.id).toBe("string");
      expect(typeof l.name).toBe("string");
      expect(["computed", "state-delta", "prose"]).toContain(l.type);
      expect(Array.isArray(l.kinds)).toBe(true);
      expect(typeof l.requiredArtifact).toBe("string");
    }
  });
});

describe("Task 2: --kind flag on Path B", () => {
  beforeEach(() => {
    if (existsSync(STATE)) unlinkSync(STATE);
  });

  it("Path A rejects --kind with exit 1", () => {
    const r = run(["--mode", "path-a", "--kind", "decision", "--thought", "test", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("Path A");
  });

  it("Path B accepts --kind on first thought, stores in state", () => {
    const r = run(["--mode", "path-b", "--kind", "decision", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    expect(r.code).toBe(0);
    const s = run(["--status"]);
    expect(s.code).toBe(0);
    const j = JSON.parse(s.out);
    expect(j.kind).toBe("decision");
  });

  it("--kind immutable after first thought", () => {
    const r1 = run(["--mode", "path-b", "--kind", "decision", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    expect(r1.code).toBe(0);
    const r2 = run(["--kind", "diagnostic", "--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    expect(r2.code).toBe(1);
    expect(r2.err).toContain("immutable");
  });

  it("Path B rejects invalid --kind on thought", () => {
    const r = run(["--mode", "path-b", "--kind", "invalid-kind", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("Invalid --kind");
  });

  it("--kind cannot be declared on thought 2 if omitted on thought 1", () => {
    const r1 = run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    expect(r1.code).toBe(0);
    const r2 = run(["--kind", "decision", "--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    expect(r2.code).toBe(1);
  });
});
