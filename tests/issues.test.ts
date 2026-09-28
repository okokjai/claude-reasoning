import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "child_process";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
const STATE_FILE = join(CWD, "scripts", ".think_state.json");

function run(argv: string[]): { stdout: string; stderr: string; code: number } {
  const res = spawnSync("bun", [SCRIPT, ...argv], { cwd: CWD, encoding: "utf-8" });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? 1,
  };
}

beforeEach(() => {
  if (existsSync(STATE_FILE)) {
    try {
      unlinkSync(STATE_FILE);
    } catch {}
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
    run(["--registerClaim", "verified fact"]);
    const ok = run([
      "--verifyClaim", "claim-1",
      "--claimStatus", "verified",
      "--claimSource", "https://aws.amazon.com/page",
      "--claimSource", "https://anthropic.com/page",
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
    run(["--registerHypothesis", "Detailed hypothesis statement"]);
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
    run(["--registerClaim", "UK news claim"]);
    const res = run([
      "--verifyClaim", "claim-1",
      "--claimStatus", "verified",
      "--claimSource", "https://www.bbc.co.uk/news/123",
      "--claimSource", "https://www.itv.co.uk/news/456",
    ]);
    expect(res.code).toBe(0);
  });

  it("recognizes distinct IP addresses as distinct root domains", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerClaim", "Internal network claim"]);
    const res = run([
      "--verifyClaim", "claim-1",
      "--claimStatus", "verified",
      "--claimSource", "https://192.168.1.1/metrics",
      "--claimSource", "https://10.0.1.1/metrics",
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
    const res = run(["--thoughtNumber=-1"]);
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
    expect(res.stderr).toContain("--thought cannot be empty");
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
    run(["--registerClaim", "test claim"]);
  }

  it("rejects sources that are not parseable URLs", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "not a url", "--claimSource", "also not"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("not a parseable URL");
  });

  it("treats same-domain scheme-less sources as one root domain", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "example.com/a", "--claimSource", "example.com/b"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("distinct root domains");
  });

  it("still accepts distinct scheme-less domains", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "example.com/x", "--claimSource", "other.org/y"]);
    expect(res.code).toBe(0);
  });
});

describe("Audit 2: the first thought must carry --mode", () => {
  it("rejects a first thought without --mode even if mode was set via a side-command", () => {
    const reg = run(["--mode", "path-b", "--registerHypothesis", "H1"]);
    expect(reg.code).toBe(0);
    const res = run(["--thought", "first", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mode is required on the first thought");
  });
});

describe("Audit 3: multi-segment suffix coverage", () => {
  function setupClaim() {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerClaim", "test claim"]);
  }

  it("recognizes distinct registrable domains under co.nz", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.co.nz/x", "--claimSource", "https://b.co.nz/y"]);
    expect(res.code).toBe(0);
  });

  it("recognizes distinct registrable domains under netlify.app", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://foo.netlify.app/a", "--claimSource", "https://bar.netlify.app/b"]);
    expect(res.code).toBe(0);
  });

  it("still rejects two hosts sharing one ordinary domain", () => {
    setupClaim();
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.x.com/1", "--claimSource", "https://b.x.com/2"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("distinct root domains");
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
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("already rejected");
  });

  it("still allows merging into a pending or selected hypothesis", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
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
    const res = run(["--thoughtNumber", "1e1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--thoughtNumber must be an integer >= 1");
  });

  it("rejects hex notation for --totalThoughts", () => {
    const res = run(["--totalThoughts", "0x10"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--totalThoughts must be an integer >= 1");
  });

  it("rejects leading/trailing whitespace", () => {
    const res = run(["--thoughtNumber= 5"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--thoughtNumber must be an integer >= 1");
  });
});
