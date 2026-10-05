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

describe("--claimDate", () => {
  beforeEach(() => { if (existsSync(STATE)) unlinkSync(STATE); });

  function seed(): void {
    run(["--mode","path-b","--registerHypothesis","h1","--falsification","f1"]);
    run(["--registerClaim","c1","--supports","hyp-1"]);
  }

  it("requires --verifyClaim", () => {
    seed();
    const r = run(["--claimDate","2025-01-01"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/claimDate requires --verifyClaim/i);
  });

  it("rejects a non-ISO date", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","not-a-date"]);
    expect(r.code).toBe(1);
  });

  it("rejects a future date", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","2999-01-01"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/future|after|today/i);
  });

  it("rejects a count mismatch with --claimSource", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","2025-01-01","--claimDate","2025-02-01"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/one --claimDate per --claimSource|per --claimSource/i);
  });

  it("persists claimDates aligned to sources", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","2025-06-01"]);
    expect(r.code).toBe(0);
    const s = JSON.parse(readFileSync(STATE,"utf-8"));
    expect(s.claims["claim-1"].claimDates).toEqual(["2025-06-01"]);
  });
});

describe("Reasoning trace", () => {
  beforeEach(() => { if (existsSync(STATE)) unlinkSync(STATE); });

  it("--export emits hypotheses/lenses/criteria tables", () => {
    run(["--mode","path-b","--registerHypothesis","h1","--falsification","f1"]);
    run(["--registerHypothesis","h2","--falsification","f2"]);
    run(["--resolveHypothesis","hyp-1","--hypothesisStatus","selected","--hypothesisNotes","why1","--falsificationResult","held"]);
    run(["--resolveHypothesis","hyp-2","--hypothesisStatus","rejected","--hypothesisNotes","why2","--falsificationResult","broke"]);
    run(["--recordLens","--lens","adversarial","--finding","residual-u"]);
    run(["--addCriterion","crit-x"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/## Reasoning Trace/);
    expect(r.out).toMatch(/### Hypotheses\n\| id \| statement \|/);
    expect(r.out).toMatch(/\| hyp-1 \| h1 \|/);
    expect(r.out).toMatch(/\| adversarial \| residual-u \|/);
    expect(r.out).toMatch(/\| crit-1 \| crit-x \|/);
  });

  it("escapes a pipe inside user text so the table does not break", () => {
    run(["--mode","path-b","--registerHypothesis","a | b","--falsification","f"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("a \\| b");
  });

  it("warns when a verified claim's newest source is older than 180 days", () => {
    // Deferred Task-2 Minor: the freshness WARN exists in buildLintReport but
    // nothing exercised it through --export.
    run(["--mode","path-b","--registerHypothesis","h1","--falsification","falsification long enough here"]);
    run(["--registerClaim","c1","--supports","hyp-1"]);
    run(["--verifyClaim","claim-1","--claimStatus","verified",
      "--claimSource","https://a.example/x","--claimSource","https://b.example/y",
      "--claimTier","1","--claimTier","1",
      "--claimQuote","a verbatim quote from the source","--negativeQuery","nq","--negativeFinding","none found",
      "--claimDate","2025-01-01","--claimDate","2025-01-01"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/newest source.*>180d|180/);
  });
});
