import { describe, it, expect, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { rmSync, writeFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
const STATE_FILE = join(CWD, "tests", `.think_state.round8-${process.pid}.json`);
const LOCK_DIR = STATE_FILE + ".lock";
process.env.THINK_STATE_FILE = STATE_FILE;

function run(argv: string[]): { stdout: string; stderr: string; code: number } {
  const res = spawnSync("bun", [SCRIPT, ...argv], {
    cwd: CWD,
    encoding: "utf-8",
    env: { ...process.env, THINK_STATE_FILE: STATE_FILE },
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", code: res.status ?? 1 };
}

function seed(state: object): void {
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

function clean(): void {
  for (const f of [STATE_FILE, STATE_FILE + ".bak"]) rmSync(f, { force: true });
  rmSync(LOCK_DIR, { force: true, recursive: true });
}

afterAll(clean);

const BASE = {
  schemaVersion: 3,
  mode: "path-b",
  thoughtHistory: [
    { thought: "t1", thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true, historyIndex: 1 },
  ],
  branches: {},
  claims: {},
  hypotheses: {},
  acceptanceCriteria: [],
  lenses: [],
  auditTrail: [],
};

describe("Bug 1: lint report escapes newInsightNotes to prevent heading injection", () => {
  it("escapes line-start markdown headings in unmet criteria exemption (line 1036)", () => {
    seed({
      ...BASE,
      thoughtHistory: [
        ...BASE.thoughtHistory,
        {
          thought: "terminating",
          thoughtNumber: 2,
          totalThoughts: 3,
          nextThoughtNeeded: false,
          historyIndex: 2,
          newInsightNotes: "safe convergence\n## Injected Heading 1036",
        },
      ],
      acceptanceCriteria: [
        { id: "crit-1", criterion: "c1", met: false, checkedAtThought: 1, checkedAtHistoryIndex: 1 },
      ],
    });
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/^## Injected Heading 1036$/m);
    expect(r.stdout).toContain("\\## Injected Heading 1036");
  });

  it("escapes line-start markdown headings in short notes warning (line 1072)", () => {
    seed({
      ...BASE,
      thoughtHistory: [
        ...BASE.thoughtHistory,
        {
          thought: "t2",
          thoughtNumber: 2,
          totalThoughts: 3,
          nextThoughtNeeded: true,
          historyIndex: 2,
          newInsightNotes: "s\n## H",
        },
      ],
    });
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/^## H$/m);
    expect(r.stdout).toContain("\\## H");
  });
});

describe("Bug 2: freshness warning label disambiguation", () => {
  it("uses (freshness-window) instead of (Gate 3) for source age warning (line 1016)", () => {
    seed({
      ...BASE,
      thoughtHistory: [
        ...BASE.thoughtHistory,
        { thought: "t2", thoughtNumber: 2, totalThoughts: 3, nextThoughtNeeded: true, historyIndex: 2 },
      ],
      hypotheses: {
        "hyp-1": { id: "hyp-1", statement: "H1", status: "selected", falsification: "f clause long enough", falsificationResult: "held" },
        "hyp-2": { id: "hyp-2", statement: "H2", status: "rejected", falsification: "f clause long enough", falsificationResult: "broken" },
      },
      claims: {
        "claim-1": {
          id: "claim-1",
          statement: "old claim",
          registeredAtThought: 1,
          sources: ["https://a.example", "https://b.example"],
          tiers: [1, 1],
          claimDates: ["2020-01-01", "2020-01-01"],
          status: "verified",
          supports: "hyp-1",
          quote: "quoted text here",
          negativeQuery: "q",
          negativeFinding: "cmd\noutput",
        },
      },
    });
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/newest source is \d+ days old/);
    expect(r.stdout).not.toMatch(/newest source is \d+ days old.*\(Gate 3\)/);
    expect(r.stdout).toMatch(/newest source is \d+ days old.*\(freshness-window\)/);
  });
});
