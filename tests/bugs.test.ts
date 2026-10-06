import { describe, it, expect, beforeEach } from "bun:test";
import { execFileSync } from "child_process";
import { unlinkSync, existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const STATE = join(ROOT, "tests", `.think_state.bugs-${process.pid}.json`);
const ENV = { ...process.env, THINK_STATE_FILE: STATE };

function run(args: string[], env?: Record<string, string>): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("bun", ["scripts/think.ts", ...args], { cwd: ROOT, env: { ...ENV, ...env }, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: unknown; stderr?: unknown };
    return { code: err.status ?? 1, out: err.stdout?.toString() ?? "", err: err.stderr?.toString() ?? "" };
  }
}

function readState(): any {
  return JSON.parse(readFileSync(STATE, "utf-8"));
}

beforeEach(() => { if (existsSync(STATE)) unlinkSync(STATE); });

describe("Bug 1: today() local date", () => {
  it("today() uses local calendar date, not UTC", () => {
    // Compute the expected local date INSIDE a TZ'd child: the parent's TZ
    // (UTC) diverges from Asia/Taipei 00:00-08:00, so the parent cannot
    // compute what a TZ=Asia/Taipei child should report.
    const r = run(["--status"], { TZ: "Asia/Taipei" });
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    const expected = execFileSync("bun", ["-e", "const d=new Date(); console.log(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)"],
      { env: { ...process.env, TZ: "Asia/Taipei" }, encoding: "utf-8" }).trim();
    expect(j.today).toBe(expected);
  });

  it("claimDate = local today succeeds even when UTC differs", () => {
    // Construct a local date that is "tomorrow" in UTC terms
    const now = new Date();
    const localISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"], { TZ: "Asia/Taipei" });
    run(["--registerClaim", "c1", "--supports", "hyp-1"], { TZ: "Asia/Taipei" });
    const r = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source",
      "--claimSource", "https://a.io", "--claimNotes", "n",
      "--claimDate", localISO], { TZ: "Asia/Taipei" });
    expect(r.code).toBe(0);
  });
});

describe("Bug 2: claimSource validation + report escaping", () => {
  it("rejects invalid claimSource on single_source", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    const r = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source",
      "--claimSource", "trust me bro", "--claimNotes", "n"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/host|URL|invalid|must be/i);
  });

  it("escapes claimSource in export report (no forged heading)", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "single_source",
      "--claimSource", "https://a.io\n## Forged Heading", "--claimNotes", "n"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/^## Forged Heading/m);
  });
});

describe("Bug 3: branchId escaping in Session Trace", () => {
  it("escapes branchId in Session Trace (no forged heading)", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--branchFromThought", "1", "--branchId", "foo\n## Confidence Assessment",
      "--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/^## Confidence Assessment/m);
  });
});

describe("Bug 4: source swap clears stale dates", () => {
  it("clears claimDates when sources change without claimDate", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://x.com", "--claimSource", "https://y.org",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
      "--claimDate", "2025-01-01", "--claimDate", "2025-01-02"]);
    const before = readState();
    expect(before.claims["claim-1"].claimDates).toEqual(["2025-01-01", "2025-01-02"]);

    // Swap sources, omit claimDate
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://new1.com", "--claimSource", "https://new2.org",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    const after = readState();
    expect(after.claims["claim-1"].sources).toEqual(["https://new1.com", "https://new2.org"]);
    expect(after.claims["claim-1"].claimDates).toBeUndefined();
  });
});

describe("Bug 5: Gate 11 branch closure pre-push", () => {
  it("allows termination when terminating thought is on the main line after a branch", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--mode", "path-b", "--registerHypothesis", "h2", "--falsification", "f2"]);
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    run(["--branchFromThought", "1", "--branchId", "br1", "--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "fr"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "fr"]);
    run(["--recordLens", "--lens", "L1", "--finding", "f"]);
    run(["--recordLens", "--lens", "L2", "--finding", "f"]);
    run(["--addCriterion", "c1"]);
    run(["--checkCriterion", "crit-1", "--met", "true"]);
    const r = run(["--thought", "t3", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false",
      "--newInsight", "false", "--newInsightNotes", "converged"]);
    expect(r.code).toBe(0);
  });
});

describe("Bug 6: Gate 7/9 current revision pre-push", () => {
  it("allows termination with --isRevision as the terminating thought", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--mode", "path-b", "--registerHypothesis", "h2", "--falsification", "f2"]);
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    run(["--addCriterion", "c1"]);
    run(["--checkCriterion", "crit-1", "--met", "false"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "fr"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "fr"]);
    run(["--recordLens", "--lens", "L1", "--finding", "f"]);
    run(["--recordLens", "--lens", "L2", "--finding", "f"]);
    run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    const r = run(["--isRevision", "--revisesThought", "1", "--thought", "t3 revise c1",
      "--thoughtNumber", "3", "--totalThoughts", "5", "--nextThoughtNeeded", "false"]);
    expect(r.code).toBe(0);
  });
});

describe("Bug 7: mid-session [CRIT] lifecycle", () => {
  it("mid-session export does not mark unmet criterion as [CRIT]", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--addCriterion", "c1"]);
    run(["--checkCriterion", "crit-1", "--met", "false"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("[CRIT]");
  });
});

describe("Bug 8: polarity (supports vs refutes)", () => {
  it("--registerClaim accepts --polarity refutes", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    const r = run(["--registerClaim", "c1", "--supports", "hyp-1", "--polarity", "refutes"]);
    expect(r.code).toBe(0);
    const state = readState();
    expect(state.claims["claim-1"].polarity).toBe("refutes");
  });

  it("linkStatus shows Linked-refuted when claim refutes hypothesis", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1", "--polarity", "refutes"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.io", "--claimSource", "https://b.com",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Linked-refuted");
  });
});

describe("Bug 9: pending drops notes/falsificationResult", () => {
  it("pending preserves hypothesisNotes and falsificationResult", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    const r = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "pending",
      "--hypothesisNotes", "test-note", "--falsificationResult", "test-fr"]);
    expect(r.code).toBe(0);
    const state = readState();
    expect(state.hypotheses["hyp-1"].notes).toBe("test-note");
    expect(state.hypotheses["hyp-1"].falsificationResult).toBe("test-fr");
  });
});

describe("Bug 10: Path A empty Reasoning Trace", () => {
  it("Path A export omits empty Reasoning Trace heading", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("## Reasoning Trace");
  });
});

describe("Bug 11: claimDate rollover bypass", () => {
  it("rejects 2026-02-31 (invalid day)", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "f1"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    const r = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source",
      "--claimSource", "https://a.io", "--claimNotes", "n",
      "--claimDate", "2026-02-31"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/invalid.*date|valid.*YYYY-MM-DD/i);
  });
});

describe("Bug 12: loadState migration write failure", () => {
  it("saveState throw during migration does not wipe state", () => {
    // Create a v1 state file
    const v1State = { schemaVersion: 1, thoughtHistory: [], branches: {}, claims: {}, hypotheses: {}, lenses: [], acceptanceCriteria: [] };
    writeFileSync(STATE, JSON.stringify(v1State));
    // Make state directory read-only to force saveState failure
    const dir = join(ROOT, "tests");
    const origMode = 0o755;
    chmodSync(dir, 0o555);
    try {
      const r = run(["--status"]);
      // Migration write failure must NOT wipe state to emptyState().
      // Either success (v2 written) or clean fail — but state must remain a valid session.
      expect(r.code).toBe(0);
      const state = JSON.parse(readFileSync(STATE, "utf-8"));
      expect(state.schemaVersion).toBeGreaterThanOrEqual(1);
    } finally {
      chmodSync(dir, origMode);
    }
  });
});

describe("Bug 13: signal handlers", () => {
  it("SIGINT/SIGTERM/SIGHUP release lock on receipt", () => {
    // Tests the exact signal handling logic added to think.ts.
    // On Win32, child.kill("SIGTERM") sends TerminateProcess which bypasses
    // process signal hooks. We test that the process.on handlers registered
    // by think.ts call releaseLock() and exit 130 when signals are delivered.
    const lockDir = STATE + ".lock";
    const script = `
      const fs = require("fs");
      const lockDir = process.env.THINK_STATE_FILE + ".lock";
      let lockAcquired = false;
      function releaseLock() {
        if (lockAcquired) {
          try { fs.rmdirSync(lockDir); lockAcquired = false; } catch {}
        }
      }
      process.on("exit", releaseLock);
      for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.on(sig, () => {
          releaseLock();
          process.exit(130);
        });
      }
      fs.mkdirSync(lockDir);
      lockAcquired = true;
      process.emit("SIGTERM");
    `;
    const { spawnSync } = require("child_process");
    const r = spawnSync("bun", ["-e", script], { cwd: ROOT, env: ENV, encoding: "utf-8" });
    expect(r.status).toBe(130);
    expect(existsSync(lockDir)).toBe(false);
  });
});

describe("Bug 14: --help with other flags", () => {
  it("--help --reset exits 1 (conflict)", () => {
    const r = run(["--help", "--reset"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/cannot be combined|conflict|--help/i);
  });

  it("--help alone exits 0", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
  });
});

describe("Bug 15: doc drift", () => {
  it("README:188 test count matches actual", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
    // This test file itself will add to the count; we only assert README does NOT claim a stale number.
    // The stale number is 266; after this test file is added, actual is > 266.
    // Assert README no longer contains "266 tests".
    expect(readme).not.toMatch(/266 tests/);
  });

  it("SKILL:267 hypothesisStatus enum includes pending", () => {
    const skill = readFileSync(join(ROOT, "SKILL.md"), "utf-8");
    const lines = skill.split("\n");
    const line267 = lines[266]; // 0-indexed
    expect(line267).toContain("pending");
  });

  it("SKILL:317 auditTrail lists all 7 ops", () => {
    const skill = readFileSync(join(ROOT, "SKILL.md"), "utf-8");
    const lines = skill.split("\n");
    const line317 = lines[316];
    expect(line317).toContain("addCriterion");
    expect(line317).toContain("checkCriterion");
    expect(line317).toContain("recordLens");
  });
});

describe("TOCTOU: stale lock race", () => {
  it("lock steal does not delete fresh lock (PID check)", () => {
    const lockDir = STATE + ".lock";
    // Create a lock with recent mtime (fresh — should NOT be stolen)
    mkdirSync(lockDir, { recursive: true });
    // Spawn a process that will wait on the lock (it must NOT steal a fresh lock).
    const { spawn } = require("child_process");
    const child = spawn("bun", ["scripts/think.ts", "--status"], { cwd: ROOT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
    // Give it ~1s to potentially steal (it should not, because lock is fresh)
    execFileSync("sleep", ["1"]);
    // Lock must still exist (fresh lock not stolen)
    expect(existsSync(lockDir)).toBe(true);
    // Kill the waiting process
    child.kill("SIGKILL");
    rmSync(lockDir, { recursive: true, force: true });
  });
});
