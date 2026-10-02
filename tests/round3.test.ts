import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
// Per-process state file: bun runs test files in parallel, so a shared real
// scripts/.think_state.json lets concurrent suites clobber each other.
const STATE_FILE = join(CWD, "tests", `.think_state.round3-${process.pid}.json`);
process.env.THINK_STATE_FILE = STATE_FILE;

function run(argv: string[], env?: Record<string, string>): { stdout: string; stderr: string; code: number } {
  const res = spawnSync("bun", [SCRIPT, ...argv], {
    cwd: CWD,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", code: res.status ?? 1 };
}

beforeEach(() => {
  for (const f of [STATE_FILE, STATE_FILE + ".bak"]) {
    if (existsSync(f)) {
      try {
        unlinkSync(f);
      } catch {}
    }
  }
});

describe("round-3 review: silent-failure and bypass gaps", () => {
  it("rejects --claimNotes without --verifyClaim", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    const res = run(["--registerClaim", "c", "--supports", "hyp-1", "--claimNotes", "orphan"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/--claimNotes.*requires --verifyClaim/i);
  });

  it("rejects a whitespace-only --registerClaim", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    const res = run(["--registerClaim", " ", "--supports", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("cannot be empty");
  });

  it("rejects a whitespace-only --registerHypothesis", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--registerHypothesis", " ", "--falsification", "f clause long enough here"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("cannot be empty");
  });

  it("rejects a whitespace-only --thought", () => {
    const res = run(["--mode", "path-a", "--thought", " ", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("cannot be empty");
  });

  it("rejects --status combined with another operation", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    const res = run(["--status", "--registerClaim", "c", "--supports", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/--status.*cannot be combined|cannot be combined/i);
    // The claim must not have been registered — status must not swallow it.
    expect(readFileSync(STATE_FILE, "utf-8")).not.toContain('"registered"');
  });

  it("Path A rejects --addCriterion", () => {
    run(["--mode", "path-a", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--addCriterion", "criterion"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Path A");
  });

  it("Path A rejects --checkCriterion", () => {
    run(["--mode", "path-a", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--checkCriterion", "crit-1", "--met", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Path A");
  });

  it("Path A rejects --recordLens", () => {
    run(["--mode", "path-a", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--recordLens", "--lens", "X", "--finding", "f"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Path A");
  });

  it("rejects a file:// URL as a verified source", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "file:///etc/passwd", "--claimSource", "https://b.example/y", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("claimSource");
  });

  it("rejects a non-URL bare string like `foo/file` as a verified source", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "foo/file:///etc/passwd", "--claimSource", "https://b.example/y", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(res.code).toBe(1);
  });

  it("treats a.com.tr and b.com.tr as distinct root domains", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.com.tr/x", "--claimSource", "https://b.com.tr/y", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    // com.tr is a real multi-segment public suffix: two distinct registrable
    // domains below it must not be collapsed into one root domain.
    expect(res.code).toBe(0);
  });

  it("does not print 'hyp-hyp-9' in a not-found --supports error", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--registerClaim", "c", "--supports", "hyp-9"]);
    expect(res.code).toBe(1);
    expect(res.stderr).not.toContain("hyp-hyp-9");
  });

  it("rejects Path B termination when every hypothesis is rejected", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--addCriterion", "c1"]);
    run(["--checkCriterion", "crit-1", "--met", "true"]);
    run(["--recordLens", "--lens", "l1", "--finding", "f"]);
    run(["--recordLens", "--lens", "l2", "--finding", "f"]);
    run(["--thought", "t", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "t", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false", "--newInsight", "false", "--newInsightNotes", "converged"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("selected or synthesized");
  });

  it("rejects merging onward a hypothesis that already absorbs another (merge-chain gate)", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H3", "--falsification", "f clause long enough here"]);
    // hyp-3 merges into hyp-1: hyp-1 now absorbs a hypothesis.
    const m1 = run(["--resolveHypothesis", "hyp-3", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "absorbed"]);
    expect(m1.code).toBe(0);
    // hyp-1 already absorbs hyp-3, so it cannot itself be merged onward into hyp-2.
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-2", "--hypothesisNotes", "n"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("already absorbs");
    expect(res.stderr).toContain("merge chains are not allowed");
  });

  it("rejects re-resolving a merge survivor while it still absorbs members (stale mergedInto)", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H3", "--falsification", "f clause long enough here"]);
    // hyp-3 merges into hyp-1: hyp-1 is now the survivor absorbing hyp-3.
    run(["--resolveHypothesis", "hyp-3", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "absorbed"]);
    // Re-resolving hyp-1 to rejected would strand hyp-3's mergedInto on a dead node.
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "no", "--falsificationResult", "broke"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("absorbs");
  });

  it("clears stale notes/falsificationResult when a hypothesis is re-resolved back to pending", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "why", "--falsificationResult", "held"]);
    // Re-resolve back to pending must not leave a falsification outcome or stale notes.
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "pending"]);
    expect(res.code).toBe(0);
    const status = JSON.parse(run(["--status"]).stdout);
    expect(status.hypothesisDetails["hyp-1"].falsificationResult).toBeUndefined();
    expect(status.hypothesisDetails["hyp-1"].notes).toBeUndefined();
  });

  it("rejects --falsificationResult on a merged resolution", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    // A merge is documented by --mergedInto alone; a falsificationResult on the
    // absorbed node is meaningless and must be rejected.
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "absorbed", "--falsificationResult", "broke"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("falsificationResult");
  });

  it("clears stale falsificationResult when a hypothesis is re-resolved to merged", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    // hyp-1 resolves to selected (carrying a falsification outcome)…
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "winner", "--falsificationResult", "held"]);
    // …then is re-resolved to merged into hyp-2. The absorbed node has no
    // falsification outcome of its own; the survivor keeps it.
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-2", "--hypothesisNotes", "absorbed"]);
    expect(res.code).toBe(0);
    const status = JSON.parse(run(["--status"]).stdout);
    expect(status.hypothesisDetails["hyp-1"].falsificationResult).toBeUndefined();
    expect(status.hypothesisDetails["hyp-1"].mergedInto).toBe("hyp-2");
  });

  it("clears resolution-scoped evidence when a claim is re-verified back to pending", () => {
    run(["--mode", "path-b", "--thought", "t", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://a.example/x", "--claimTier", "2", "--claimNotes", "one source", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    // Re-verifying to pending must drop the resolution-scoped evidence fields —
    // a pending claim carries no verification outcome of its own.
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "pending"]);
    expect(res.code).toBe(0);
    const claim = JSON.parse(run(["--status"]).stdout).claimDetails["claim-1"];
    expect(claim.status).toBe("pending");
    expect(claim.quote).toBeUndefined();
    expect(claim.negativeQuery).toBeUndefined();
    expect(claim.negativeFinding).toBeUndefined();
    expect(claim.tiers).toBeUndefined();
    expect(claim.notes).toBeUndefined();
  });
});

describe("round-8 review: temporal-index gates and flag-pair silent drops", () => {
  it("Gate 7 accepts a revision submitted after the check even when it reuses a lower thoughtNumber", () => {
    // Temporal position and user-facing thoughtNumber are distinct: a revision
    // may reuse an earlier thoughtNumber (--thoughtNumber 2 --isRevision) while
    // landing later in history. Gate 7 must compare temporal position, not the
    // reused number, or a legitimate fix is rejected.
    run(["--mode", "path-b", "--thought", "T1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broke"]);
    run(["--thought", "T2", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    run(["--thought", "T3", "--thoughtNumber", "3", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    run(["--addCriterion", "covers the divergence"]);
    run(["--checkCriterion", "crit-1", "--met", "false"]); // checkedAtThought = 3
    // Revision lands at temporal position 4 but reuses thoughtNumber 2.
    run(["--thought", "revision fixing crit", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "true", "--isRevision", "--revisesThought", "2"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "fa"]);
    run(["--recordLens", "--lens", "devil", "--finding", "fb"]);
    const res = run(["--thought", "conclusion", "--thoughtNumber", "4", "--totalThoughts", "5", "--nextThoughtNeeded", "false"]);
    expect(res.stderr).not.toMatch(/met=false/);
    expect(res.code).toBe(0);
  });

  it("rejects --branchId without --branchFromThought instead of silently dropping it", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--branchId", "feature-b"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/--branchId.*--branchFromThought/i);
  });

  it("rejects --revisesThought without --isRevision instead of silently dropping it", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "t3", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--revisesThought", "1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/--revisesThought.*--isRevision/i);
  });

  // Central flag-dependency matrix: every sub-flag must be rejected when its
  // parent command flag is absent. Each row is [childFlag, childArgs, parentFlag].
  const ORPHAN_PAIRS: [string, string[], string][] = [
    ["--claimStatus", ["--claimStatus", "pending"], "--verifyClaim"],
    ["--claimSource", ["--claimSource", "example.com"], "--verifyClaim"],
    ["--claimTier", ["--claimTier", "1"], "--verifyClaim"],
    ["--claimQuote", ["--claimQuote", "q"], "--verifyClaim"],
    ["--negativeQuery", ["--negativeQuery", "q"], "--verifyClaim"],
    ["--negativeFinding", ["--negativeFinding", "f"], "--verifyClaim"],
    ["--claimNotes", ["--claimNotes", "n"], "--verifyClaim"],
    ["--supports", ["--supports", "hyp-1"], "--registerClaim"],
    ["--falsification", ["--falsification", "f"], "--registerHypothesis"],
    ["--hypothesisStatus", ["--hypothesisStatus", "selected"], "--resolveHypothesis"],
    ["--hypothesisNotes", ["--hypothesisNotes", "n"], "--resolveHypothesis"],
    ["--mergedInto", ["--mergedInto", "hyp-1"], "--resolveHypothesis"],
    ["--falsificationResult", ["--falsificationResult", "r"], "--resolveHypothesis"],
    ["--met", ["--met", "true"], "--checkCriterion"],
    ["--criterionNotes", ["--criterionNotes", "n"], "--checkCriterion"],
    ["--lens", ["--lens", "premortem"], "--recordLens"],
    ["--finding", ["--finding", "f"], "--recordLens"],
    ["--branchId", ["--branchId", "b"], "--branchFromThought"],
    ["--revisesThought", ["--revisesThought", "1"], "--isRevision"],
  ];
  // Empty-string values: an explicitly supplied but empty parent flag (e.g.
  // --checkCriterion "") must still be treated as absent, so the child is
  // rejected by the dependency matrix instead of leaking into a downstream
  // branch that fails with a different, misleading error.
  it("treats an empty-string parent as absent so --met still requires --checkCriterion", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--checkCriterion", "", "--met", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/--met.*requires --checkCriterion/i);
  });
  for (const [child, childArgs, parent] of ORPHAN_PAIRS) {
    it(`rejects orphan ${child} without ${parent}`, () => {
      run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
      const res = run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true", ...childArgs]);
      expect(res.code).toBe(1);
      expect(res.stderr).toMatch(new RegExp(`${child}.*requires.*${parent}|${parent}.*required`, "i"));
    });
  }

  it("prints usage and exits 0 when --help is passed", () => {
    const res = run(["--help"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Usage:");
    expect(res.stderr).toBe("");
  });
});
