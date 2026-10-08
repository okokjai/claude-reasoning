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
describe("Task 3: pendingActions pure function + integration", () => {
  beforeEach(() => {
    if (existsSync(STATE)) unlinkSync(STATE);
  });

  it("thought status line includes ready= and blockers=", () => {
    const r = run([
      "--mode", "path-b",
      "--thought", "t1",
      "--thoughtNumber", "1",
      "--totalThoughts", "5",
      "--nextThoughtNeeded", "true",
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ready=(yes|no) blockers=\d+/);
  });

  it("side-command JSON includes next array", () => {
    run([
      "--mode", "path-b",
      "--thought", "t1",
      "--thoughtNumber", "1",
      "--totalThoughts", "5",
      "--nextThoughtNeeded", "true",
    ]);
    const r = run(["--registerHypothesis", "test", "--falsification", "f"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(Array.isArray(j.next)).toBe(true);
    expect(j.next.length).toBeGreaterThan(0);
  });

  it("--status includes pending array", () => {
    const s = run(["--status"]);
    expect(s.code).toBe(0);
    const j = JSON.parse(s.out);
    expect(Array.isArray(j.pending)).toBe(true);
  });

  it("pendingActions returns blockers for incomplete session", () => {
    run([
      "--mode", "path-b",
      "--thought", "t1",
      "--thoughtNumber", "1",
      "--totalThoughts", "5",
      "--nextThoughtNeeded", "true",
    ]);
    const s = run(["--status"]);
    const j = JSON.parse(s.out);
    expect(j.pending.length).toBeGreaterThan(0);

    // Termination should fail
    const term = run([
      "--thought", "conclude early",
      "--thoughtNumber", "2",
      "--totalThoughts", "5",
      "--nextThoughtNeeded", "false",
    ]);
    expect(term.code).toBe(1);
  });

  it("pendingActions empty ⇔ termination succeeds", () => {
    // Build a complete Path B session (hyps resolved, criteria checked, lenses recorded, convergence declared)
    run(["--mode", "path-b", "--thought", "t1 decompose", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "falsify H1 condition"]);
    run(["--registerHypothesis", "H2", "--falsification", "falsify H2 condition"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "notes 1", "--falsificationResult", "held"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "notes 2", "--falsificationResult", "broken"]);
    run(["--addCriterion", "crit 1"]);
    run(["--checkCriterion", "crit-1", "--met", "true"]);
    run(["--recordLens", "--lens", "first-principles", "--finding", "Irreducible constraint findings"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "Red team catastrophic collapse findings"]);
    run(["--thought", "t2 explore", "--thoughtNumber", "2", "--totalThoughts", "4", "--nextThoughtNeeded", "true", "--isRevision", "--revisesThought", "1"]);

    const s = run(["--status"]);
    expect(s.code).toBe(0);
    const j = JSON.parse(s.out);
    expect(j.pending).toEqual([]);

    // Now terminate with convergence declaration
    const term = run([
      "--thought", "t3 conclude",
      "--thoughtNumber", "3",
      "--totalThoughts", "4",
      "--nextThoughtNeeded", "false",
      "--newInsight", "false",
      "--newInsightNotes", "converged and stable",
    ]);
    expect(term.code).toBe(0);
  });
});

describe("Task 7: help text + converged-session pending", () => {
  beforeEach(() => {
    if (existsSync(STATE)) unlinkSync(STATE);
  });

  it("--help mentions --listLenses, --kind, --analyze, --flipIf", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
    for (const flag of ["--listLenses", "--kind", "--analyze", "--flipIf"]) {
      expect(r.out).toContain(flag);
    }
  });

  it("pending is empty after a converged termination (ready=yes reachable)", () => {
    run(["--mode", "path-b", "--thought", "t1 decompose", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "falsify H1 condition"]);
    run(["--registerHypothesis", "H2", "--falsification", "falsify H2 condition"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "notes 1", "--falsificationResult", "survived: x", "--flipIf", "reversal"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "notes 2", "--falsificationResult", "falsified: y"]);
    run(["--addCriterion", "crit 1"]);
    run(["--checkCriterion", "crit-1", "--met", "true"]);
    run(["--recordLens", "--lens", "first-principles", "--finding", "Irreducible constraint findings for hyp-1"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "Red team catastrophic collapse findings for hyp-2"]);
    run(["--thought", "t2 explore", "--thoughtNumber", "2", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    const term = run([
      "--thought", "t3 conclude",
      "--thoughtNumber", "3",
      "--totalThoughts", "4",
      "--nextThoughtNeeded", "false",
      "--newInsight", "false",
      "--newInsightNotes", "converged: no new insight this round",
    ]);
    expect(term.code).toBe(0);
    expect(term.out).toMatch(/ready=yes blockers=0/);
    const s = run(["--status"]);
    expect(JSON.parse(s.out).pending).toEqual([]);
  });
});

describe("Task 5: --flipIf flag + trace column", () => {
  beforeEach(() => {
    if (existsSync(STATE)) unlinkSync(STATE);
  });

  it("selected hypothesis without --flipIf triggers WARN", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "if x then not h1"]);
    run(["--registerHypothesis", "h2", "--falsification", "if y then not h2"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "chosen", "--falsificationResult", "survived"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/WARN.*flipIf/i);
  });

  it("--flipIf stored on hypothesis and shown in trace", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "if x then not h1"]);
    run(["--registerHypothesis", "h2", "--falsification", "if y then not h2"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "chosen", "--falsificationResult", "survived", "--flipIf", "price drops below $10"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/flipIf/);
    expect(r.out).toMatch(/price drops below \$10/);
    const s = run(["--status"]);
    const j = JSON.parse(s.out);
    expect(j.hypothesisDetails["hyp-1"].flipIf).toBe("price drops below $10");
  });

  it("conclusion-card template includes flipIf row", () => {
    const card = require("fs").readFileSync(join(ROOT, "references", "conclusion-card.md"), "utf-8");
    expect(card).toMatch(/flipIf/);
  });
});

describe("Task 4: weak-content WARNs + falsification convention", () => {
  beforeEach(() => {
    if (existsSync(STATE)) unlinkSync(STATE);
  });

  it("lens finding <20 chars triggers WARN", () => {
    run(["--mode", "path-b", "--recordLens", "--lens", "first-principles", "--finding", "x"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\[WARN\].*finding.*<20|finding.*short/i);
  });

  it("short --newInsightNotes triggers WARN", () => {
    // Build a complete session so the terminating thought is recorded.
    run(["--mode", "path-b", "--thought", "t1 decompose", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "falsify H1 condition"]);
    run(["--registerHypothesis", "H2", "--falsification", "falsify H2 condition"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held", "--flipIf", "x"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken"]);
    run(["--recordLens", "--lens", "first-principles", "--finding", "Constraint findings anchored to hyp-1"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "Collapse findings anchored to hyp-1"]);
    run(["--addCriterion", "crit 1"]);
    run(["--checkCriterion", "crit-1", "--met", "true"]);
    run(["--thought", "t2 synthesize", "--thoughtNumber", "2", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    const term = run([
      "--thought", "conclude",
      "--thoughtNumber", "3",
      "--totalThoughts", "4",
      "--nextThoughtNeeded", "false",
      "--newInsight", "false",
      "--newInsightNotes", "done",
    ]);
    expect(term.code).toBe(0);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\[WARN\].*newInsightNotes/i);
  });

  it("duplicate findings across different lenses trigger WARN", () => {
    run(["--mode", "path-b", "--recordLens", "--lens", "first-principles", "--finding", "Identical finding text across lenses"]);
    run(["--recordLens", "--lens", "premortem", "--finding", "Identical finding text across lenses"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\[WARN\].*identical finding|duplicate.*finding/i);
  });

  it("unknown lens name triggers INFO suggesting catalog", () => {
    run(["--mode", "path-b", "--recordLens", "--lens", "nonexistent-lens-xyz", "--finding", "A reasonably long finding text mentioning hyp-1"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\[INFO\].*nonexistent-lens-xyz.*catalog|catalog.*nonexistent-lens-xyz/i);
  });

  it("selected hypothesis with 'falsified:' falsificationResult triggers WARN", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "if x then not h1"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "chosen", "--falsificationResult", "falsified: the clause broke", "--flipIf", "reversal"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\[WARN\].*hyp-1.*falsif/i);
  });

  it("rejected hypothesis with 'survived:' and no [PREFERENCE] triggers WARN", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "if x then not h1"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "notes", "--falsificationResult", "survived: held up"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\[WARN\].*hyp-1.*survived|PREFERENCE/i);
  });

  it("rejected hypothesis with 'survived:' and [PREFERENCE] note does NOT trigger that WARN", () => {
    run(["--mode", "path-b", "--registerHypothesis", "h1", "--falsification", "if x then not h1"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "[PREFERENCE] chose simpler option", "--falsificationResult", "survived: held up"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/\[WARN\].*survived/i);
  });

  it("lens finding without hyp-N or crit-N reference triggers INFO", () => {
    run(["--mode", "path-b", "--recordLens", "--lens", "premortem", "--finding", "A long finding without any artifact reference"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\[INFO\].*hyp-N|crit-N|artifact|anchor/i);
  });

  it("lens finding citing hyp-1 does NOT trigger the missing-ID INFO", () => {
    run(["--mode", "path-b", "--recordLens", "--lens", "premortem", "--finding", "Failure mode undermines hyp-1 directly"]);
    const r = run("--export".split(" "));
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/\[INFO\].*anchor|hyp-N|crit-N/i);
  });
});

describe("Task 6: --analyze sensitivity/pareto/ach", () => {
  beforeEach(() => {
    if (existsSync(STATE)) unlinkSync(STATE);
  });

  const SENS_STABLE = JSON.stringify({
    candidates: [
      { id: "A", scores: { cost: 0.9, speed: 0.8 } },
      { id: "B", scores: { cost: 0.7, speed: 0.6 } },
    ],
    criteria: [
      { name: "cost", weight: 0.6, direction: "max" },
      { name: "speed", weight: 0.4, direction: "max" },
    ],
  });
  const SENS_FLIP = JSON.stringify({
    candidates: [
      { id: "A", scores: { cost: 0.9, speed: 0.65 } },
      { id: "B", scores: { cost: 0.9, speed: 0.525 } },
    ],
    criteria: [
      { name: "cost", weight: 0.6, direction: "max" },
      { name: "speed", weight: 0.4, direction: "max" },
    ],
  });
  const PARETO = JSON.stringify({
    candidates: [
      { id: "A", metrics: { quality: 9, cost: 2 } },
      { id: "B", metrics: { quality: 7, cost: 5 } },
      { id: "C", metrics: { quality: 8, cost: 1 } },
    ],
    objectives: [
      { name: "quality", direction: "max" },
      { name: "cost", direction: "min" },
    ],
  });
  const ACH = JSON.stringify({
    hypotheses: [
      { id: "H1", statement: "insider theft" },
      { id: "H2", statement: "external attacker" },
      { id: "H3", statement: "accidental leak" },
    ],
    evidence: [
      { id: "E1", description: "logs wiped", matrix: { H1: "I", H2: "C", H3: "N" } },
      { id: "E2", description: "USB device seen", matrix: { H1: "I", H2: "N", H3: "C" } },
      { id: "E3", description: "no malware found", matrix: { H1: "C", H2: "I", H3: "C" } },
    ],
  });

  it("--analyze sensitivity with known input produces deterministic output", () => {
    const r1 = run(["--mode", "path-b", "--analyze", "sensitivity", "--data", SENS_STABLE]);
    expect(r1.code).toBe(0);
    const j1 = JSON.parse(r1.out);
    expect(j1.analysis.flips).toBe(false);
    expect(j1.analysis.stableRank).toBe("A");
    expect(Array.isArray(j1.analysis.perturbations)).toBe(true);
    // Stable case: perturbations array enumerates only rank-flipping perturbations.
    expect(j1.analysis.perturbations).toEqual([]);
    expect(j1.recorded.computed).toBe(true);
    // Determinism: identical input → identical stdout on a second invocation.
    const r2 = run(["--mode", "path-b", "--analyze", "sensitivity", "--data", SENS_STABLE]);
    expect(r2.out).toBe(r1.out);
    // Persisted lens entry carries computed flag + analysis object.
    const s = run(["--status"]);
    const st = JSON.parse(s.out);
    const lens = st.lenses.find((l: { computed?: boolean }) => l.computed === true);
    expect(lens).toBeDefined();
    expect(lens.analysis).toBeDefined();
    expect(lens.analysis.stableRank).toBe("A");
  });

  it("--analyze sensitivity detects a rank flip under perturbation", () => {
    const r = run(["--mode", "path-b", "--analyze", "sensitivity", "--data", SENS_FLIP]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.analysis.flips).toBe(true);
    expect(j.analysis.stableRank).toBe("A");
    expect(j.analysis.perturbations.some((p: { newWinner: string }) => p.newWinner === "B")).toBe(true);
  });

  it("--analyze pareto identifies non-dominated set", () => {
    const r = run(["--mode", "path-b", "--analyze", "pareto", "--data", PARETO]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.analysis.frontier.map((f: { id: string }) => f.id)).toEqual(["A", "C"]);
    expect(j.analysis.dominated).toEqual([{ id: "B", dominatedBy: "A" }]);
  });

  it("--analyze ach ranks hypotheses by least contradiction", () => {
    const r = run(["--mode", "path-b", "--analyze", "ach", "--data", ACH]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.analysis.ranking.map((x: { id: string }) => x.id)).toEqual(["H3", "H2", "H1"]);
    expect(j.analysis.ranking[0]).toEqual({ id: "H3", inconsistencies: 0, consistent: 2, neutral: 1 });
    expect(j.analysis.eliminated.map((e: { id: string }) => e.id)).toEqual(["H2", "H1"]);
  });

  it("--analyze writes to Reasoning Trace", () => {
    run(["--mode", "path-b", "--analyze", "pareto", "--data", PARETO]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Computed Analysis");
    expect(r.out).toContain("pareto");
  });

  it("--analyze rejected in Path A", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const r = run(["--analyze", "pareto", "--data", PARETO]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/Path A/);
  });

  it("--analyze with unknown subcommand fails", () => {
    const r = run(["--mode", "path-b", "--analyze", "bogus", "--data", "{}"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/Invalid --analyze|sensitivity|pareto|ach/);
  });
});
