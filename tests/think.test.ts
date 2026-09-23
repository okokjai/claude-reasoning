import { describe, it, expect, beforeEach } from "bun:test";
import { execFileSync } from "child_process";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
const STATE_FILE = join(CWD, "scripts", ".think_state.json");

interface ExecError extends Error {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
  status?: number;
}

/** Minimal state shape consumed by tests. */
interface StateShape {
  thoughtHistory: Array<{ thought: string; [k: string]: unknown }>;
  claims: Record<string, { status: string; statement?: string; registeredAtThought?: number }>;
  hypotheses?: Record<string, { status: string; mergedInto?: string }>;
  auditTrail?: Array<{ op: string }>;
  [k: string]: unknown;
}

/**
 * Execute think.ts with an argv array — no shell, so `$`/backtick/`\`
 * inside flag values reach think.ts intact on every platform.
 */
function run(argv: string[]): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync("bun", [SCRIPT, ...argv], {
      cwd: CWD,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", code: 0 };
  } catch (err: unknown) {
    const e = err as ExecError;
    return {
      stdout: e.stdout ? e.stdout.toString() : "",
      stderr: e.stderr ? e.stderr.toString() : e.message,
      code: e.status || 1,
    };
  }
}

function readState(): StateShape {
  return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as StateShape;
}

beforeEach(() => {
  if (existsSync(STATE_FILE)) {
    try {
      unlinkSync(STATE_FILE);
    } catch {}
  }
});

describe("think.ts: basic thinking loop", () => {
  it("resets state successfully", () => {
    const res = run(["--reset"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('"status": "reset"');
    const status = run(["--status"]);
    expect(status.stdout).toContain('"thoughtHistoryLength": 0');
  });

  it("requires --mode on the first thought of a session", () => {
    const res = run(["--thought", "Unclassified thought", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("--mode is required on the first thought of a session");
  });

  it("submits sequential thoughts", () => {
    const res1 = run(["--mode", "path-a", "--thought", "First analysis", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res1.code).toBe(0);
    expect(res1.stdout).toContain("[1/3] history=1 mode=path-a next=true");

    const res2 = run(["--thought", "Second analysis", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res2.code).toBe(0);
    expect(res2.stdout).toContain("[2/3] history=2 mode=path-a next=true");
  });

  it("locks the mode once the session is classified", () => {
    run(["--mode", "path-a", "--thought", "Classified closed-form", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--mode", "path-b", "--thought", "Attempting to switch", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("Step 0 classification is immutable");
  });

  it("supports revisions and branching", () => {
    run(["--mode", "path-a", "--thought", "Initial thought", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const rev = run(["--thought", "Corrected thought", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--isRevision", "--revisesThought", "1"]);
    expect(rev.code).toBe(0);

    const branch = run(["--thought", "Branch path", "--thoughtNumber", "3", "--totalThoughts", "4", "--nextThoughtNeeded", "true", "--branchFromThought", "1", "--branchId", "alt-1"]);
    expect(branch.code).toBe(0);
    expect(branch.stdout).toContain("branches=alt-1");
  });
});

describe("think.ts: claim pre-registration and lifecycle", () => {
  it("pre-registers claims with sequential IDs and pending status", () => {
    const res1 = run(["--registerClaim", "Claim Alpha statement"]);
    expect(res1.code).toBe(0);
    expect(res1.stdout).toContain('"registered": "claim-1"');
    expect(res1.stdout).toContain('"status": "pending"');

    const res2 = run(["--registerClaim", "Claim Beta statement"]);
    expect(res2.code).toBe(0);
    expect(res2.stdout).toContain('"registered": "claim-2"');
  });

  it("records registeredAtThought as the last completed thought index", () => {
    run(["--mode", "path-b", "--thought", "First thought", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerClaim", "Registered after thought 1"]);
    const status = JSON.parse(run(["--status"]).stdout);
    expect(status.claimDetails["claim-1"].registeredAtThought).toBe(1);
  });

  it("stores $-containing flag values byte-for-byte (no shell expansion)", () => {
    // A shell expanding argv (`"$500K"` under bash → "00K") would corrupt the
    // statement before think.ts sees it; this pins the storage contract and
    // fails if run() ever regresses to shell-string execution on POSIX.
    const statement = "Direct API price is $500K/yr vs $186K/yr self-hosted";
    const reg = run(["--mode", "path-b", "--registerClaim", statement]);
    expect(reg.code).toBe(0);

    const thought = "Cost delta: $1.15M vs $3 per 1M tokens";
    const t = run([
      "--thought", thought,
      "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true",
    ]);
    expect(t.code).toBe(0);

    const state = readState();
    expect(state.claims["claim-1"].statement).toBe(statement);
    expect(state.thoughtHistory[0].thought).toBe(thought);
  });

  it("fails verification with verified status if fewer than 2 sources provided", () => {
    run(["--registerClaim", "Claim statement requiring dual sources"]);
    const failRes = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://source1.com"]);
    expect(failRes.code).not.toBe(0);
    expect(failRes.stderr).toContain("requires at least 2 independent --claimSource arguments");
  });

  it("succeeds verification with verified status when 2 or more sources provided", () => {
    run(["--registerClaim", "Claim statement requiring dual sources"]);
    const okRes = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://source1.com", "--claimSource", "https://source2.com"]);
    expect(okRes.code).toBe(0);
    expect(okRes.stdout).toContain('"status": "verified"');
  });

  it("rejects verified when 2 sources share the same root domain", () => {
    run(["--registerClaim", "Claim backed only by subdomains of one root domain"]);
    const failRes = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://docs.aws.amazon.com/some/doc", "--claimSource", "https://aws.amazon.com/some/page"]);
    expect(failRes.code).not.toBe(0);
    expect(failRes.stderr).toContain("distinct root domains");
  });

  it("allows single_source, unverified, and not_found with fewer sources", () => {
    run(["--registerClaim", "Single source claim"]);
    const resSingle = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://only-one.com", "--claimNotes", "Single tech blog report"]);
    expect(resSingle.code).toBe(0);
    expect(resSingle.stdout).toContain('"status": "single_source"');

    run(["--registerClaim", "Unfound claim"]);
    const resNotFound = run(["--verifyClaim", "claim-2", "--claimStatus", "not_found", "--claimNotes", "Searched 3 queries; no relevant public records"]);
    expect(resNotFound.code).toBe(0);
    expect(resNotFound.stdout).toContain('"status": "not_found"');
  });

  it("blocks termination when any claim is still pending", () => {
    run(["--mode", "path-b", "--thought", "Decomposing the open question", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerClaim", "Pending claim"]);
    const failTerm = run(["--thought", "Conclusion step", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("Cannot terminate with --nextThoughtNeeded false: 1 claim(s) still pending");
  });

  it("allows termination when all claims are resolved", () => {
    run(["--mode", "path-b", "--thought", "Decomposing the open question", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A"]);
    run(["--registerHypothesis", "H2: Option B"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected"]);
    run(["--registerClaim", "Test claim"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimNotes", "No search tool available"]);
    run(["--thought", "Synthesizing after verification", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const okTerm = run(["--thought", "Clean conclusion", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(okTerm.code).toBe(0);
    expect(okTerm.stdout).toContain("[3/3]");
    expect(okTerm.stdout).toContain("next=false");
  });
});

describe("integration: Scenario 1 - Path A Closed-form logic trap", () => {
  it("completes in 3 thoughts with independent verification and 0 claims", () => {
    run(["--reset"]);

    const t1 = run(["--mode", "path-a", "--thought", "Problem restatement: A has 3 brothers, each brother has 2 sisters. Implicit assumption: shared nuclear family siblings. Trapping point: brothers share the same sisters.", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(t1.code).toBe(0);
    expect(t1.stdout).toContain("[1/3] history=1 mode=path-a next=true");

    const t2 = run(["--thought", "Primary derivation: Total boys = 1 (A) + 3 = 4. Total girls = 2. Total children = 4 + 2 = 6.", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(t2.code).toBe(0);
    expect(t2.stdout).toContain("[2/3] history=2 mode=path-a next=true");

    const t3 = run(["--thought", "Independent cross-validation via set theory: C = B union G. |B| = 4, |G| = 2, B intersect G = empty. For all b in B, sisters(b) = G with |G| = 2. Total |C| = 6. Both methods agree. Terminating.", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(t3.code).toBe(0);
    expect(t3.stdout).toContain("[3/3] history=3 mode=path-a next=false");

    const status = run(["--status"]);
    expect(status.stdout).toContain('"claims": []');
    expect(status.stdout).toContain('"thoughtHistoryLength": 3');
  });
});

describe("integration: Scenario 2 - Path B Open-ended with External Verification", () => {
  it("enforces pre-registration, 2-source verification, and clean termination", () => {
    run(["--reset"]);

    // 1. Decompose
    const t1 = run(["--mode", "path-b", "--thought", "Decompose sub-problems: 1. Pricing parity between direct API and AWS Bedrock. 2. Feature parity: does Bedrock support Claude 3.5 Sonnet Prompt Caching? 3. Tradeoffs: IAM governance vs feature velocity.", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    expect(t1.code).toBe(0);

    // 2. Competing hypotheses required by Path B
    run(["--registerHypothesis", "H1: Bedrock wins on enterprise IAM + verified feature parity"]);
    run(["--registerHypothesis", "H2: Direct API wins on SDK feature velocity"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected"]);

    // 3. Pre-registration of claims before search
    const reg1 = run(["--registerClaim", "AWS Bedrock supports prompt caching for Claude 3.5 Sonnet"]);
    expect(reg1.code).toBe(0);
    expect(reg1.stdout).toContain('"registered": "claim-1"');

    const reg2 = run(["--registerClaim", "Claude 3.5 Sonnet base token price is $3 input / $15 output per 1M tokens across both platforms"]);
    expect(reg2.code).toBe(0);
    expect(reg2.stdout).toContain('"registered": "claim-2"');

    // 3. Attempt termination before resolving claims -> MUST FAIL
    const premature = run(["--thought", "Trying to terminate early without resolving claims", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "false"]);
    expect(premature.code).not.toBe(0);
    expect(premature.stderr).toContain("Cannot terminate with --nextThoughtNeeded false: 2 claim(s) still pending");

    // 4. Resolve claim 1 with 2 independent sources
    const v1 = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://aws.amazon.com/bedrock/pricing/", "--claimSource", "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching"]);
    expect(v1.code).toBe(0);
    expect(v1.stdout).toContain('"status": "verified"');

    // 5. Resolve claim 2 with single source + explicit caveat
    const v2 = run(["--verifyClaim", "claim-2", "--claimStatus", "single_source", "--claimSource", "https://aws.amazon.com/bedrock/pricing/", "--claimNotes", "Verified on AWS pricing sheet; Anthropic page not fetched in this turn"]);
    expect(v2.code).toBe(0);
    expect(v2.stdout).toContain('"status": "single_source"');

    // 6. Continue reasoning with verified facts
    const t2 = run(["--thought", "Synthesis: Prompt caching is verified across both platforms. Pricing parity verified on AWS side; single-source uncertainty noted. Critical lens: enterprise IAM favors Bedrock, while rapid SDK releases favor Direct API.", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    expect(t2.code).toBe(0);

    // 7. Converge and terminate
    const t3 = run(["--thought", "Conclusion: Recommend Bedrock for enterprise environments with AWS compliance commitments; Direct API for nimble dev teams. All claims resolved. Terminating.", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(t3.code).toBe(0);
    expect(t3.stdout).toContain("[3/3]");
    expect(t3.stdout).toContain("claims=claim-1,claim-2");
    expect(t3.stdout).toContain("next=false");
  });
});

describe("think.ts: Path A Hard Gates", () => {
  it("blocks termination before 3 thoughts in path-a mode", () => {
    run(["--reset"]);
    run(["--mode", "path-a", "--thought", "Restating problem", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const failTerm = run(["--thought", "Conclusion too early", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("Path A requires at least 3 thoughts");
  });

  it("forbids external claims in path-a mode", () => {
    run(["--reset"]);
    run(["--mode", "path-a", "--thought", "Restating problem", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const failClaim = run(["--registerClaim", "External claim"]);
    expect(failClaim.code).not.toBe(0);
    expect(failClaim.stderr).toContain("Path A (closed-form) forbids external claims");
  });

  it("allows termination at the 3rd thought in path-a mode", () => {
    run(["--reset"]);
    run(["--mode", "path-a", "--thought", "Restating", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--thought", "Deriving", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const okTerm = run(["--thought", "Cross-validating", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(okTerm.code).toBe(0);
    expect(okTerm.stdout).toContain("next=false");
  });
});

describe("think.ts: Path B Hard Gates", () => {
  it("blocks termination with fewer than 2 hypotheses in path-b mode", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A is better"]);
    const failTerm = run(["--thought", "Conclusion", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("requires at least 2 hypotheses");
  });

  it("blocks termination if any hypothesis is pending in path-b mode", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A"]);
    run(["--registerHypothesis", "H2: Option B"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    const failTerm = run(["--thought", "Conclusion", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("hypotheses still pending");
  });

  it("allows termination when Path B requirements are met", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A"]);
    run(["--registerHypothesis", "H2: Option B"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected"]);
    run(["--thought", "Critiquing", "--thoughtNumber", "2", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--thought", "Synthesizing", "--thoughtNumber", "3", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    const okTerm = run(["--thought", "Conclusion", "--thoughtNumber", "4", "--totalThoughts", "4", "--nextThoughtNeeded", "false"]);
    expect(okTerm.code).toBe(0);
    expect(okTerm.stdout).toContain("next=false");
  });

  it("blocks termination on the very first thought in path-b mode", () => {
    run(["--reset"]);
    run(["--registerHypothesis", "H1: Option A"]);
    run(["--registerHypothesis", "H2: Option B"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected"]);
    const failTerm = run(["--mode", "path-b", "--thought", "Instant conclusion with no prior reasoning", "--thoughtNumber", "1", "--totalThoughts", "1", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("Path B requires at least 2 prior thoughts");
  });

  it("blocks termination when the previous thought flagged needsMoreThoughts", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A"]);
    run(["--registerHypothesis", "H2: Option B"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected"]);
    const expand = run(["--thought", "Scope expanded mid-analysis", "--thoughtNumber", "2", "--totalThoughts", "6", "--nextThoughtNeeded", "true", "--needsMoreThoughts"]);
    expect(expand.code).toBe(0);
    const failTerm = run(["--thought", "Trying to conclude right after expansion flag", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("needsMoreThoughts");
  });
});

describe("think.ts: claim caveat enforcement", () => {
  it("rejects single_source without --claimNotes", () => {
    run(["--registerClaim", "Single source claim"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://only-one.com"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("requires --claimNotes");
  });

  it("rejects unverified without --claimNotes", () => {
    run(["--registerClaim", "Unverifiable claim"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "unverified"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("requires --claimNotes");
  });

  it("rejects not_found without --claimNotes", () => {
    run(["--registerClaim", "Unfindable claim"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "not_found"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("requires --claimNotes");
  });

  it("still allows verified without --claimNotes", () => {
    run(["--registerClaim", "Well-sourced claim"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('"status": "verified"');
  });
});

describe("think.ts: hypothesis merge status", () => {
  it("rejects merged without --mergedInto", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B, same mechanism as A"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mergedInto is required");
  });

  it("rejects merging a hypothesis into itself", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("cannot reference the hypothesis being resolved itself");
  });

  it("rejects merging into a nonexistent target", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-99"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("not found in state");
  });

  it("accepts a valid merge and records mergedInto", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B, same mechanism as A"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "same mechanism, different framing"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.status).toBe("merged");
    expect(parsed.mergedInto).toBe("hyp-1");
  });

  it("rejects merging into a hypothesis that is itself merged", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B"]);
    run(["--registerHypothesis", "C"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    const res = run(["--resolveHypothesis", "hyp-3", "--hypothesisStatus", "merged", "--mergedInto", "hyp-2"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("already merged");
  });

  it("rejects merging onward a hypothesis that already absorbs another merge", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B"]);
    run(["--registerHypothesis", "C"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-3"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("merge chains are not allowed");
  });

  it("rejects --mergedInto when --hypothesisStatus is not merged", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected", "--mergedInto", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mergedInto");
  });

  it("clears mergedInto when a merged hypothesis is re-resolved to a non-merged status", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.status).toBe("rejected");
    expect(parsed.mergedInto).toBeUndefined();
  });

  it("rejects Path B termination when merges leave fewer than 2 distinct hypotheses", () => {
    run(["--mode", "path-b", "--thought", "decompose", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B, same mechanism as A"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    run(["--thought", "synthesize", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "conclusion", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("distinct hypotheses");
  });

  it("treats a merged hypothesis as resolved for Path B termination", () => {
    run(["--mode", "path-b", "--thought", "decompose", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A"]);
    run(["--registerHypothesis", "B, same mechanism as A"]);
    run(["--registerHypothesis", "C, a different mechanism"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    run(["--resolveHypothesis", "hyp-3", "--hypothesisStatus", "rejected"]);
    run(["--thought", "synthesize", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "conclusion", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(res.code).toBe(0);
  });
});

describe("think.ts: side-command audit trail", () => {
  it("records claim and hypothesis operations in --status auditTrail", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerClaim", "Audit claim A"]);
    run(["--registerHypothesis", "Audit H1"]);
    run(["--registerHypothesis", "Audit H2"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "not_found", "--claimNotes", "no public record"]);

    const status = run(["--status"]);
    expect(status.code).toBe(0);
    const parsed = JSON.parse(status.stdout);
    expect(Array.isArray(parsed.auditTrail)).toBe(true);
    const ops = parsed.auditTrail.map((e: { op: string }) => e.op);
    expect(ops).toEqual([
      "registerClaim",
      "registerHypothesis",
      "registerHypothesis",
      "resolveHypothesis",
      "resolveHypothesis",
      "verifyClaim",
    ]);
  });
});
