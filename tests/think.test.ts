import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "child_process";
import { unlinkSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
// Bun runs test files in parallel, and two concurrent `bun test` invocations
// must not share files either — the pid keeps each process to its own state.
const STATE_FILE = join(CWD, "tests", `.think_state.think-${process.pid}.json`);
process.env.THINK_STATE_FILE = STATE_FILE;

/** Minimal state shape consumed by tests. */
interface StateShape {
  schemaVersion?: number;
  thoughtHistory: Array<{ thought: string; [k: string]: unknown }>;
  claims: Record<string, { status: string; statement?: string; registeredAtThought?: number; supports?: string; quote?: string; negativeQuery?: string; negativeFinding?: string }>;
  hypotheses?: Record<string, { status: string; mergedInto?: string; falsification?: string; falsificationResult?: string }>;
  acceptanceCriteria?: Array<{ id: string; criterion: string; met?: boolean; notes?: string; checkedAtThought?: number }>;
  lenses?: Array<{ lens: string; finding: string; atThought?: number }>;
  auditTrail?: Array<{ op: string }>;
  [k: string]: unknown;
}

/**
 * Execute think.ts with an argv array — no shell, so `$`/backtick/`\`
 * inside flag values reach think.ts intact on every platform.
 */
function run(argv: string[], env?: Record<string, string>): { stdout: string; stderr: string; code: number } {
  // spawnSync captures stderr on success too — execFileSync drops it when
  // the process exits 0, which would hide warnings (e.g. corrupt-state notice).
  const res = spawnSync("bun", [SCRIPT, ...argv], {
    cwd: CWD,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? 1,
  };
}

function readState(): StateShape {
  return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as StateShape;
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

describe("think.ts: termination gate (failure point 3)", () => {
  it("marks session terminated on nextThoughtNeeded=false and rejects further thoughts", () => {
    // Path A: 3 thoughts, the last with nextThoughtNeeded=false → session ends
    run(["--mode", "path-a", "--thought", "restate", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--thought", "derive", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--thought", "cross-validate", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    // A further thought must be rejected — session is over; --reset is required
    const res = run(["--thought", "afterthought", "--thoughtNumber", "4", "--totalThoughts", "4", "--nextThoughtNeeded", "false"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/terminat/i);
  });

  it("rejects side-commands on a terminated Path B session", () => {
    // Build a terminating Path B session: 2+ thoughts, 2 hypotheses resolved.
    run(["--mode", "path-b", "--thought", "decompose", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "option A", "--falsification", "f"]);
    run(["--registerHypothesis", "option B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--thought", "second round", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const done = run(["--thought", "synthesize and conclude", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });
    expect(done.code).toBe(0);
    // Session terminated — every side-command must now exit 1.
    const reg = run(["--registerHypothesis", "late hypothesis"]);
    expect(reg.code).toBe(1);
    expect(reg.stderr).toMatch(/terminat/i);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/terminat/i);
    const cl = run(["--registerClaim", "late claim"]);
    expect(cl.code).toBe(1);
    expect(cl.stderr).toMatch(/terminat/i);
    const ver = run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimNotes", "x"]);
    expect(ver.code).toBe(1);
    expect(ver.stderr).toMatch(/terminat/i);
  });
});

describe("think.ts: corrupt state file (failure point 2)", () => {
  it("warns to stderr and backs up corrupt state to .bak instead of silent reset", () => {
    // Write garbage directly into the state file
    const { writeFileSync } = require("fs");
    writeFileSync(STATE_FILE, "{ this is not json !!!");
    const res = run(["--status"]);
    // Must NOT silently swallow: warn on stderr and preserve the corrupt file
    expect(res.stderr).toMatch(/corrupt|invalid|parse/i);
    expect(existsSync(STATE_FILE + ".bak")).toBe(true);
    expect(res.code).toBe(0);
  });
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
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    const res1 = run(["--registerClaim", "Claim Alpha statement", "--supports", "hyp-1"]);
    expect(res1.code).toBe(0);
    expect(res1.stdout).toContain('"registered": "claim-1"');
    expect(res1.stdout).toContain('"status": "pending"');

    const res2 = run(["--registerClaim", "Claim Beta statement", "--supports", "hyp-1"]);
    expect(res2.code).toBe(0);
    expect(res2.stdout).toContain('"registered": "claim-2"');
  });

  it("records registeredAtThought as the last completed thought index", () => {
    run(["--mode", "path-b", "--thought", "First thought", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Registered after thought 1", "--supports", "hyp-1"]);
    const status = JSON.parse(run(["--status"]).stdout);
    expect(status.claimDetails["claim-1"].registeredAtThought).toBe(1);
  });

  it("stores $-containing flag values byte-for-byte (no shell expansion)", () => {
    // A shell expanding argv (`"$500K"` under bash → "00K") would corrupt the
    // statement before think.ts sees it; this pins the storage contract and
    // fails if run() ever regresses to shell-string execution on POSIX.
    const statement = "Direct API price is $500K/yr vs $186K/yr self-hosted";
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    const reg = run(["--registerClaim", statement, "--supports", "hyp-1"]);
    expect(reg.code).toBe(0);

    const thought = "Cost delta: $1.15M vs $3 per 1M tokens";
    const t = run([
      "--mode", "path-b",
      "--thought", thought,
      "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true",
    ]);
    expect(t.code).toBe(0);

    const state = readState();
    expect(state.claims["claim-1"].statement).toBe(statement);
    expect(state.thoughtHistory[0].thought).toBe(thought);
  });

  it("fails verification with verified status if fewer than 2 sources provided", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Claim statement requiring dual sources", "--supports", "hyp-1"]);
    const failRes = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://source1.com"]);
    expect(failRes.code).not.toBe(0);
    expect(failRes.stderr).toContain("requires at least 2 independent --claimSource arguments");
  });

  it("succeeds verification with verified status when 2 or more sources provided", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Claim statement requiring dual sources", "--supports", "hyp-1"]);
    const okRes = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://source1.com", "--claimSource", "https://source2.com", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(okRes.code).toBe(0);
    expect(okRes.stdout).toContain('"status": "verified"');
  });

  it("rejects verified when 2 sources share the same root domain", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Claim backed only by subdomains of one root domain", "--supports", "hyp-1"]);
    const failRes = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://docs.aws.amazon.com/some/doc", "--claimSource", "https://aws.amazon.com/some/page"]);
    expect(failRes.code).not.toBe(0);
    expect(failRes.stderr).toContain("distinct root domains");
  });

  it("allows single_source, unverified, and not_found with fewer sources", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Single source claim", "--supports", "hyp-1"]);
    const resSingle = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://only-one.com", "--claimNotes", "Single tech blog report"]);
    expect(resSingle.code).toBe(0);
    expect(resSingle.stdout).toContain('"status": "single_source"');

    run(["--registerClaim", "Unfound claim", "--supports", "hyp-1"]);
    const resNotFound = run(["--verifyClaim", "claim-2", "--claimStatus", "not_found", "--claimNotes", "Searched 3 queries; no relevant public records"]);
    expect(resNotFound.code).toBe(0);
    expect(resNotFound.stdout).toContain('"status": "not_found"');
  });

  it("blocks termination when any claim is still pending", () => {
    run(["--mode", "path-b", "--thought", "Decomposing the open question", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Pending claim", "--supports", "hyp-1"]);
    const failTerm = run(["--thought", "Conclusion step", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("Cannot terminate with --nextThoughtNeeded false: 1 claim(s) still pending");
  });

  it("allows termination when all claims are resolved", () => {
    run(["--mode", "path-b", "--thought", "Decomposing the open question", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A", "--falsification", "f"]);
    run(["--registerHypothesis", "H2: Option B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--registerClaim", "Test claim", "--supports", "hyp-2"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "unverified", "--claimNotes", "No search tool available"]);
    run(["--thought", "Synthesizing after verification", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const okTerm = run(["--thought", "Clean conclusion", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });
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
    run(["--registerHypothesis", "H1: Bedrock wins on enterprise IAM + verified feature parity", "--falsification", "f"]);
    run(["--registerHypothesis", "H2: Direct API wins on SDK feature velocity", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);

    // 3. Pre-registration of claims before search
    const reg1 = run(["--registerClaim", "AWS Bedrock supports prompt caching for Claude 3.5 Sonnet", "--supports", "hyp-1"]);
    expect(reg1.code).toBe(0);
    expect(reg1.stdout).toContain('"registered": "claim-1"');

    const reg2 = run(["--registerClaim", "Claude 3.5 Sonnet base token price is $3 input / $15 output per 1M tokens across both platforms", "--supports", "hyp-1"]);
    expect(reg2.code).toBe(0);
    expect(reg2.stdout).toContain('"registered": "claim-2"');

    // 3. Attempt termination before resolving claims -> MUST FAIL
    const premature = run(["--thought", "Trying to terminate early without resolving claims", "--thoughtNumber", "2", "--totalThoughts", "5", "--nextThoughtNeeded", "false"]);
    expect(premature.code).not.toBe(0);
    expect(premature.stderr).toContain("Cannot terminate with --nextThoughtNeeded false: 2 claim(s) still pending");

    // 4. Resolve claim 1 with 2 independent sources
    const v1 = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://aws.amazon.com/bedrock/pricing/", "--claimSource", "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
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
    const t3 = run(["--thought", "Conclusion: Recommend Bedrock for enterprise environments with AWS compliance commitments; Direct API for nimble dev teams. All claims resolved. Terminating.", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });
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
    const failClaim = run(["--registerClaim", "External claim", "--supports", "hyp-1"]);
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
    run(["--registerHypothesis", "H1: Option A is better", "--falsification", "f"]);
    const failTerm = run(["--thought", "Conclusion", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("requires at least 2 hypotheses");
  });

  it("blocks termination if any hypothesis is pending in path-b mode", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A", "--falsification", "f"]);
    run(["--registerHypothesis", "H2: Option B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    const failTerm = run(["--thought", "Conclusion", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("hypotheses still pending");
  });

  it("allows termination when Path B requirements are met", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A", "--falsification", "f"]);
    run(["--registerHypothesis", "H2: Option B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--thought", "Critiquing", "--thoughtNumber", "2", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--thought", "Synthesizing", "--thoughtNumber", "3", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    const okTerm = run(["--thought", "Conclusion", "--thoughtNumber", "4", "--totalThoughts", "4", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });
    expect(okTerm.code).toBe(0);
    expect(okTerm.stdout).toContain("next=false");
  });

  it("blocks termination on the very first thought in path-b mode", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--registerHypothesis", "H1: Option A", "--falsification", "f"]);
    run(["--registerHypothesis", "H2: Option B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    const failTerm = run(["--mode", "path-b", "--thought", "Instant conclusion with no prior reasoning", "--thoughtNumber", "1", "--totalThoughts", "1", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("Path B requires at least 2 prior thoughts");
  });

  it("blocks termination when the previous thought flagged needsMoreThoughts", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1: Option A", "--falsification", "f"]);
    run(["--registerHypothesis", "H2: Option B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    const expand = run(["--thought", "Scope expanded mid-analysis", "--thoughtNumber", "2", "--totalThoughts", "6", "--nextThoughtNeeded", "true", "--needsMoreThoughts"]);
    expect(expand.code).toBe(0);
    const failTerm = run(["--thought", "Trying to conclude right after expansion flag", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(failTerm.code).not.toBe(0);
    expect(failTerm.stderr).toContain("needsMoreThoughts");
  });
});

describe("think.ts: claim caveat enforcement", () => {
  it("rejects single_source without --claimNotes", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Single source claim", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://only-one.com"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("requires --claimNotes");
  });

  it("rejects unverified without --claimNotes", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Unverifiable claim", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "unverified"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("requires --claimNotes");
  });

  it("rejects not_found without --claimNotes", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Unfindable claim", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "not_found"]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("requires --claimNotes");
  });

  it("still allows verified without --claimNotes", () => {
    run(["--mode", "path-b", "--registerHypothesis", "H for claims", "--falsification", "f"]);
    run(["--registerClaim", "Well-sourced claim", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('"status": "verified"');
  });
});

describe("think.ts: hypothesis merge status", () => {
  it("rejects merged without --mergedInto", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B, same mechanism as A", "--falsification", "f"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mergedInto is required");
  });

  it("rejects merging a hypothesis into itself", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("cannot reference the hypothesis being resolved itself");
  });

  it("rejects merging into a nonexistent target", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-99"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("not found in state");
  });

  it("accepts a valid merge and records mergedInto", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B, same mechanism as A", "--falsification", "f"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "same mechanism, different framing"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.status).toBe("merged");
    expect(parsed.mergedInto).toBe("hyp-1");
  });

  it("rejects merging into a hypothesis that is itself merged", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B", "--falsification", "f"]);
    run(["--registerHypothesis", "C", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "n"]);
    const res = run(["--resolveHypothesis", "hyp-3", "--hypothesisStatus", "merged", "--mergedInto", "hyp-2"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("already merged");
  });

  it("rejects merging onward a hypothesis that already absorbs another merge", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B", "--falsification", "f"]);
    run(["--registerHypothesis", "C", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "n"]);
    const res = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-3"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("merge chains are not allowed");
  });

  it("rejects --mergedInto when --hypothesisStatus is not merged", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B", "--falsification", "f"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected", "--mergedInto", "hyp-1"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("--mergedInto");
  });

  it("clears mergedInto when a merged hypothesis is re-resolved to a non-merged status", () => {
    run(["--mode", "path-b", "--thought", "q", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "n"]);
    const res = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.status).toBe("rejected");
    expect(parsed.mergedInto).toBeUndefined();
  });

  it("rejects Path B termination when merges leave fewer than 2 distinct hypotheses", () => {
    run(["--mode", "path-b", "--thought", "decompose", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B, same mechanism as A", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "n"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--thought", "synthesize", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "conclusion", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("distinct hypotheses");
  });

  it("treats a merged hypothesis as resolved for Path B termination", () => {
    run(["--mode", "path-b", "--thought", "decompose", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "f"]);
    run(["--registerHypothesis", "B, same mechanism as A", "--falsification", "f"]);
    run(["--registerHypothesis", "C, a different mechanism", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "n"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-3", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--thought", "synthesize", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "conclusion", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });
    expect(res.code).toBe(0);
  });
});

describe("think.ts: side-command audit trail", () => {
  it("records claim and hypothesis operations in --status auditTrail", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decomposing", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "Audit H1", "--falsification", "f"]);
    run(["--registerHypothesis", "Audit H2", "--falsification", "f"]);
    run(["--registerClaim", "Audit claim A", "--supports", "hyp-1"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "not_found", "--claimNotes", "no public record"]);

    const status = run(["--status"]);
    expect(status.code).toBe(0);
    const parsed = JSON.parse(status.stdout);
    expect(Array.isArray(parsed.auditTrail)).toBe(true);
    const ops = parsed.auditTrail.map((e: { op: string }) => e.op);
    expect(ops).toEqual([
      "registerHypothesis",
      "registerHypothesis",
      "registerClaim",
      "resolveHypothesis",
      "resolveHypothesis",
      "verifyClaim",
    ]);
  });
});

describe("think.ts: --export lint report", () => {
  it("emits a markdown lint report on demand for a terminated Path B session", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decompose the question", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "Hypothesis A", "--falsification", "f"]);
    run(["--registerHypothesis", "Hypothesis B", "--falsification", "f"]);
    run(["--registerClaim", "Claim that is verified", "--supports", "hyp-1"]);
    run(["--registerClaim", "Claim with one source", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    run(["--verifyClaim", "claim-2", "--claimStatus", "single_source", "--claimSource", "https://c.example", "--claimNotes", "only one outlet"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--thought", "Synthesize findings", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--thought", "Conclusion reached", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });

    const res = run(["--export"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("# Reasoning Lint & Fact Sheet");
    expect(res.stdout).toContain("Lint Violations");
    expect(res.stdout).toContain("Hypothesis A");
    expect(res.stdout).toContain("claim-2");
    // The lint report never emits calibrated verdict tags.
    expect(res.stdout).not.toContain("[Confirmed]");
    expect(res.stdout).not.toContain("[Probable]");
  });

  it("auto-emits the lint report after the status line when nextThoughtNeeded=false", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Decompose", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f"]);
    run(["--registerHypothesis", "H2", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--thought", "Synthesize", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--thought", "Final conclusion", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"], { THINK_GATES_OFF: "all" });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("[3/3]");
    expect(res.stdout).toContain("next=false");
    expect(res.stdout).toContain("# Reasoning Lint & Fact Sheet");
    // Zero claims in Path B → INFO question illuminates the escape surface (never CRIT).
    expect(res.stdout).toMatch(/\[INFO\].*claims=0/);
    expect(res.stdout).not.toMatch(/\[CRIT\].*claims=0/);
  });

  it("emits a report mid-session recording unverified claims", () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "Exploring", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f"]);
    run(["--registerClaim", "Unresolved claim", "--supports", "hyp-1"]);
    const res = run(["--export"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("# Reasoning Lint & Fact Sheet");
    expect(res.stdout).toContain("claim-1");
    expect(res.stdout).toMatch(/claim-1.*unverified/);
  });
});

describe("think.ts: THINK_STATE_FILE env isolation", () => {
  it("redirects state writes to THINK_STATE_FILE when set, leaving the default file untouched", () => {
    // Remove any leftover real state so we can prove the env override worked.
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    const altState = join(CWD, "tests", ".think_state.envtest.json");
    if (existsSync(altState)) unlinkSync(altState);
    try {
      const res = spawnSync("bun", [SCRIPT, "--mode", "path-a", "--thought", "isolated", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"], {
        cwd: CWD,
        encoding: "utf-8",
        env: { ...process.env, THINK_STATE_FILE: altState },
      });
      expect(res.status).toBe(0);
      expect(existsSync(altState)).toBe(true);
      expect(existsSync(STATE_FILE)).toBe(false);
    } finally {
      if (existsSync(altState)) unlinkSync(altState);
    }
  });
});

describe("think.ts 2.2.5: conclusion card is a fact sheet, not a verdict", () => {
  const T = (n: number, total: number, next: string, text: string, extra: string[] = [], env?: Record<string, string>) =>
    run(["--thought", text, "--thoughtNumber", String(n), "--totalThoughts", String(total), "--nextThoughtNeeded", next, ...extra], env);
  const startB = () => {
    run(["--reset"]);
    run(["--mode", "path-b", "--thought", "T1", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "Option A", "--falsification", "f"]);
    run(["--registerHypothesis", "Option B", "--falsification", "f"]);
  };

  it("a verified claim shows as linked-verified link-status without emitting verdict tags", () => {
    startB();
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--registerClaim", "Unrelated fact", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://a.example", "--claimSource", "https://b.example", "--claimTier", "1", "--claimTier", "1", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/hyp-1 \[selected\].*Linked-verified|link-status: Linked-verified/);
    expect(out).not.toContain("[Confirmed]");
    expect(out).not.toContain("[Probable]");
  });

  it("Path A card is not penalised and never suggests forbidden --registerClaim", () => {
    run(["--reset"]);
    run(["--mode", "path-a", "--thought", "restate", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    T(2, 3, "true", "derive");
    const res = T(3, 3, "false", "cross-validated: x=4");
    expect(res.stdout).not.toContain("registerClaim");
    expect(res.stdout).not.toContain("Level: Low");
    expect(res.stdout).toContain("n/a (closed-form)");
    expect(res.stdout).toContain("> cross-validated: x=4");
  });

  it("single_source-only link-status is Plausible, never Low or Unverified", () => {
    startB();
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://blog.example/x", "--claimNotes", "one blog"]);
    const out = run(["--export"]).stdout;
    expect(out).not.toContain("[Unverified] Option A");
    expect(out).not.toContain("Level: Low");
    expect(out).toMatch(/Plausible/);
    expect(out).toContain("one blog");
  });

  it("carries hypothesis rationale, all selected, merged targets, trace, and the final thought", () => {
    startB();
    run(["--registerHypothesis", "Option C", "--falsification", "f"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "WHY-A", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-3", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "n"]);
    T(2, 4, "true", "branch", ["--branchFromThought", "1", "--branchId", "alt"]);
    T(3, 4, "true", "revise", ["--isRevision", "--revisesThought", "1"]);
    const out = run(["--export"]).stdout;
    expect(out).toContain("WHY-A");
    expect(out).toContain("hyp-2");
    expect(out).toContain("Merged: hyp-3 → hyp-1");
    expect(out).toContain("revisions: 1, branches: alt");
    expect(out).toContain("> revise");
  });

  it("block-quotes a multi-line final thought so it cannot forge card headings", () => {
    startB();
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    T(2, 4, "true", "T2");
    run(["--recordLens", "--lens", "devil's advocate", "--finding", "f1"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "f2"]);
    const res = T(3, 4, "false", "verdict\n## Fake Heading\n- x", [], { THINK_GATES_OFF: "all" });
    expect(res.stdout).toContain("> ## Fake Heading");
    expect(res.stdout).not.toMatch(/^## Fake Heading/m);
  });

  it("--export refuses to combine with other operations instead of silently dropping them", () => {
    startB();
    const a = run(["--export", "--thought", "lost?", "--thoughtNumber", "2", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    expect(a.code).toBe(1);
    expect(a.stderr).toContain("--export cannot be combined");
    expect(run(["--export", "--registerClaim", "x", "--supports", "hyp-1"]).code).toBe(1);
    expect(run(["--export", "--status"]).code).toBe(1);
    const b = run(["--reset", "--export"]);
    expect(b.code).toBe(1);
    expect(b.stderr).toContain("--export");
    expect(existsSync(STATE_FILE)).toBe(true); // reset did not run
  });

  it("--nextThoughtNeeded rejects typos instead of silently terminating", () => {
    startB();
    for (const bad of ["ture", "yes", "1"]) {
      const res = T(2, 4, bad, "x");
      expect(res.code).toBe(1);
      expect(res.stderr).toContain("must be 'true' or 'false'");
    }
    expect(T(2, 4, "TRUE", "x").code).toBe(0);
  });

  it("verified dual-source check treats a trailing-dot FQDN as the same host", () => {
    startB();
    run(["--registerClaim", "c", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified", "--claimSource", "https://example.com./a", "--claimSource", "https://example.com/b", "--claimQuote", "q", "--negativeQuery", "nq", "--negativeFinding", "nf"]);
    expect(res.code).toBe(1);
  });
});
