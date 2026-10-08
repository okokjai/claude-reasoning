import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { unlinkSync, existsSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
// Bun runs test files in parallel, and two concurrent `bun test` invocations
// must not share files either — the pid keeps each process to its own state.
const STATE_FILE = join(CWD, "tests", `.think_state.issues-${process.pid}.json`);
process.env.THINK_STATE_FILE = STATE_FILE;

function run(argv: string[], env?: Record<string, string>): { stdout: string; stderr: string; code: number } {
  const res = spawnSync("bun", [SCRIPT, ...argv], {
    cwd: CWD,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? 1,
  };
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

describe("Issue 2 & 15: Path A forbids claim/hypothesis side-commands", () => {
  it("rejects --verifyClaim in Path A mode", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimNotes", "note"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Path A");
  });

  it("rejects --registerHypothesis in Path A mode", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--registerHypothesis", "hyp in path-a"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Path A");
  });

  it("rejects --resolveHypothesis in Path A mode", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Path A");
  });
});

describe("Issue 3: Path A depth cap (maximum 5 thoughts)", () => {
  it("rejects submitting a 6th thought in Path A mode", () => {
    for (let i = 1; i <= 5; i++) {
      const res = run(["--mode", "path-a", "--thought", `thought ${i}`, "--thoughtNumber", `${i}`, "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
      expect(res.code).toBe(0);
    }
    const res6 = run(["--thought", "thought 6 exceeds cap", "--thoughtNumber", "6", "--totalThoughts", "6", "--nextThoughtNeeded", "true"]);
    expect(res6.code).toBe(1);
    expect(res6.stderr).toContain("exceeds 5 thoughts");
  });
});

describe("Issue 4: side-commands require mode to be established", () => {
  it("rejects --registerClaim before any thought has established --mode", () => {
    const res = run(["--registerClaim", "premature claim"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mode must be established");
  });

  it("rejects --registerHypothesis before any thought has established --mode", () => {
    const res = run(["--registerHypothesis", "premature hypothesis"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mode must be established");
  });

  it("rejects --verifyClaim before any thought has established --mode", () => {
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimNotes", "note"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mode must be established");
  });

  it("rejects --resolveHypothesis before any thought has established --mode", () => {
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mode must be established");
  });
});

describe("Issue 5: cannot demote a verified claim to any non-verified status", () => {
  function setupVerifiedClaim() {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "verified fact", "--supports", "hyp-1"]);
    const ok = run([
      "--verifyClaim", "claim-1",
      "--claimStatus", "verified",
      "--claimTier", "1", "--claimTier", "1",
      "--claimSource", "https://aws.amazon.com/page",
      "--claimSource", "https://anthropic.com/page",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(ok.code).toBe(0);
  }

  it("rejects re-verifying a verified claim with --claimStatus pending", () => {
    setupVerifiedClaim();
    const demote = run(["--verifyClaim", "claim-1", "--claimStatus", "pending"]);
    expect(demote.code).toBe(1);
    expect(demote.stderr).toContain("cannot demote verified claim");
  });

  it("rejects re-verifying a verified claim with --claimStatus unverified and preserves sources", () => {
    setupVerifiedClaim();
    const demote = run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimNotes", "changed my mind"]);
    expect(demote.code).toBe(1);
    expect(demote.stderr).toContain("cannot demote verified claim");

    const statusRes = run(["--status"]);
    expect(statusRes.code).toBe(0);
    const state = JSON.parse(statusRes.stdout);
    const claim = state.claimDetails["claim-1"];
    expect(claim.status).toBe("verified");
    expect(claim.sources.length).toBe(2);
  });

  it("rejects re-verifying a verified claim with --claimStatus single_source", () => {
    setupVerifiedClaim();
    const demote = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://example.com/x", "--claimNotes", "only one source now"]);
    expect(demote.code).toBe(1);
    expect(demote.stderr).toContain("cannot demote verified claim");
  });

  it("rejects re-verifying a verified claim with --claimStatus not_found", () => {
    setupVerifiedClaim();
    const demote = run(["--verifyClaim", "claim-1", "--claimStatus", "not_found", "--claimNotes", "record vanished"]);
    expect(demote.code).toBe(1);
    expect(demote.stderr).toContain("cannot demote verified claim");
  });
});

describe("Issue 6: --status exposes hypothesisDetails", () => {
  it("includes statement and metadata for registered hypotheses in --status", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "Detailed hypothesis statement", "--falsification", "f"]);
    const statusRes = run(["--status"]);
    expect(statusRes.code).toBe(0);
    const parsed = JSON.parse(statusRes.stdout);
    expect(parsed.hypothesisDetails).toBeDefined();
    expect(parsed.hypothesisDetails["hyp-1"]).toBeDefined();
    expect(parsed.hypothesisDetails["hyp-1"].statement).toBe("Detailed hypothesis statement");
  });
});

describe("Issue 7: robust root domain determination", () => {
  it("recognizes distinct root domains across common multi-segment public suffixes (bbc.co.uk vs itv.co.uk)", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "UK news claim", "--supports", "hyp-1"]);
    const res = run([
      "--verifyClaim", "claim-1",
      "--claimStatus", "verified",
      "--claimTier", "1", "--claimTier", "2",
      "--claimSource", "https://www.bbc.co.uk/news/123",
      "--claimSource", "https://www.itv.co.uk/news/456",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(0);
  });

  it("recognizes distinct IP addresses as distinct root domains", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Internal network claim", "--supports", "hyp-1"]);
    const res = run([
      "--verifyClaim", "claim-1",
      "--claimStatus", "verified",
      "--claimTier", "1", "--claimTier", "1",
      "--claimSource", "https://192.168.1.1/metrics",
      "--claimSource", "https://10.0.1.1/metrics",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(0);
  });
});

describe("Issue 8 & 9: CLI parsing errors emit clean Error message without stack trace", () => {
  it("exits with clean Error: for unknown flags", () => {
    const res = run(["--bogus"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Error: Invalid arguments:");
    expect(res.stderr).not.toContain("ERR_PARSE_ARGS_UNKNOWN_OPTION");
    expect(res.stderr).not.toContain("TypeError:");
    expect(res.stderr).not.toContain("at ");
  });

  it("exits with clean Error: for ambiguous negative integer flag value", () => {
    const res = run(["--thoughtNumber", "-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Error: Invalid arguments:");
    expect(res.stderr).not.toContain("TypeError:");
    expect(res.stderr).not.toContain("at ");
  });

  it("rejects --thoughtNumber=-1 with validation error", () => {
    const res = run(["--thought", "x", "--thoughtNumber=-1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--thoughtNumber must be an integer >= 1");
  });
});

describe("Issue 10: thoughtNumber must be a safe integer with a reasonable upper bound", () => {
  it("rejects values exceeding Number.MAX_SAFE_INTEGER", () => {
    const res = run([
      "--mode", "path-a",
      "--thought", "overflow",
      "--thoughtNumber", "999999999999999999999",
      "--totalThoughts", "999999999999999999999",
      "--nextThoughtNeeded", "true",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--thoughtNumber must be an integer >= 1");
  });
});

describe("Issue 11: empty string values are rejected specifically", () => {
  it("rejects --thought '' with empty message rather than missing flag", () => {
    const res = run([
      "--mode", "path-a",
      "--thought", "",
      "--thoughtNumber", "1",
      "--totalThoughts", "3",
      "--nextThoughtNeeded", "true",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--thoughtNumber requires --thought");
  });

  it("rejects --registerClaim '' with specific error rather than fallthrough", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--registerClaim", ""]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--registerClaim statement cannot be empty");
  });
});

describe("Issue 12: --revisesThought must reference an existing thought in history", () => {
  it("rejects revising a thought number that was never recorded", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run([
      "--thought", "revised",
      "--thoughtNumber", "2",
      "--totalThoughts", "3",
      "--nextThoughtNeeded", "true",
      "--isRevision",
      "--revisesThought", "9",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Cannot revise thought 9: not found in history");
  });
});

describe("Issue 13: thoughtNumber must not duplicate prior thought unless isRevision", () => {
  it("rejects non-revision submission reusing an existing thoughtNumber", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "duplicate 1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("thought 1 already exists");
  });
});

describe("Issue 14: --isRevision and --branchFromThought are mutually exclusive", () => {
  it("rejects submission specifying both isRevision and branchFromThought", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run([
      "--thought", "contradiction",
      "--thoughtNumber", "2",
      "--totalThoughts", "3",
      "--nextThoughtNeeded", "true",
      "--isRevision",
      "--revisesThought", "1",
      "--branchFromThought", "1",
      "--branchId", "b1",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--isRevision and --branchFromThought are mutually exclusive");
  });
});

describe("Audit 1: unparseable claim sources cannot bypass the dual-domain check", () => {
  function setupClaim() {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "test claim", "--supports", "hyp-1"]);
  }

  it("rejects sources that are not parseable URLs", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "not a url", "--claimSource", "also not"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("does not name a host");
  });

  it("treats same-domain scheme-less sources as one root domain", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "example.com/a", "--claimSource", "example.com/b"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("distinct root domains");
  });

  it("still accepts distinct scheme-less domains", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "example.com/x", "--claimSource", "other.org/y", "--claimTier", "1", "--claimTier", "2", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(res.code).toBe(0);
  });
});

describe("Audit 2: the first thought must carry --mode", () => {
  it("rejects a first thought without --mode even if mode was set via a side-command", () => {
    const reg = run(["--mode", "path-b", "--registerHypothesis", "H1", "--falsification", "f"]);
    expect(reg.code).toBe(0);
    const res = run(["--thought", "first", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mode is required on the first thought");
  });
});

describe("Audit 3: multi-segment suffix coverage", () => {
  function setupClaim() {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "test claim", "--supports", "hyp-1"]);
  }

  it("recognizes distinct registrable domains under co.nz", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.co.nz/x", "--claimSource", "https://b.co.nz/y", "--claimTier", "2", "--claimTier", "2", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(res.code).toBe(0);
  });

  it("recognizes distinct registrable domains under netlify.app", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://foo.netlify.app/a", "--claimSource", "https://bar.netlify.app/b", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(res.code).toBe(0);
  });

  it("still rejects two hosts sharing one ordinary domain", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.x.com/1", "--claimSource", "https://b.x.com/2"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("distinct root domains");
  });
});

describe("Audit 5: --claimTier enforces source-tiers.md Tier 1/2 for verified", () => {
  function setupClaim() {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "test claim", "--supports", "hyp-1"]);
  }

  it("rejects verified when four distinct domains are all Tier 3", () => {
    setupClaim();
    const res = run([
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://www.binance.com/square/post/1",
      "--claimSource", "https://phemex.com/news/2",
      "--claimSource", "https://www.kucoin.com/news/3",
      "--claimSource", "https://www.gate.io/blog/4",
      "--claimTier", "3", "--claimTier", "3", "--claimTier", "3", "--claimTier", "3",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Tier 1 or Tier 2");
  });

  it("rejects verified when only one of two sources is Tier 1 or Tier 2", () => {
    setupClaim();
    const res = run([
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://docs.aws.amazon.com/x",
      "--claimSource", "https://medium.com/@dev/y",
      "--claimTier", "1", "--claimTier", "3",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Tier 1 or Tier 2");
  });

  it("accepts verified with two independent Tier 1/2 sources", () => {
    setupClaim();
    const res = run([
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://docs.aws.amazon.com/x",
      "--claimSource", "https://www.reuters.com/y",
      "--claimTier", "1", "--claimTier", "2",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('"status": "verified"');
  });

  it("rejects a --claimTier count that does not match --claimSource", () => {
    setupClaim();
    const res = run([
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.example", "--claimSource", "https://b.example",
      "--claimTier", "1",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("one --claimTier per --claimSource");
  });

  it("rejects a --claimTier outside 1-4", () => {
    setupClaim();
    const res = run([
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.example", "--claimSource", "https://b.example",
      "--claimTier", "1", "--claimTier", "5",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--claimTier");
  });

  it("rejects verified without --claimTier", () => {
    setupClaim();
    const res = run([
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.example", "--claimSource", "https://b.example",
      "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf",
    ]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--claimTier is required");
  });

  it("does not require --claimTier for single_source", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://only.example", "--claimNotes", "one blog"]);
    expect(res.code).toBe(0);
  });

  it("rejects a non-numeric --claimTier on a non-verified status instead of persisting NaN", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://blog.example/x", "--claimTier", "abc", "--claimNotes", "one blog"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--claimTier must be an integer 1-4");
  });

  it("rejects an out-of-range --claimTier on a non-verified status", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimTier", "5", "--claimTier", "0", "--claimNotes", "no tools"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--claimTier must be an integer 1-4");
  });

  it("rejects a --claimTier count that does not match --claimSource on a non-verified status", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "not_found", "--claimTier", "2", "--claimTier", "2", "--claimNotes", "no public record"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("one --claimTier per --claimSource");
  });

  it("accepts an aligned --claimTier on a non-verified status and persists it", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://blog.example/x", "--claimTier", "3", "--claimNotes", "one blog"]);
    expect(res.code).toBe(0);
    const s = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(s.claims["claim-1"].tiers).toEqual([3]);
  });

  it("warns once on a legacy verified claim with no recorded tiers", () => {
    // A pre-3.0.2 state file can hold a verified claim with no tiers; the lint
    // report must flag it, not silently trust it.
    const { writeFileSync } = require("fs");
    writeFileSync(STATE_FILE, JSON.stringify({
      schemaVersion: 2, mode: "path-b",
      thoughtHistory: [{ thought: "t1", thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true }],
      branches: {},
      claims: { "claim-1": { id: "claim-1", statement: "legacy", registeredAtThought: 1, sources: ["https://a.example", "https://b.example"], status: "verified", supports: "hyp-1", quote: "q", negativeQuery: "nq", negativeFinding: "nf" } },
      hypotheses: { "hyp-1": { id: "hyp-1", statement: "H", status: "pending", falsification: "f clause long enough here" } },
      lenses: [], auditTrail: [],
    }));
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/\[WARN\].*claim-1.*verified without --claimTier/i);
  });

  it("re-verify without --claimTier preserves the persisted tiers instead of wiping them", () => {
    // Regression: think.ts wrote `claim.tiers = tiers` unconditionally for
    // non-pending statuses, so a re-verify without --claimTier persisted [].
    setupClaim();
    run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://blog.example/x", "--claimTier", "3", "--claimNotes", "first pass"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://blog.example/x", "--claimNotes", "re-check"]);
    expect(res.code).toBe(0);
    const s = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(s.claims["claim-1"].tiers).toEqual([3]);
  });

  it("rejects a verification flag passed without --verifyClaim instead of dropping it silently", () => {
    // --claimTier, --claimSource, --claimStatus, --claimQuote, --negativeQuery,
    // --negativeFinding only do anything inside the --verifyClaim branch; passed
    // alone they were parsed, ignored, and the command exited 0.
    setupClaim();
    const res = run(["--registerClaim", "another claim", "--supports", "hyp-1", "--claimTier", "1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/--claimTier.*requires --verifyClaim|requires --verifyClaim/i);
  });

  it("rejects non-canonical --claimTier spellings (1e0, 0x1, +1, 01) instead of coercing via Number()", () => {
    setupClaim();
    for (const bad of ["1e0", "0x1", "+1", "01"]) {
      const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://a.example/x", "--claimTier", bad, "--claimNotes", "n"]);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain("--claimTier must be an integer 1-4");
    }
  });
});

describe("Audit 4: totalThoughts auto-raise emits a notice", () => {
  it("accepts thoughtNumber > totalThoughts but reports the adjustment on stderr", () => {
    const res = run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(0);
    const res2 = run(["--thought", "jumped estimate", "--thoughtNumber", "9", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    expect(res2.code).toBe(0);
    expect(res2.stderr).toContain("totalThoughts adjusted 4->9");
  });
});

describe("Audit 5: --branchFromThought must reference an existing thought", () => {
  it("rejects branching from a thought number never recorded", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "branch off nothing", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--branchFromThought", "999", "--branchId", "b1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Cannot branch from thought 999: not found in history");
  });
});

describe("Audit 6: --mergedInto cannot target a rejected hypothesis", () => {
  it("rejects merging into a rejected hypothesis", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("already rejected");
  });

  it("still allows merging into a pending or selected hypothesis", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "absorbed into hyp-1"]);
    expect(res.code).toBe(0);
  });
});

describe("Audit 7: --reset cannot be combined with other operations", () => {
  it("rejects --status --reset", () => {
    const res = run(["--status", "--reset"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--reset cannot be combined");
  });

  it("rejects --reset combined with a thought", () => {
    const res = run(["--reset", "--thought", "x", "--thoughtNumber", "1", "--totalThoughts", "1", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--reset cannot be combined");
  });

  it("still accepts a bare --reset", () => {
    const res = run(["--reset"]);
    expect(res.code).toBe(0);
  });
});

describe("Audit 8: numeric flags reject non-decimal notation", () => {
  it("rejects scientific notation for --thoughtNumber", () => {
    const res = run(["--thought", "x", "--thoughtNumber", "1e1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--thoughtNumber must be an integer >= 1");
  });

  it("rejects hex notation for --totalThoughts", () => {
    const res = run(["--thought", "x", "--totalThoughts", "0x10", "--thoughtNumber", "1", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--totalThoughts must be an integer >= 1");
  });

  it("rejects leading/trailing whitespace", () => {
    const res = run(["--thought", "x", "--thoughtNumber= 5", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--thoughtNumber must be an integer >= 1");
  });
});

// ---------- v3.0.0 reasoning-depth upgrade (plan v3.4 §4-§7) ----------

function T(n: number, total: number, next: string, text: string, extra: string[] = [], env?: Record<string, string>) {
  return run(["--thought", text, "--thoughtNumber", String(n), "--totalThoughts", String(total), "--nextThoughtNeeded", next, ...extra], env);
}

function startPathB() {
  run(["--reset"]);
  T(1, 4, "true", "decompose", ["--mode", "path-b"]);
}

function addHyps() {
  run(["--registerHypothesis", "A", "--falsification", "falsify condition for A"]);
  run(["--registerHypothesis", "B", "--falsification", "falsify condition for B"]);
}

function resolveBoth() {
  run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
  run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
}

function addLenses() {
  run(["--recordLens", "--lens", "premortem", "--finding", "f1"]);
  run(["--recordLens", "--lens", "devil", "--finding", "f2"]);
}

function checkCrit(id: string, met: string) {
  return run(["--checkCriterion", id, "--met", met]);
}

function converge(env?: Record<string, string>) {
  return T(4, 4, "false", "conclusion", ["--newInsight", "false", "--newInsightNotes", "stable"], env);
}

describe("v3.0.0 side-command required fields (definition layer, always on)", () => {
  it("rejects --registerHypothesis without --falsification", () => {
    startPathB();
    const res = run(["--registerHypothesis", "no falsification"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--falsification");
  });

  it("rejects --registerHypothesis with empty --falsification", () => {
    startPathB();
    const res = run(["--registerHypothesis", "empty falsification", "--falsification", "   "]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--falsification");
  });

  it("rejects --resolveHypothesis without --hypothesisNotes", () => {
    startPathB();
    addHyps();
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--falsificationResult", "held"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--hypothesisNotes");
  });

  it("rejects --resolveHypothesis without --falsificationResult", () => {
    startPathB();
    addHyps();
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--falsificationResult");
  });

  it("rejects --registerClaim without --supports", () => {
    startPathB();
    addHyps();
    const res = run(["--registerClaim", "claim without support"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--supports");
  });

  it("rejects --registerClaim with a --supports target that does not exist", () => {
    startPathB();
    addHyps();
    const res = run(["--registerClaim", "claim pointing nowhere", "--supports", "hyp-99"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/hyp-99.*not (found|exist)/i);
  });

  it("rejects --verifyClaim verified without the evidence trio", () => {
    startPathB();
    addHyps();
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    for (const missing of ["--claimQuote", "--negativeQuery", "--negativeFinding"]) {
      const full = ["--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"];
      const idx = full.indexOf(missing);
      const kept = full.filter((_, i) => i !== idx && i !== idx + 1);
      const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", ...kept]);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain(missing);
    }
  });

  it("rejects --recordLens with missing --lens or --finding", () => {
    startPathB();
    const a = run(["--recordLens", "--finding", "x"]);
    expect(a.code).toBe(1);
    const b = run(["--recordLens", "--lens", "premortem"]);
    expect(b.code).toBe(1);
    const c = run(["--recordLens", "--lens", " ", "--finding", "x"]);
    expect(c.code).toBe(1);
  });

  it("rejects --addCriterion with empty text", () => {
    startPathB();
    const res = run(["--addCriterion", "   "]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--addCriterion");
  });

  it("rejects --checkCriterion for an unknown criterion id", () => {
    startPathB();
    run(["--addCriterion", "must cover X"]);
    const res = checkCrit("crit-9", "true");
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("crit-9");
  });

  it("rejects --met values other than 'true'/'false'", () => {
    startPathB();
    run(["--addCriterion", "must cover X"]);
    for (const bad of ["yes", "1", "maybe"]) {
      const res = checkCrit("crit-1", bad);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain("--met");
    }
    expect(checkCrit("crit-1", "true").code).toBe(0);
  });

  it("rejects --newInsight true on a thought (duplicates --nextThoughtNeeded true)", () => {
    startPathB();
    const res = T(2, 4, "true", "thinking", ["--newInsight", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--newInsight");
  });
});

describe("v3.0.0 state layer: schema migration and atomic save", () => {
  it("migrates a pre-3.0.0 state file by filling new fields with defaults", () => {
    writeFileSync(STATE_FILE, JSON.stringify({
      mode: "path-b",
      thoughtHistory: [{ thought: "t", thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true }],
      branches: {},
      claims: {},
      hypotheses: {},
      auditTrail: [],
    }));
    const res = run(["--status"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.acceptanceCriteria).toEqual([]);
    expect(parsed.lenses).toEqual([]);
    const onDisk = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(onDisk.schemaVersion).toBe(3);
    expect(onDisk.acceptanceCriteria).toEqual([]);
    expect(onDisk.lenses).toEqual([]);
  });
});

describe("v3.0.0 termination gates 6-11", () => {
  it("Gate 6 (criteria): blocks termination with no acceptance criteria", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = converge();
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/criterion|criteria/i);
  });

  it("Gate 6 (criteria): blocks termination while a criterion is unchecked; passes once all are checked", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "covers the divergence"]);
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const blocked = converge();
    expect(blocked.code).toBe(1);
    checkCrit("crit-1", "true");
    const ok = converge();
    expect(ok.code).toBe(0);
  });

  it("Gate 6 disabled via THINK_GATES_OFF=criteria does not block and reports a WARN in lint", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = converge({ THINK_GATES_OFF: "criteria" });
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/\[WARN\].*gate.*criteria.*disabled/i);
  });

  it("Gate 7 (criteriaRevision): met=false without a later revision blocks; newInsightNotes exempts with a WARN", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "covers the divergence"]);
    // Revision at thought 2 lands BEFORE the check -> cannot satisfy gate 7
    // (needs thoughtNumber > checkedAtThought), but does satisfy gate 9.
    T(2, 4, "true", "work", ["--isRevision", "--revisesThought", "1"]);
    checkCrit("crit-1", "false"); // checkedAtThought = 2
    T(3, 4, "true", "more");
    const blocked = T(4, 4, "false", "conclusion");
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toMatch(/met=false|revision/i);
    const exempt = converge();
    expect(exempt.code).toBe(0);
    expect(exempt.stdout).toMatch(/\[WARN\].*newInsightNotes/);
  });

  it("Gate 7: a revision thought after checkedAtThought satisfies the gate", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "covers the divergence"]);
    checkCrit("crit-1", "false");
    T(2, 4, "true", "work");
    T(3, 4, "true", "fix", ["--isRevision", "--revisesThought", "1"]);
    const res = T(4, 4, "false", "conclusion");
    expect(res.code).toBe(0);
  });

  it("Gate 7 disabled via THINK_GATES_OFF=criteriaRevision does not block and warns in lint", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "covers the divergence"]);
    checkCrit("crit-1", "false");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = T(4, 4, "false", "conclusion", ["--newInsight", "false"], { THINK_GATES_OFF: "criteriaRevision,convergence" });
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/\[WARN\].*gate.*criteriaRevision.*disabled/i);
  });

  it("Gate 8 (lenses): blocks termination with fewer than 2 distinct lens names; duplicate names do not count", () => {
    startPathB();
    addHyps();
    resolveBoth();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    run(["--recordLens", "--lens", "premortem", "--finding", "f1"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "f2"]);
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = converge();
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/lens/i);
  });

  it("Gate 8 disabled via THINK_GATES_OFF=lenses does not block and warns in lint", () => {
    startPathB();
    addHyps();
    resolveBoth();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = converge({ THINK_GATES_OFF: "lenses" });
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/\[WARN\].*gate.*lenses.*disabled/i);
  });

  it("Gate 9 (convergence): blocks termination without convergence declaration; branch history satisfies it", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const blocked = T(4, 4, "false", "conclusion");
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toMatch(/convergen|newInsight|revision|branch/i);
    // History containing a branch satisfies gate 9 even without --newInsight false.
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 5, "true", "work", ["--branchFromThought", "1", "--branchId", "alt"]);
    T(3, 5, "true", "more");
    const ok = T(4, 5, "false", "conclusion");
    expect(ok.code).toBe(0);
  });

  it("Gate 9 disabled via THINK_GATES_OFF=convergence does not block and warns in lint", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = T(4, 4, "false", "conclusion", [], { THINK_GATES_OFF: "convergence" });
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/\[WARN\].*gate.*convergence.*disabled/i);
  });

  it("Gate 9: --newInsight false alone (no notes) does not satisfy declared convergence", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = T(4, 4, "false", "conclusion", ["--newInsight", "false"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/newInsightNotes|convergen/i);
  });

  it("merged terminal status still requires --hypothesisNotes", () => {
    startPathB();
    addHyps();
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-2"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/hypothesisNotes/i);
    // but falsificationResult stays exempt for merged
    const res2 = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-2", "--hypothesisNotes", "same mechanism"]);
    expect(res2.code).toBe(0);
  });

  it("Gate 10 (falsificationResult): termination passes when every resolved hypothesis has falsificationResult", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = converge();
    expect(res.code).toBe(0);
  });

  it("Gate 10 (falsificationResult): blocks when resolved hypothesis lacks falsificationResult in state, bypassed via THINK_GATES_OFF", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    // Manually strip falsificationResult from hyp-1 in state to test Gate 10 assertion
    const s = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    delete s.hypotheses["hyp-1"].falsificationResult;
    writeFileSync(STATE_FILE, JSON.stringify(s));

    const blocked = converge();
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toMatch(/falsificationResult/i);

    const bypassed = converge({ THINK_GATES_OFF: "falsificationResult" });
    expect(bypassed.code).toBe(0);
    expect(bypassed.stdout).toMatch(/\[WARN\].*gate.*falsificationResult.*disabled/i);
  });

  it("THINK_GATES_OFF=all disables all new gates", () => {
    startPathB();
    addHyps();
    resolveBoth();
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = T(4, 4, "false", "conclusion", [], { THINK_GATES_OFF: "all" });
    expect(res.code).toBe(0);
  });
});

describe("v3.0.0 lint report additions (buildLintReport §7)", () => {
  function setup() {
    startPathB();
    addHyps();
    run(["--registerClaim", "claim one", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "a sufficiently long quote from the source text", "--negativeQuery", "counter example query", "--negativeFinding", "no counter evidence found in search results"]);
    resolveBoth();
  }

  it("prints an INFO question when claims=0 on Path B termination", () => {
    startPathB();
    addHyps();
    resolveBoth();
    addLenses();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    T(3, 4, "true", "more");
    const res = converge();
    expect(res.code).toBe(0);
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/\[INFO\].*claims=0.*purely internal/i);
  });

  it("warns on short falsification (<20 chars), short quote, and duplicate negativeFinding texts", () => {
    startPathB();
    run(["--registerHypothesis", "A", "--falsification", "short"]); // <20 chars
    run(["--registerHypothesis", "B", "--falsification", "a long enough falsification clause"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    run(["--registerClaim", "c2", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "short q", "--negativeQuery", "nq", "--negativeFinding", "identical finding text here"]);
    run(["--verifyClaim", "claim-2", "--claimStatus", "verified", "--claimSource", "https://c.example", "--claimSource", "https://d.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "a much longer quote that clears the threshold", "--negativeQuery", "nq2", "--negativeFinding", "identical finding text here"]);
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/\[WARN\].*hyp-1.*falsification/i);
    expect(out).toMatch(/\[WARN\].*claim-1.*quote/i);
    expect(out).toMatch(/\[WARN\].*claim-1.*claim-2|claim-2.*claim-1/i);
  });

  it("derives link-status per rule K: Fragile on unverified claim, No external coverage on no claims, Linked-verified on verified+quote", () => {
    setup();
    const out = run(["--export"]).stdout;
    expect(out).toContain("link-status: Linked-verified");
    expect(out).toMatch(/hyp-2[\s\S]*link-status: No external coverage/);
    // Now make claim-2 unverified -> Fragile on hyp-1... claim-2 doesn't exist; add one:
  });

  it("marks hypothesis Fragile when a linked claim is unverified", () => {
    startPathB();
    addHyps();
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimNotes", "could not confirm"]);
    resolveBoth();
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/hyp-1[\s\S]*link-status: Fragile/);
  });

  it("prints an INFO auditTrail last-round state-change count", () => {
    setup();
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/\[INFO\].*auditTrail/);
  });

  it("prints the Acceptance Checklist with met/unmet/un-checked markers", () => {
    startPathB();
    run(["--addCriterion", "criterion one"]);
    checkCrit("crit-1", "true");
    run(["--addCriterion", "criterion two"]);
    const out = run(["--export"]).stdout;
    expect(out).toContain("Acceptance Checklist");
    expect(out).toMatch(/crit-1/);
    expect(out).toMatch(/crit-2/);
  });

  it("warns on verified claims whose negativeFinding has no command/output record (single-line self-report)", () => {
    startPathB();
    addHyps();
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "a sufficiently long quote", "--negativeQuery", "nq1", "--negativeFinding", "just one line of self-report"]);
    run(["--registerClaim", "c2", "--supports", "hyp-2"]);
    run(["--verifyClaim", "claim-2", "--claimStatus", "verified", "--claimSource", "https://c.example", "--claimSource", "https://d.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "a sufficiently long quote", "--negativeQuery", "nq2", "--negativeFinding", "bun test foo\n→ 0 matching failures"]);
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/\[WARN\].*1\/2.*negativeFinding/i);
  });

  it("single-line negativeFinding still warns when it contains command markers (no marker heuristic)", () => {
    // Locks the decision that the check is purely "contains a newline": a
    // self-report sentence that happens to contain $ / pass / fail / bun must
    // NOT silence the WARN, and the message must not claim execution detection.
    startPathB();
    addHyps();
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "a sufficiently long quote", "--negativeQuery", "nq1", "--negativeFinding", "ran bun, all pass, cost $0"]);
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/\[WARN\].*1\/1.*negativeFinding/i);
    expect(out).not.toMatch(/command\/output record/i);
  });

  it("counts audit state changes in the last thought round only (entries after round-2 ops are not counted)", () => {
    startPathB();
    addHyps(); // atThought = 1 (round of thought 1)
    resolveBoth();
    run(["--addCriterion", "c"]);
    checkCrit("crit-1", "true");
    T(2, 4, "true", "work");
    // last-round ops happen while history=2 (before thought 3)
    run(["--recordLens", "--lens", "premortem", "--finding", "f1"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "changed finding"]); // same target, detail changed → 1 change
    run(["--recordLens", "--lens", "devil", "--finding", "f2"]); // Gate 8 needs ≥2 distinct lens names
    T(3, 4, "true", "more");
    const res = converge();
    expect(res.code).toBe(0);
    const out = run(["--export"]).stdout;
    expect(out).toContain("1 status change(s) on previously-seen targets");
  });
});


afterAll(() => {
  for (const f of [STATE_FILE, STATE_FILE + ".bak"]) rmSync(f, { force: true });
  rmSync(STATE_FILE + ".lock", { force: true, recursive: true });
});
