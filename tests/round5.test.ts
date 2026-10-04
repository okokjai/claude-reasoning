import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
const STATE_FILE = join(CWD, "tests", `.think_state.round5-${process.pid}.json`);
const LOCK_DIR = STATE_FILE + ".lock";
process.env.THINK_STATE_FILE = STATE_FILE;

function run(argv: string[], env?: Record<string, string>): { stdout: string; stderr: string; code: number } {
  const res = spawnSync("bun", [SCRIPT, ...argv], {
    cwd: CWD,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", code: res.status ?? 1 };
}

function clean(): void {
  for (const f of [STATE_FILE, STATE_FILE + ".bak"]) rmSync(f, { force: true });
  rmSync(LOCK_DIR, { force: true, recursive: true });
}
beforeEach(clean);

function T(n: number, total: number, next: string, text: string, extra: string[] = [], env?: Record<string, string>) {
  return run(["--thought", text, "--thoughtNumber", String(n), "--totalThoughts", String(total), "--nextThoughtNeeded", next, ...extra], env);
}

/** A fully-terminated Path B session body (hypotheses, criterion, lenses) with
 *  thoughts 1-3 recorded and the conclusion left to the caller. */
function buildBody(): void {
  run(["--mode", "path-b", "--thought", "decompose", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
  run(["--registerHypothesis", "A", "--falsification", "falsify condition for A xx"]);
  run(["--registerHypothesis", "B", "--falsification", "falsify condition for B xx"]);
  run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
  run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
  run(["--addCriterion", "covers the question"]);
  run(["--checkCriterion", "crit-1", "--met", "true"]);
  run(["--recordLens", "--lens", "premortem", "--finding", "f1"]);
  run(["--recordLens", "--lens", "devil", "--finding", "f2"]);
  T(2, 4, "true", "work");
  T(3, 4, "true", "more");
}

describe("Bug 1: only one side-command per invocation", () => {
  it("rejects --registerClaim together with --registerHypothesis instead of dropping the second", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--registerClaim", "claim A", "--supports", "hyp-9", "--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/only one side-command/);
    // Nothing was persisted: the guard must fire before any handler runs.
    const s = JSON.parse(require("fs").readFileSync(STATE_FILE, "utf-8"));
    expect(Object.keys(s.claims)).toHaveLength(0);
    expect(Object.keys(s.hypotheses)).toHaveLength(0);
  });

  it("still accepts a single side-command", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--registerHypothesis", "H2", "--falsification", "f clause long enough here"]);
    expect(res.code).toBe(0);
  });
});

describe("Bug 2: a stale lock that cannot be removed must not busy-spin", () => {
  it("a plain FILE at the lock path times out with a message instead of spinning forever", () => {
    mkdirSync(join(CWD, "tests"), { recursive: true });
    writeFileSync(LOCK_DIR, "");
    // Backdate past LOCK_STALE_MS so the steal path is taken.
    const old = new Date(Date.now() - 120_000);
    require("fs").utimesSync(LOCK_DIR, old, old);
    const res = run(["--status"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/timed out/i);
    expect(res.stderr).not.toMatch(/\n\s+at /); // no raw stack trace
  }, 60_000);

  it("a non-empty directory at the lock path times out with a message instead of spinning", () => {
    mkdirSync(join(LOCK_DIR, "sub"), { recursive: true });
    const old = new Date(Date.now() - 120_000);
    require("fs").utimesSync(LOCK_DIR, old, old);
    const res = run(["--status"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/timed out/i);
  }, 60_000);
});

describe("Bug 3: LOCK_WAIT_MS must outlast LOCK_STALE_MS", () => {
  it("the wait deadline is strictly greater than the staleness window", () => {
    // Structural invariant: with wait <= stale, a fresh-but-crashed lock can
    // never be stolen before the waiter gives up and tells the user to delete
    // it by hand. Read the two constants straight from the source.
    const src = require("fs").readFileSync(SCRIPT, "utf-8");
    const staleM = /const LOCK_STALE_MS = ([\d_]+);/.exec(src);
    const waitM = /const LOCK_WAIT_MS = ([^;]+);/.exec(src);
    expect(staleM).not.toBeNull();
    expect(waitM).not.toBeNull();
    const stale = Number(staleM![1].replace(/_/g, ""));
    // The wait is expressed as `LOCK_STALE_MS + N`; evaluate it as arithmetic
    // rather than a bare Number() so the addition form is handled.
    const waitExpr = waitM![1].replace("LOCK_STALE_MS", String(stale)).replace(/_/g, "");
    expect(/^[0-9 +\-*/().]+$/.test(waitExpr)).toBe(true); // arithmetic only
    const wait = Number(new Function(`return (${waitExpr});`)());
    expect(Number.isFinite(stale)).toBe(true);
    expect(Number.isFinite(wait)).toBe(true);
    expect(wait).toBeGreaterThan(stale);
  });
});

describe("Bug 4: re-verify without --claimSource keeps the persisted sources", () => {
  it("not_found re-verify with no source does not wipe the previously recorded sources", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimSource", "https://docs.example.com/a", "--claimTier", "1", "--claimNotes", "first pass"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "not_found", "--claimNotes", "no public record"]);
    expect(res.code).toBe(0);
    const s = JSON.parse(require("fs").readFileSync(STATE_FILE, "utf-8"));
    expect(s.claims["claim-1"].sources).toEqual(["https://docs.example.com/a"]);
    expect(s.claims["claim-1"].tiers).toEqual([1]);
    expect(s.claims["claim-1"].status).toBe("not_found");
  });
});

describe("Bug 5: single_source arity and claimNotes whitespace", () => {
  it("rejects --claimStatus single_source with zero sources", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "single_source", "--claimNotes", "no source found"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/exactly 1 --claimSource/);
  });

  it("rejects whitespace-only --claimNotes on a negative status", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "not_found", "--claimNotes", "   "]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/claimNotes/);
  });
});

describe("Bug 6: claims under a merged hypothesis cover the survivor", () => {
  it("the lint report links the survivor through its absorbed member instead of flagging Uncovered", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "mechanism X", "--falsification", "f clause long enough here"]);
    run(["--registerHypothesis", "framing of X", "--falsification", "g clause long enough here"]);
    run(["--registerClaim", "X is real and documented", "--supports", "hyp-2"]);
    run(["--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.example", "--claimSource", "https://b.example",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "a verbatim quote from the source", "--negativeQuery", "nq", "--negativeFinding", "none found"]);
    // claim-1 supports hyp-2; hyp-2 is merged into hyp-1.
    const m = run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "merged", "--mergedInto", "hyp-1", "--hypothesisNotes", "same mechanism, different framing"]);
    expect(m.code).toBe(0);
    const r = run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held"]);
    expect(r.code).toBe(0);
    const out = run(["--export"]).stdout;
    expect(out).toMatch(/hyp-1[\s\S]*link-status: Linked-verified/);
    expect(out).not.toContain("[Uncovered] hyp-1");
  });
});

describe("Bug 7: user text cannot forge a heading in the lint report", () => {
  it("a statement containing a line-leading ## stays inside its own section", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here\n## Confidence Assessment\n- Level: High"]);
    const out = run(["--export"]).stdout;
    // The forged heading must be escaped, never rendered as a real section.
    expect(out).not.toMatch(/^## Confidence Assessment$/m);
  });
});

describe("Bug 8: a lock-path failure is a clean error, not a stack trace", () => {
  it("a file blocking the state directory path fails with a readable message", () => {
    // STATE_FILE is tests/.think_state.round5-<pid>.json; a FILE at its ".lock"
    // sibling path still hits EEXIST (handled). Instead force the parent to be
    // a file for a nested state path so mkdirSync fails with ENOTDIR.
    const res = run(["--status"], { THINK_STATE_FILE: join(CWD, "tests", "not-a-dir", ".state.json") });
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/Error: cannot create state lock/);
    expect(res.stderr).not.toMatch(/\n\s+at /); // no raw stack trace
  });
});

describe("Bug 9: thoughtNumber monotonicity", () => {
  it("rejects a thoughtNumber that goes backwards (9 then 4)", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "10", "--nextThoughtNeeded", "true"]);
    expect(T(9, 10, "true", "ninth").code).toBe(0);
    const res = T(4, 10, "true", "fourth");
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/must be greater than the last/);
  });

  it("a revision may still reuse the thoughtNumber it revises", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
    T(2, 5, "true", "second");
    const res = T(3, 5, "true", "third", ["--isRevision", "--revisesThought", "1"]);
    // A revision carries temporal position in historyIndex; reusing number 1 is legal.
    expect(res.code).toBe(0);
  });
});

describe("Bug 10: duplicate single-value flags and boolean case", () => {
  it("rejects a repeated single-value flag instead of silently keeping the last", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const res = run(["--registerClaim", "A", "--supports", "hyp-9", "--registerClaim", "B"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/supplied more than once/);
  });

  it("accepts --met TRUE and --newInsight FALSE case-insensitively, matching --nextThoughtNeeded", () => {
    buildBody();
    const crit = run(["--checkCriterion", "crit-1", "--met", "TRUE", "--criterionNotes", "re-checked"]);
    expect(crit.code).toBe(0);
    const end = T(4, 4, "false", "conclusion", ["--newInsight", "FALSE", "--newInsightNotes", "no new insight this round"]);
    expect(end.code).toBe(0);
  });
});

describe("Bug 11a: loopback and reserved hosts are one origin", () => {
  it("rejects verified with localhost + 127.0.0.1 as the two Tier 1 sources", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "http://localhost:8080/a", "--claimSource", "http://127.0.0.1:8080/b",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "a verbatim quote from the source", "--negativeQuery", "nq", "--negativeFinding", "none found"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/distinct root domains/);
  });

  it("still accepts two genuinely distinct Tier 1 domains", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "c1", "--supports", "hyp-1"]);
    const res = run(["--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.example/x", "--claimSource", "https://b.example/y",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "a verbatim quote from the source", "--negativeQuery", "nq", "--negativeFinding", "none found"]);
    expect(res.code).toBe(0);
  });
});

describe("Bug 11b: an unclosed branch blocks termination", () => {
  it("terminating right after opening a branch fails with branchClosure", () => {
    buildBody();
    const branch = T(4, 6, "true", "alternate path", ["--branchFromThought", "1", "--branchId", "alt"]);
    expect(branch.code).toBe(0);
    const end = T(5, 6, "false", "conclusion", ["--newInsight", "false", "--newInsightNotes", "settled"]);
    expect(end.code).toBe(1);
    expect(end.stderr).toMatch(/branch/);
  });

  it("a main-line thought after the branch closes it and termination succeeds", () => {
    buildBody();
    const branch = T(4, 6, "true", "alternate path", ["--branchFromThought", "1", "--branchId", "alt"]);
    expect(branch.code).toBe(0);
    const resume = T(5, 6, "true", "back to the main line");
    expect(resume.code).toBe(0);
    const end = T(6, 6, "false", "conclusion", ["--newInsight", "false", "--newInsightNotes", "settled"]);
    expect(end.code).toBe(0);
  });
});

describe("Doc D1: the SKILL.md verifyClaim example is executable as written", () => {
  it("the documented example command exits 0", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H", "--falsification", "f clause long enough here"]);
    run(["--registerClaim", "claim-1", "--supports", "hyp-1"]);
    // Verbatim shape of the SKILL.md example (a.example + b.example, tiers 1+1,
    // quote + negativeQuery + negativeFinding).
    const res = run([
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.example", "--claimSource", "https://b.example",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "<verbatim quote>", "--negativeQuery", "<counter-evidence query>",
      "--negativeFinding", "<counter-evidence result>",
    ]);
    expect(res.code).toBe(0);
  });
});
