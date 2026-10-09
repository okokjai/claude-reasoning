import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_PATH = path.resolve(__dirname, "../scripts/think.ts");

function runThink(args: string[], stateFile: string, env: Record<string, string> = {}): { status: number; stdout: string; stderr: string } {
  const res = spawnSync("bun", [SCRIPT_PATH, ...args], {
    encoding: "utf-8",
    env: { ...process.env, THINK_STATE_FILE: stateFile, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

describe("Part A: --analyze validation and semantics", () => {
  const tmpDir = path.resolve(__dirname, "../.tmp-test-round6");
  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterAll(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const stateFor = (name: string) => path.join(tmpDir, `state-${name}.json`);

  test("A1: basic validation fails cleanly on null, non-object, missing fields without TypeError stack trace", () => {
    const stateFile = stateFor("a1");
    runThink(["--mode", "path-b", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true", "--thought", "Init", "--kind", "decision"], stateFile);

    // null
    const resNull = runThink(["--analyze", "ach", "--data", "null"], stateFile);
    expect(resNull.status).toBe(1);
    expect(resNull.stderr).not.toContain("TypeError");
    expect(resNull.stderr).toContain("Error: --data must be a non-null object");

    // array / primitive
    const resNum = runThink(["--analyze", "ach", "--data", "123"], stateFile);
    expect(resNum.status).toBe(1);
    expect(resNum.stderr).not.toContain("TypeError");
    expect(resNum.stderr).toContain("Error: --data must be a non-null object");

    // missing required fields
    const resEmpty = runThink(["--analyze", "ach", "--data", "{}"], stateFile);
    expect(resEmpty.status).toBe(1);
    expect(resEmpty.stderr).not.toContain("TypeError");
    expect(resEmpty.stderr).toContain("requires at least 2 hypotheses in --data");
  });

  test("A2: ACH verdict validation, unknown IDs, and ties handling", () => {
    const stateFile = stateFor("a2");
    runThink(["--mode", "path-b", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true", "--thought", "Init", "--kind", "decision"], stateFile);

    // Invalid verdict
    const badVerdictData = JSON.stringify({
      hypotheses: [{ id: "h1" }, { id: "h2" }],
      evidence: [{ id: "e1", matrix: { h1: "C", h2: "invalid" } }],
    });
    const resBadVerdict = runThink(["--analyze", "ach", "--data", badVerdictData], stateFile);
    expect(resBadVerdict.status).toBe(1);
    expect(resBadVerdict.stderr).toContain("Invalid verdict 'invalid' for evidence 'e1' x hypothesis 'h2'");

    // Unknown hypothesis id in matrix
    const unknownHypData = JSON.stringify({
      hypotheses: [{ id: "h1" }, { id: "h2" }],
      evidence: [{ id: "e1", matrix: { h1: "C", h2: "I", h3: "N" } }],
    });
    const resUnknownHyp = runThink(["--analyze", "ach", "--data", unknownHypData], stateFile);
    expect(resUnknownHyp.status).toBe(1);
    expect(resUnknownHyp.stderr).toContain("Unknown hypothesis id 'h3' in evidence 'e1' matrix");

    // Tie handling: both have 0 inconsistencies -> neither eliminated, outcome has tie
    const tieData = JSON.stringify({
      hypotheses: [{ id: "h1" }, { id: "h2" }, { id: "h3" }],
      evidence: [
        { id: "e1", matrix: { h1: "C", h2: "C", h3: "I" } },
      ],
    });
    const resTie = runThink(["--analyze", "ach", "--data", tieData], stateFile);
    expect(resTie.status).toBe(0);
    const parsed = JSON.parse(resTie.stdout);
    const eliminatedIds = (parsed.analysis.eliminated as { id: string }[]).map(e => e.id);
    expect(eliminatedIds).not.toContain("h1");
    expect(eliminatedIds).not.toContain("h2");
    expect(eliminatedIds).toContain("h3");
    expect(parsed.analysis.tie).toBe(true);
  });

  test("A3: sensitivity strict direction, weight > 0 number, complete matrix, unique IDs", () => {
    const stateFile = stateFor("a3");
    runThink(["--mode", "path-b", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true", "--thought", "Init", "--kind", "decision"], stateFile);

    // Direction must be "min" | "max" (case-sensitive)
    const badDirData = JSON.stringify({
      candidates: [{ id: "c1", scores: { crit1: 10 } }, { id: "c2", scores: { crit1: 20 } }],
      criteria: [{ name: "crit1", weight: 1, direction: "MIN" }],
    });
    const resBadDir = runThink(["--analyze", "sensitivity", "--data", badDirData], stateFile);
    expect(resBadDir.status).toBe(1);
    expect(resBadDir.stderr).toContain("Invalid direction 'MIN' for criterion 'crit1'");

    // Weight must be number > 0
    const badWeightData = JSON.stringify({
      candidates: [{ id: "c1", scores: { crit1: 10 } }, { id: "c2", scores: { crit1: 20 } }],
      criteria: [{ name: "crit1", weight: "1", direction: "min" }],
    });
    const resBadWeight = runThink(["--analyze", "sensitivity", "--data", badWeightData], stateFile);
    expect(resBadWeight.status).toBe(1);
    expect(resBadWeight.stderr).toContain("Weight for criterion 'crit1' must be a finite positive number");

    // Missing candidate score (must error, no default 0)
    const missingScoreData = JSON.stringify({
      candidates: [{ id: "c1", scores: { crit1: 10 } }, { id: "c2", scores: {} }],
      criteria: [{ name: "crit1", weight: 1, direction: "min" }],
    });
    const resMissingScore = runThink(["--analyze", "sensitivity", "--data", missingScoreData], stateFile);
    expect(resMissingScore.status).toBe(1);
    expect(resMissingScore.stderr).toContain("Missing score for candidate 'c2', criterion 'crit1'");

    // Duplicate candidate id
    const dupCandData = JSON.stringify({
      candidates: [{ id: "c1", scores: { crit1: 10 } }, { id: "c1", scores: { crit1: 20 } }],
      criteria: [{ name: "crit1", weight: 1, direction: "min" }],
    });
    const resDupCand = runThink(["--analyze", "sensitivity", "--data", dupCandData], stateFile);
    expect(resDupCand.status).toBe(1);
    expect(resDupCand.stderr).toContain("Duplicate candidate id 'c1'");

    // Duplicate criterion name
    const dupCritData = JSON.stringify({
      candidates: [{ id: "c1", scores: { crit1: 10 } }, { id: "c2", scores: { crit1: 20 } }],
      criteria: [
        { name: "crit1", weight: 1, direction: "min" },
        { name: "crit1", weight: 2, direction: "max" },
      ],
    });
    const resDupCrit = runThink(["--analyze", "sensitivity", "--data", dupCritData], stateFile);
    expect(resDupCrit.status).toBe(1);
    expect(resDupCrit.stderr).toContain("Duplicate criterion name 'crit1'");
  });

  test("A4: Pareto requires identical, complete, non-empty metric keys for all candidates", () => {
    const stateFile = stateFor("a4");
    runThink(["--mode", "path-b", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true", "--thought", "Init", "--kind", "decision"], stateFile);

    // Inconsistent metrics between candidates
    const badParetoData = JSON.stringify({
      candidates: [
        { id: "c1", metrics: { latency: 10, cost: 5 } },
        { id: "c2", metrics: { latency: 20 } },
      ],
      objectives: [
        { name: "latency", direction: "min" },
        { name: "cost", direction: "min" },
      ],
    });
    const resBad = runThink(["--analyze", "pareto", "--data", badParetoData], stateFile);
    expect(resBad.status).toBe(1);
    expect(resBad.stderr).toContain("Candidate 'c2' is missing required metric 'cost'");
  });

  test("A5: State integration advisory WARN when hypothesis eliminated by ACH is later survived/selected", () => {
    const stateFile = stateFor("a5");
    runThink(["--mode", "path-b", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true", "--thought", "Init", "--kind", "decision"], stateFile);

    // Register hypotheses
    runThink(["--registerHypothesis", "Option A", "--falsification", "falsify condition A"], stateFile);
    runThink(["--registerHypothesis", "Option B", "--falsification", "falsify condition B"], stateFile);

    // Run ACH that eliminates hyp-2
    const achData = JSON.stringify({
      hypotheses: [{ id: "hyp-1" }, { id: "hyp-2" }],
      evidence: [{ id: "e1", matrix: { "hyp-1": "C", "hyp-2": "I" } }],
    });
    runThink(["--analyze", "ach", "--data", achData], stateFile);

    // Now resolve hypothesis hyp-2 as selected
    const resResolve = runThink(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "selected", "--hypothesisNotes", "notes", "--falsificationResult", "held"], stateFile);
    expect(resResolve.stdout).toContain("WARN: Hypothesis 'hyp-2' was previously eliminated by ACH analysis");
    const pending = runThink(["--status"], stateFile);
    expect(pending.stdout).toContain("Hypothesis 'hyp-2' was previously eliminated by ACH");
  });

  test("A6: Hollow sensitivity (<2 criteria or <2 candidates) recorded but does not satisfy core lens coverage", () => {
    const stateFile = stateFor("a6");
    // Repro case: 1 criterion sensitivity + two 5-char lenses currently yields ready=yes blockers=0
    runThink(["--mode", "path-b", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--thought", "Init", "--kind", "decision"], stateFile);
    runThink(["--registerHypothesis", "Hypothesis 1 text long", "--falsification", "falsify hyp 1"], stateFile);
    runThink(["--registerHypothesis", "Hypothesis 2 text long", "--falsification", "falsify hyp 2"], stateFile);
    runThink(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "note", "--falsificationResult", "held"], stateFile);
    runThink(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "note", "--falsificationResult", "broken"], stateFile);
    runThink(["--addCriterion", "acceptance criterion 1"], stateFile);
    runThink(["--checkCriterion", "crit-1", "--met", "true"], stateFile);
    runThink(["--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--thought", "Thought 2", "--newInsight", "false", "--newInsightNotes", "converged notes here"], stateFile);

    // 1 criterion sensitivity
    const hollowData = JSON.stringify({
      candidates: [{ id: "c1", scores: { crit1: 10 } }, { id: "c2", scores: { crit1: 20 } }],
      criteria: [{ name: "crit1", weight: 1, direction: "min" }],
    });
    runThink(["--analyze", "sensitivity", "--data", hollowData], stateFile);

    // Record the other 2 core lenses for decision (lens-10: Reversibility & One-Way Doors, lens-3: Contrarian & Worst-Option Defense)
    runThink(["--recordLens", "reversibility", "--finding", "short finding 1"], stateFile);
    runThink(["--recordLens", "contrarian", "--finding", "short finding 2"], stateFile);

    // Submit thought 3: before fix, this produced ready=yes blockers=0.
    // After fix, hollow sensitivity must NOT satisfy core lens coverage -> ready=no blockers>0 and Missing core lenses in pending.
    const resT3 = runThink(["--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--thought", "Work"], stateFile);
    expect(resT3.stdout).toContain("ready=no");
    const resStatus = runThink(["--status"], stateFile);
    expect(resStatus.stdout).toContain("Missing core lenses for decision: Sensitivity Analysis");
  });

  test("C4: drift guard between references/critical-lenses.md and LENS_CATALOG", () => {
    const mdPath = path.resolve(__dirname, "../references/critical-lenses.md");
    const mdContent = fs.readFileSync(mdPath, "utf-8");

    // Extract lens definitions from markdown: "### lens-<N>. <Name> ("
    const re = /###\s+(lens-\d+)\.\s+([^(]+)\s*\(/g;
    const mdLenses: { id: string; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(mdContent)) !== null) {
      mdLenses.push({ id: m[1].trim(), name: m[2].trim() });
    }

    // Extract LENS_CATALOG from scripts/think.ts
    const thinkPath = path.resolve(__dirname, "../scripts/think.ts");
    const thinkContent = fs.readFileSync(thinkPath, "utf-8");
    const catalogMatch = /export const LENS_CATALOG:\s*readonly LensCatalogEntry\[\]\s*=\s*(\[[\s\S]*?\]);/.exec(thinkContent);
    expect(catalogMatch).not.toBeNull();
    // Evaluate array structure safely
    const catalog = new Function(`return ${catalogMatch![1]};`)() as { id: string; name: string }[];

    expect(mdLenses.length).toBe(11);
    expect(catalog.length).toBe(11);

    for (let i = 0; i < 11; i++) {
      expect(mdLenses[i].id).toBe(catalog[i].id);
      expect(mdLenses[i].name).toBe(catalog[i].name);
    }
  });

  test("Opt-in fuzz test: FALSE_READY must be 0", () => {
    if (process.env.RUN_FUZZ !== "1" && process.env.RUN_FUZZ !== "true") {
      console.log("Skipping opt-in fuzz test (set RUN_FUZZ=1 to run)");
      return;
    }
    let totalEvaluated = 0;
    let readyCount = 0;
    let falseReadyCount = 0;
    const problemKinds = ["diagnostic", "decision", "design", "optimization", "innovation", "planning"] as const;

    for (let i = 0; i < 24; i++) {
      const fuzzStateFile = stateFor(`fuzz-${i}`);
      if (fs.existsSync(fuzzStateFile)) fs.unlinkSync(fuzzStateFile);
      const kind = problemKinds[i % problemKinds.length];
      runThink(["--mode", "path-b", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--thought", "Init", "--kind", kind], fuzzStateFile);

      // Mutate: add criteria
      runThink(["--addCriterion", `crit-${i}`], fuzzStateFile);
      if (i % 2 === 0) runThink(["--checkCriterion", "crit-1", "--met", "true"], fuzzStateFile);

      // Mutate: add hypotheses
      const hypCount = (i % 2) + 2; // 2 or 3
      for (let h = 1; h <= hypCount; h++) {
        runThink(["--registerHypothesis", `Hypothesis ${h}`, "--falsification", `falsify ${h}`], fuzzStateFile);
      }
      if (i % 2 === 0) {
        runThink(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "notes", "--falsificationResult", "held"], fuzzStateFile);
        runThink(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "notes", "--falsificationResult", "broken"], fuzzStateFile);
      }

      // Mutate: add thought 2
      runThink(["--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--thought", "Thought 2", "--newInsight", "false", "--newInsightNotes", "notes"], fuzzStateFile);

      // Mutate: analyze or lenses
      const isHollow = (i % 3 === 0);
      if (isHollow) {
        const hollowData = JSON.stringify({
          candidates: [{ id: "c1", scores: { crit1: 10 } }, { id: "c2", scores: { crit1: 20 } }],
          criteria: [{ name: "crit1", weight: 1, direction: "min" }],
        });
        runThink(["--analyze", "sensitivity", "--data", hollowData], fuzzStateFile);
      } else {
        const fullData = JSON.stringify({
          candidates: [{ id: "c1", scores: { crit1: 10, crit2: 5 } }, { id: "c2", scores: { crit1: 20, crit2: 15 } }],
          criteria: [{ name: "crit1", weight: 1, direction: "min" }, { name: "crit2", weight: 2, direction: "max" }],
        });
        runThink(["--analyze", "sensitivity", "--data", fullData], fuzzStateFile);
      }

      // Satisfy core lenses depending on kind
      if (i % 2 === 0) {
        if (kind === "decision") {
          runThink(["--recordLens", "--lens", "reversibility", "--finding", "finding reversibility long enough"], fuzzStateFile);
          runThink(["--recordLens", "--lens", "contrarian", "--finding", "finding contrarian long enough"], fuzzStateFile);
        } else if (kind === "diagnostic") {
          runThink(["--recordLens", "--lens", "first-principles", "--finding", "finding first principles long enough"], fuzzStateFile);
          const achData = JSON.stringify({
            hypotheses: [{ id: "hyp-1" }, { id: "hyp-2" }],
            evidence: [{ id: "e1", matrix: { "hyp-1": "C", "hyp-2": "I" } }],
          });
          runThink(["--analyze", "ach", "--data", achData], fuzzStateFile);
        } else if (kind === "design") {
          runThink(["--recordLens", "--lens", "pareto", "--finding", "finding pareto long enough"], fuzzStateFile);
          runThink(["--recordLens", "--lens", "scale", "--finding", "finding scale long enough"], fuzzStateFile);
          runThink(["--recordLens", "--lens", "blast-radius", "--finding", "finding blast radius long enough"], fuzzStateFile);
        } else {
          runThink(["--recordLens", "--lens", "First Principles & Constraint Reduction", "--finding", "finding 1 long enough"], fuzzStateFile);
          runThink(["--recordLens", "--lens", "Pre-Mortem & Active Red Team", "--finding", "finding 2 long enough"], fuzzStateFile);
          runThink(["--recordLens", "--lens", "Contrarian & Worst-Option Defense", "--finding", "finding 3 long enough"], fuzzStateFile);
        }
      }
      // Check status pendingActions
      const st = runThink(["--status"], fuzzStateFile);
      const stObj = JSON.parse(st.stdout);
      const isReadyByPending = Array.isArray(stObj.pending) && stObj.pending.length === 0;

      totalEvaluated++;
      if (isReadyByPending) {
        readyCount++;
        const termRes = runThink(["--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false", "--thought", "Conclusion", "--newInsight", "false", "--newInsightNotes", "Converged on final recommendation"], fuzzStateFile);
        if (termRes.status !== 0) {
          falseReadyCount++;
        }
      }
    }

    console.log(`[Fuzz Report] Total evaluated: ${totalEvaluated}, Predicted ready: ${readyCount}, FALSE_READY: ${falseReadyCount}`);
    expect(falseReadyCount).toBe(0);
    expect(readyCount).toBeGreaterThan(0);
  }, 30_000);

  test("Backwards compatibility: v3.0.x and v3.2.0 state files load cleanly without SCHEMA_VERSION error", () => {
    const v30StateFile = stateFor("v30-compat");
    const v30State = {
      schemaVersion: 3,
      mode: "path-b",
      thoughtHistory: [
        { thought: "Initial v3.0 thought", thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true, timestamp: "2026-01-01T00:00:00.000Z" }
      ],
      claims: [],
      hypotheses: [],
      lenses: [
        { lens: "analyze:sensitivity", finding: "Sensitivity: winner c1 stable under ±20% perturbation", atThought: 1, computed: true, analysis: { flips: false, stableRank: ["c1", "c2"], perturbations: [] } }
      ],
      criteria: [],
      auditLog: [],
      startedAt: "2026-01-01T00:00:00.000Z"
    };
    fs.writeFileSync(v30StateFile, JSON.stringify(v30State, null, 2), "utf-8");

    const res = runThink(["--status"], v30StateFile);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.mode).toBe("path-b");
    expect(parsed.fullHistory.length).toBe(1);
  });

  test("Path A equivalence: 3-thought closed-form execution and output structure remain unchanged", () => {
    const pathAState = stateFor("path-a-equiv");
    if (fs.existsSync(pathAState)) fs.unlinkSync(pathAState);

    const r1 = runThink(["--mode", "path-a", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--thought", "Step 1: Restate problem and definitions"], pathAState);
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain("[1/3] history=1 mode=path-a next=true ready=no blockers=1");
    expect(r1.stderr).toContain("💭 Thought 1/3");

    const r2 = runThink(["--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true", "--thought", "Step 2: Derive closed-form solution"], pathAState);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain("[2/3] history=2 mode=path-a next=true ready=yes blockers=0");
    expect(r2.stderr).toContain("💭 Thought 2/3");

    const r3 = runThink(["--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false", "--thought", "Step 3: Independent cross-check confirms result"], pathAState);
    expect(r3.status).toBe(0);
    expect(r3.stdout).toContain("[3/3] history=3 mode=path-a next=false ready=yes blockers=0");
    expect(r3.stdout).toContain("# Reasoning Lint & Fact Sheet");
    expect(r3.stderr).toContain("💭 Thought 3/3");
  });
});
