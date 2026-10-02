#!/usr/bin/env bun
/**
 * claude-reasoning 3.0.2 - Sequential thinking state machine with claim-gated verification.
 * Zero MCP dependencies. Persistent state in .think_state.json.
 *
 * Upstream foundation: thedotmack/sequential-thinking-skill (MIT License)
 * Enhanced with Claim Pre-registration, Dual-Source Verification, and Guardrails.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.THINK_STATE_FILE || join(__dirname, ".think_state.json");

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  historyIndex?: number;      // 1-based physical position in thoughtHistory; set on push, backfilled on load
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  newInsight?: boolean;        // only false accepted; true duplicates nextThoughtNeeded
  newInsightNotes?: string;
}

export type ClaimStatus = "pending" | "verified" | "single_source" | "unverified" | "not_found";

export interface Claim {
  id: string;
  statement: string;
  registeredAtThought: number;
  sources: string[];
  tiers?: number[];            // tier aligned with sources[]; required for verified
  status: ClaimStatus;
  supports?: string;           // Path B: required hypothesis id this claim bears on
  quote?: string;              // required to reach verified
  negativeQuery?: string;      // required to reach verified
  negativeFinding?: string;    // required to reach verified
  notes?: string;
}

export type HypothesisStatus = "pending" | "selected" | "rejected" | "synthesized" | "merged";

export interface Hypothesis {
  id: string;
  statement: string;
  status: HypothesisStatus;
  falsification?: string;       // required at registration
  falsificationResult?: string; // required at resolution
  notes?: string;
  mergedInto?: string;
}

export interface AcceptanceCriterion {
  id: string;
  criterion: string;
  met?: boolean;
  notes?: string;
  checkedAtHistoryIndex?: number; // history length (position of next thought) when checked; gate 7 compares revisions after this
  /** Legacy v2 persisted field — migrated to checkedAtHistoryIndex on load;
   *  still written alongside so older readers of the state file keep working. */
  checkedAtThought?: number;
}

export interface LensFinding {
  lens: string;
  finding: string;
  atThought: number;
}

export type ThinkingMode = "path-a" | "path-b";

export interface AuditEntry {
  op: "registerClaim" | "verifyClaim" | "registerHypothesis" | "resolveHypothesis" | "addCriterion" | "checkCriterion" | "recordLens";
  target: string;
  detail?: string;
  atThought?: number;
}

export interface State {
  schemaVersion: number;       // 2; files without it are treated as v1 and migrated on load
  mode?: ThinkingMode;
  acceptanceCriteria: AcceptanceCriterion[];
  thoughtHistory: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
  claims: Record<string, Claim>;
  hypotheses: Record<string, Hypothesis>;
  lenses: LensFinding[];
  auditTrail?: AuditEntry[];
}

const SCHEMA_VERSION = 3;

function emptyState(): State {
  return { schemaVersion: SCHEMA_VERSION, acceptanceCriteria: [], thoughtHistory: [], branches: {}, claims: {}, hypotheses: {}, lenses: [], auditTrail: [] };
}

function loadState(): State {
  if (existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      // v1 → v2 migration: fill fields introduced by the reasoning-depth upgrade.
      const migrated: State = {
        schemaVersion: SCHEMA_VERSION,
        mode: data.mode,
        acceptanceCriteria: (data.acceptanceCriteria || []).map((c: AcceptanceCriterion) =>
          c.checkedAtHistoryIndex == null && c.checkedAtThought != null
            ? { ...c, checkedAtHistoryIndex: c.checkedAtThought }
            : c),
        thoughtHistory: (data.thoughtHistory || []).map((t: ThoughtData, i: number) =>
          t.historyIndex == null ? { ...t, historyIndex: i + 1 } : t),
        branches: data.branches || {},
        claims: data.claims || {},
        hypotheses: data.hypotheses || {},
        lenses: data.lenses || [],
        auditTrail: data.auditTrail || [],
      };
      // Persist back when the file was a pre-v2 schema so the on-disk form
      // matches what was loaded (no silent in-memory-only upgrade).
      if (data.schemaVersion !== SCHEMA_VERSION) saveState(migrated);
      return migrated;
    } catch {
      // Corrupt state: never silently swallow. Preserve the original for
      // forensics and start clean — same contract as "no state file".
      console.error(`Warning: ${STATE_FILE} is corrupt or not valid JSON; backing up to ${STATE_FILE}.bak and starting a fresh session.`);
      try {
        renameSync(STATE_FILE, STATE_FILE + ".bak");
      } catch { /* backup best-effort; proceed anyway */ }
      return emptyState();
    }
  }
  return emptyState();
}

function saveState(state: State): void {
  // Atomic write: tmp + rename so a crash mid-write cannot leave a torn state file.
  const tmp = STATE_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

function recordAudit(state: State, entry: AuditEntry): void {
  if (!state.auditTrail) state.auditTrail = [];
  if (entry.atThought === undefined) {
    entry.atThought = state.thoughtHistory.length;
  }
  state.auditTrail.push(entry);
}

function formatThought(t: ThoughtData): string {
  let header: string;
  if (t.isRevision && t.revisesThought != null) {
    header = `🔄 Revision ${t.thoughtNumber}/${t.totalThoughts} (revising thought ${t.revisesThought})`;
  } else if (t.branchFromThought != null && t.branchId != null) {
    header = `🌿 Branch ${t.thoughtNumber}/${t.totalThoughts} (from thought ${t.branchFromThought}, ID: ${t.branchId})`;
  } else {
    header = `💭 Thought ${t.thoughtNumber}/${t.totalThoughts}`;
  }
  return `${header}\n${t.thought}`;
}

function makeStatusResponse(state: State) {
  const branchIds = Object.keys(state.branches);
  const historyLength = state.thoughtHistory.length;
  const claimIds = Object.keys(state.claims);
  const pendingClaims = Object.values(state.claims).filter(c => c.status === "pending").map(c => c.id);
  const hypothesisIds = Object.keys(state.hypotheses || {});
  const pendingHypotheses = Object.values(state.hypotheses || {}).filter(h => h.status === "pending").map(h => h.id);

  const base = {
    mode: state.mode,
    branches: branchIds,
    thoughtHistoryLength: historyLength,
    claims: claimIds,
    pendingClaims,
    hypotheses: hypothesisIds,
    pendingHypotheses,
  };

  if (historyLength === 0) {
    return {
      ...base,
      thoughtNumber: 0,
      totalThoughts: 0,
      nextThoughtNeeded: true,
    };
  }

  const latest = state.thoughtHistory[historyLength - 1];
  return {
    ...base,
    thoughtNumber: latest.thoughtNumber,
    totalThoughts: latest.totalThoughts,
    nextThoughtNeeded: latest.nextThoughtNeeded,
  };
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// --- Termination gates 6-10 switchboard (plan v3.4 §6) ---
// Required-field checks (hypothesisNotes, supports, falsification, verified
// trio) are definition-layer and always on; only the TERMINATION gates are
// switchable so evaluation can ablate them. THINK_GATES_OFF accepts a
// comma-separated list of names or 'all'.
const GATES = {
  criteria: true,
  criteriaRevision: true,
  lenses: true,
  convergence: true,
  falsificationResult: true,
} as const;

type GateName = keyof typeof GATES;

const gatesOff = new Set(
  (process.env.THINK_GATES_OFF || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0),
);
const gatesAllOff = gatesOff.has("all");

function gateOn(name: GateName): boolean {
  return GATES[name] && !gatesAllOff && !gatesOff.has(name);
}

/** Violations a disabled termination gate would have produced; surfaced in lint. */
const disabledGateViolations: string[] = [];

/**
 * Enforce a termination gate: when on, fail; when off, record the violation so
 * buildLintReport can show it as a WARN (gate disabled) instead of blocking.
 */
function enforceGate(name: GateName, violation: string | null): void {
  if (violation == null) return;
  if (gateOn(name)) fail(violation);
  disabledGateViolations.push(`gate ${name} disabled: ${violation}`);
}

// --- Lint report (--export) ---

/** Quote multi-line free text so user content can never forge card headings. */
function quoteBlock(text: string): string {
  return text.split("\n").map(l => `> ${l}`).join("\n");
}

/**
 * Link-status derivation (plan §7 rule K): for each hypothesis, look at the
 * claims whose `supports` points at it. Lowest status wins.
 *  - Linked-verified: ≥1 linked claim, all verified and carrying a quote.
 *  - Plausible: no linked claims at all, or only single_source evidence.
 *  - Fragile: any linked claim unverified / not_found / pending.
 * This is a self-reported linkage label — the script cannot judge claim
 * relevance; final confidence is decided when the model writes the answer.
 */
function linkStatus(hyp: Hypothesis, claims: Claim[]): string {
  const linked = claims.filter(c => c.supports === hyp.id);
  if (linked.length === 0) return "Plausible";
  if (linked.every(c => c.status === "verified" && c.quote != null && c.quote.trim().length > 0)) {
    return "Linked-verified";
  }
  if (linked.some(c => c.status === "unverified" || c.status === "not_found" || c.status === "pending")) {
    return "Fragile";
  }
  return "Plausible";
}

/**
 * Build the lint report + fact sheet (replaces the 2.2.5 conclusion card).
 * Reports recorded facts and invariant violations; NEVER emits calibrated
 * verdict tags ([Confirmed]/[Probable]/Level: High...) — the model writes the
 * final card itself from this evidence.
 */
function buildLintReport(state: State): string {
  const claims = Object.values(state.claims);
  const hypotheses = Object.values(state.hypotheses || {});
  const history = state.thoughtHistory;
  const isPathA = state.mode === "path-a";
  const terminated = history.length > 0 && history[history.length - 1].nextThoughtNeeded === false;
  const lastThought = history.length > 0 ? history[history.length - 1] : null;

  const crit: string[] = [];
  const warn: string[] = [];
  const info: string[] = [];

  // Disabled-gate violations recorded during termination enforcement.
  warn.push(...disabledGateViolations);

  // CRIT residuals: violations that should have been blocked by an active gate
  // but are present in state (evidence of a bypass path).
  for (const c of claims) {
    if (c.status === "verified") {
      for (const [field, name] of [["quote", "--claimQuote"], ["negativeQuery", "--negativeQuery"], ["negativeFinding", "--negativeFinding"]] as const) {
        if (!c[field] || c[field]!.trim().length === 0) {
          crit.push(`'${c.id}' verified but missing ${name}`);
        }
      }
    }
  }
  for (const cr of state.acceptanceCriteria) {
    if (cr.met === false) {
      const revised = history.some((t, idx) => t.isRevision === true && idx + 1 > (cr.checkedAtHistoryIndex ?? cr.checkedAtThought ?? Infinity));
      const exempt = lastThought != null && lastThought.newInsightNotes != null && lastThought.newInsightNotes.trim().length > 0;
      if (!revised && !exempt) {
        crit.push(`criterion '${cr.id}' met=false, checkedAtThought=${cr.checkedAtHistoryIndex ?? cr.checkedAtThought ?? "?"} with no later revision`);
      }
    }
  }

  // INFO: illuminate escape surfaces, never block.
  if (!isPathA && claims.length === 0 && terminated) {
    info.push(`Path B terminated with claims=0 (purely internal reasoning?): does this task contain external facts that should have been registered?`);
  }
  const audit = state.auditTrail || [];
  const maxAtThought = audit.reduce((max, e) => Math.max(max, e.atThought ?? 0), 0);
  const lastRoundAudit = audit.filter(e => (e.atThought ?? 0) === maxAtThought);
  const lastByTarget: Record<string, string> = {};
  let changes = 0;
  for (const e of lastRoundAudit) {
    if (e.detail != null && lastByTarget[e.target] != null && lastByTarget[e.target] !== e.detail) changes++;
    if (e.detail != null) lastByTarget[e.target] = e.detail;
  }
  info.push(`auditTrail recorded ${audit.length} operation(s); ${changes} status change(s) on previously-seen targets (observational only, does not block termination)`);

  // WARN: self-report heuristics — raise fabrication cost, never block (§0.1).
  for (const h of hypotheses) {
    if (h.falsification != null && h.falsification.trim().length > 0 && h.falsification.trim().length < 20) {
      warn.push(`'${h.id}' falsification is short (<20 chars, self-reported; human review advised)`);
    }
    if (claims.every(c => c.supports !== h.id)) {
      warn.push(`'${h.id}' has no claim support → link-status Plausible (not Low)`);
    }
  }
  for (const c of claims) {
    if (c.status === "verified" && c.quote != null && c.quote.trim().length > 0 && c.quote.trim().length < 10) {
      warn.push(`'${c.id}' quote is very short (<10 chars; self-reported)`);
    }
  }
  for (const c of claims) {
    if (c.status === "verified" && (c.tiers == null || c.tiers.length === 0)) {
      warn.push(`'${c.id}' verified without --claimTier: source quality is unclassified; re-check against references/source-tiers.md (Tier 3/4 cannot support verified)`);
    }
  }
  const dupSeen: Record<string, string[]> = {};
  for (const c of claims) {
    if (c.negativeFinding != null && c.negativeFinding.trim().length > 0) {
      (dupSeen[c.negativeFinding.trim()] ||= []).push(c.id);
    }
  }
  for (const ids of Object.values(dupSeen)) {
    if (ids.length > 1) warn.push(`${ids.join(" and ")} share an identical negativeFinding text (template suspected)`);
  }
  const verifiedWithSingleLineFinding = claims.filter(
    c => c.status === "verified" && c.negativeFinding != null && !c.negativeFinding.includes("\n")
  );
  if (verifiedWithSingleLineFinding.length > 0) {
    warn.push(`${verifiedWithSingleLineFinding.length}/${claims.filter(c => c.status === "verified").length} verified claims have a single-line negativeFinding (self-report; the script only checks for a newline and cannot verify the search ran). Record command + observed output as two lines: --negativeFinding "<command>\\n<output>".`);
  }
  if (lastThought != null && lastThought.newInsightNotes != null && lastThought.newInsightNotes.trim().length > 0) {
    const unmet = state.acceptanceCriteria.some(cr => cr.met === false);
    if (unmet) warn.push(`termination used --newInsightNotes exemption: "${lastThought.newInsightNotes}"`);
  }
  const lensNames = new Set(state.lenses.map(l => l.lens.normalize("NFKC").toLowerCase()));
  if (!isPathA && terminated && lensNames.size < 2) {
    if (!disabledGateViolations.some(v => v.startsWith("gate lenses"))) {
      warn.push(`only ${lensNames.size} distinct lens name(s) recorded`);
    }
  }
  for (const name of lensNames) {
    const findings = state.lenses.filter(l => l.lens.normalize("NFKC").toLowerCase() === name);
    if (findings.every(f => f.finding.trim().length === 0)) {
      warn.push(`lens '${name}' recorded but has no findings`);
    }
  }

  const violations = [
    ...crit.map(v => `- [CRIT] ${v}`),
    ...warn.map(v => `- [WARN] ${v}`),
    ...info.map(v => `- [INFO] ${v}`),
  ];

  const selected = hypotheses.filter(h => h.status === "selected" || h.status === "synthesized");
  const rejected = hypotheses.filter(h => h.status === "rejected");
  const merged = hypotheses.filter(h => h.status === "merged");
  const openHyp = hypotheses.filter(h => h.status === "pending");

  const sections: string[] = [
    `# Reasoning Lint & Fact Sheet${state.mode ? ` (${state.mode})` : ""}`,
    "",
    "## Lint Violations",
    violations.length > 0 ? violations.join("\n") : "All invariants satisfied.",
    "",
    "## Acceptance Checklist",
    state.acceptanceCriteria.length > 0
      ? state.acceptanceCriteria.map(cr =>
          `- ${cr.id} "${cr.criterion}" → ${cr.met === true ? `met ✅${(cr.checkedAtHistoryIndex ?? cr.checkedAtThought) != null ? ` (checkedAtThought=${cr.checkedAtHistoryIndex ?? cr.checkedAtThought})` : ""}` : cr.met === false ? `unmet ❌ (checkedAtThought=${cr.checkedAtHistoryIndex ?? cr.checkedAtThought ?? "?"})` : "un-checked ⚠️"}`)
          .join("\n")
      : "- None registered.",
    "",
    "## Hypotheses",
    hypotheses.length > 0
      ? hypotheses.map(h => {
          const link = linkStatus(h, claims);
          const lines = [`- ${h.id} [${h.status}] "${h.statement}"${h.notes ? ` — why: ${h.notes}` : ""}${h.mergedInto ? ` (merged → ${h.mergedInto})` : ""}`];
          if (h.falsification) lines.push(`  - falsification: "${h.falsification}"${h.falsificationResult ? ` → falsificationResult: "${h.falsificationResult}"` : " → falsificationResult: (none)"}`);
          lines.push(`  - link-status: ${link}`);
          return lines.join("\n");
        }).join("\n")
      : isPathA ? "- No hypotheses (Path A closed-form)." : "- No hypotheses registered.",
    "",
    "## Claims",
    claims.length > 0
      ? claims.map(c => {
          const parts = [`- ${c.id} [${c.status === "pending" ? "pending, unverified" : c.status}] "${c.statement}"${c.supports ? ` supports ${c.supports}` : ""}`];
          if (c.quote) parts.push(`  quote: "${c.quote}"`);
          if (c.negativeQuery || c.negativeFinding) parts.push(`  negative: "${c.negativeQuery ?? ""}" → "${c.negativeFinding ?? ""}"`);
          if (c.sources.length > 0) parts.push(`  sources: ${c.sources.join(", ")}`);
          if (c.notes) parts.push(`  notes: ${c.notes}`);
          return parts.join("\n");
        }).join("\n")
      : isPathA ? "- No external claims (Path A; n/a closed-form)." : "- No claims registered.",
    "",
    "## Lens Findings → Residual Uncertainty",
    state.lenses.length > 0 ? state.lenses.map(l => `- ${l.lens}: "${l.finding}" (at thought ${l.atThought})`).join("\n") : "- None recorded.",
  ];

  // For backward compatibility with tests asserting on "Merged: hyp-X → hyp-Y"
  if (merged.length > 0) {
    sections.push(
      "",
      "## Merged Hypotheses",
      ...merged.map(h => `- Merged: ${h.id} → ${h.mergedInto ?? "?"} — ${h.statement}${h.notes ? ` (${h.notes})` : ""}`),
    );
  }

  // Path A specific section to satisfy "n/a (closed-form)" confidence assertion
  if (isPathA) {
    sections.push(
      "",
      "## Confidence Assessment",
      "- Level: n/a (closed-form)",
      "- Rationale: no external claims by contract; correctness rests on the independent cross-validation recorded in the thoughts.",
    );
  }

  const residual: string[] = [];
  for (const c of claims) {
    if (c.status !== "verified") {
      residual.push(`- [Unverified] Re-verify ${c.id} (${c.status})${c.notes ? `: ${c.notes}` : ""}`);
    }
  }
  for (const h of openHyp) residual.push(`- [Unverified] Hypothesis ${h.id} still pending resolution`);
  const unresolvedN = claims.filter(c => c.status !== "verified").length;

  const nextSteps: string[] = [];
  if (!terminated) nextSteps.push("- Session still open; continue thinking or submit a terminating thought with --nextThoughtNeeded false.");
  if (unresolvedN > 0) nextSteps.push("- Re-verify unresolved claims via --verifyClaim with independent sources.");
  if (openHyp.length > 0) nextSteps.push("- Resolve pending hypotheses via --resolveHypothesis.");

  const revisions = history.filter(t => t.isRevision).length;
  const branchIds = Object.keys(state.branches);
  const trace = `- Thoughts: ${history.length} (revisions: ${revisions}, branches: ${branchIds.length > 0 ? branchIds.join(", ") : "none"})`;

  sections.push(
    "",
    "## Reasoning Trace",
    trace,
    "",
    "## Final Thought",
    lastThought != null ? quoteBlock(lastThought.thought) : "> (no thoughts recorded yet)",
    "",
    "## Residual Uncertainty & Blind Spots",
    residual.length > 0
      ? residual.join("\n")
      : claims.length > 0
        ? "- All registered claims verified (blind spots outside the registered claims are not tracked)."
        : "- None recorded by script.",
    "",
    "## Actionable Next Steps / Exit Conditions",
    nextSteps.length > 0 ? nextSteps.join("\n") : "- None from script gates. The final answer must still be written by the model per references/conclusion-card.md.",
  );
  if (selected.length === 0 && hypotheses.length > 0) {
    sections.splice(sections.indexOf("## Reasoning Trace"), 0, "", "## Primary Finding", "No hypothesis was selected or synthesized; see final thought below.");
  } else if (selected.length === 0 && hypotheses.length === 0 && !isPathA) {
    sections.splice(sections.indexOf("## Reasoning Trace"), 0, "", "## Primary Finding", "No hypothesis registered; see final thought below.");
  }
  return sections.join("\n");
}

export interface ParsedArgs {
  thought?: string;
  thoughtNumber?: string;
  totalThoughts?: string;
  nextThoughtNeeded?: string;
  isRevision?: boolean;
  revisesThought?: string;
  branchFromThought?: string;
  branchId?: string;
  needsMoreThoughts?: boolean;
  newInsight?: string;
  newInsightNotes?: string;
  registerClaim?: string;
  verifyClaim?: string;
  claimStatus?: string;
  claimSource?: string[];
  claimTier?: string[];
  claimNotes?: string;
  supports?: string;
  claimQuote?: string;
  negativeQuery?: string;
  negativeFinding?: string;
  mode?: string;
  registerHypothesis?: string;
  resolveHypothesis?: string;
  hypothesisStatus?: string;
  hypothesisNotes?: string;
  falsification?: string;
  falsificationResult?: string;
  mergedInto?: string;
  addCriterion?: string;
  checkCriterion?: string;
  met?: string;
  criterionNotes?: string;
  recordLens?: boolean;
  lens?: string;
  finding?: string;
  status?: boolean;
  reset?: boolean;
  export?: boolean;
  help?: boolean;
}

// --- Parse CLI args ---

let values: ParsedArgs;
try {
  ({ values } = parseArgs({
  options: {
    thought: { type: "string" },
    thoughtNumber: { type: "string" },
    totalThoughts: { type: "string" },
    nextThoughtNeeded: { type: "string" },
    isRevision: { type: "boolean", default: false },
    revisesThought: { type: "string" },
    branchFromThought: { type: "string" },
    branchId: { type: "string" },
    needsMoreThoughts: { type: "boolean", default: false },
    newInsight: { type: "string" },
    newInsightNotes: { type: "string" },
    registerClaim: { type: "string" },
    verifyClaim: { type: "string" },
    claimStatus: { type: "string" },
    claimSource: { type: "string", multiple: true },
    claimTier: { type: "string", multiple: true },
    claimNotes: { type: "string" },
    supports: { type: "string" },
    claimQuote: { type: "string" },
    negativeQuery: { type: "string" },
    negativeFinding: { type: "string" },
    mode: { type: "string" },
    registerHypothesis: { type: "string" },
    resolveHypothesis: { type: "string" },
    hypothesisStatus: { type: "string" },
    hypothesisNotes: { type: "string" },
    falsification: { type: "string" },
    falsificationResult: { type: "string" },
    mergedInto: { type: "string" },
    addCriterion: { type: "string" },
    checkCriterion: { type: "string" },
    met: { type: "string" },
    criterionNotes: { type: "string" },
    recordLens: { type: "boolean", default: false },
    lens: { type: "string" },
    finding: { type: "string" },
    status: { type: "boolean", default: false },
    reset: { type: "boolean", default: false },
    export: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
}) as unknown as { values: ParsedArgs });
} catch (err: unknown) {
  const e = err as Error;
  fail(`Invalid arguments: ${e.message}`);
}

if (values.help) {
  console.log("Usage: bun scripts/think.ts [options]\nRun `bun scripts/think.ts --status` or pass `--thought` to begin.");
  process.exit(0);
}

const VALID_MODES: ThinkingMode[] = ["path-a", "path-b"];

/**
 * Resolve the session mode from --mode / persisted state.
 * The mode is fixed by the first classification (Step 0) and cannot be switched mid-session.
 */
function resolveMode(state: State, requested: string | undefined): ThinkingMode | undefined {
  if (requested != null) {
    if (!VALID_MODES.includes(requested as ThinkingMode)) {
      fail(`Invalid --mode: ${requested}. Must be one of: ${VALID_MODES.join(", ")}`);
    }
    const mode = requested as ThinkingMode;
    if (state.mode != null && state.mode !== mode) {
      fail(`Session mode is already '${state.mode}'. Step 0 classification is immutable; cannot switch to '${mode}'. Use --reset to start over.`);
    }
    state.mode = mode;
    return mode;
  }
  return state.mode;
}

/**
 * Side-commands operate on a classified session; without one, a pending claim or
 * hypothesis can be registered and then become unresolvable in Path A.
 */
function requireModeEstablished(state: State, requested: string | undefined): ThinkingMode {
  const mode = resolveMode(state, requested);
  if (mode == null) {
    fail("--mode must be established by a first thought before registering claims or hypotheses.");
  }
  // A terminated session is immutable — no side-command may mutate it either.
  const last = state.thoughtHistory[state.thoughtHistory.length - 1];
  if (last != null && last.nextThoughtNeeded === false) {
    fail(`Session already terminated at thought ${last.thoughtNumber} (nextThoughtNeeded=false). A terminated session is immutable; start a new one with --reset.`);
  }
  return mode;
}

// --- Command: Reset ---

/** Names of every operation flag that is set, excluding --reset/--export themselves. */
function otherOps(v: ParsedArgs): string[] {
  return [
    v.status && "--status",
    v.thought != null && "--thought",
    v.thoughtNumber != null && "--thoughtNumber",
    v.totalThoughts != null && "--totalThoughts",
    v.nextThoughtNeeded != null && "--nextThoughtNeeded",
    v.isRevision && "--isRevision",
    v.revisesThought != null && "--revisesThought",
    v.branchFromThought != null && "--branchFromThought",
    v.branchId != null && "--branchId",
    v.needsMoreThoughts && "--needsMoreThoughts",
    v.newInsight != null && "--newInsight",
    v.newInsightNotes != null && "--newInsightNotes",
    v.mode != null && "--mode",
    v.registerClaim != null && "--registerClaim",
    v.verifyClaim != null && "--verifyClaim",
    v.claimStatus != null && "--claimStatus",
    v.claimSource != null && "--claimSource",
    v.claimTier != null && "--claimTier",
    v.claimNotes != null && "--claimNotes",
    v.supports != null && "--supports",
    v.claimQuote != null && "--claimQuote",
    v.negativeQuery != null && "--negativeQuery",
    v.negativeFinding != null && "--negativeFinding",
    v.registerHypothesis != null && "--registerHypothesis",
    v.resolveHypothesis != null && "--resolveHypothesis",
    v.hypothesisStatus != null && "--hypothesisStatus",
    v.hypothesisNotes != null && "--hypothesisNotes",
    v.falsification != null && "--falsification",
    v.falsificationResult != null && "--falsificationResult",
    v.mergedInto != null && "--mergedInto",
    v.addCriterion != null && "--addCriterion",
    v.checkCriterion != null && "--checkCriterion",
    v.met != null && "--met",
    v.criterionNotes != null && "--criterionNotes",
    v.recordLens && "--recordLens",
    v.lens != null && "--lens",
    v.finding != null && "--finding",
  ].filter((x): x is string => typeof x === "string");
}

if (values.reset) {
  const combined = [...otherOps(values), ...(values.export ? ["--export"] : [])];
  if (combined.length > 0) {
    fail(`--reset cannot be combined with other operations (${combined.join(", ")}); run --reset alone.`);
  }
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  console.log(JSON.stringify({ status: "reset", message: "Thinking session cleared" }, null, 2));
  process.exit(0);
}

const state = loadState();

// Flag dependency matrix: a sub-flag supplied without its parent command flag
// would otherwise be parsed and silently dropped. One declarative table covers
// every parent/child pair; add a row when adding a new sub-flag.
const FLAG_REQUIRES: [keyof ParsedArgs, string][] = [
  ["claimStatus", "--verifyClaim"],
  ["claimSource", "--verifyClaim"],
  ["claimTier", "--verifyClaim"],
  ["claimQuote", "--verifyClaim"],
  ["negativeQuery", "--verifyClaim"],
  ["negativeFinding", "--verifyClaim"],
  ["claimNotes", "--verifyClaim"],
  ["supports", "--registerClaim"],
  ["falsification", "--registerHypothesis"],
  ["hypothesisStatus", "--resolveHypothesis"],
  ["hypothesisNotes", "--resolveHypothesis"],
  ["mergedInto", "--resolveHypothesis"],
  ["falsificationResult", "--resolveHypothesis"],
  ["met", "--checkCriterion"],
  ["criterionNotes", "--checkCriterion"],
  ["lens", "--recordLens"],
  ["finding", "--recordLens"],
  ["branchId", "--branchFromThought"],
  ["revisesThought", "--isRevision"],
];
for (const [child, parent] of FLAG_REQUIRES) {
  const childVal = values[child];
  const parentVal = values[parent.slice(2) as keyof ParsedArgs];
  // A parent passed as "" (e.g. --checkCriterion "") is not an active parent —
  // its handler has no emptiness guard and would misreport downstream. A
  // whitespace-only parent stays "present" so the command's own empty-value
  // error (e.g. "--registerClaim cannot be empty") fires first. Child presence
  // stays != null: a supplied-but-empty child is still a silently-dropped flag.
  const parentPresent = parentVal === true || (typeof parentVal !== "boolean" && parentVal != null && parentVal !== "");
  const childPresent = childVal === true || (typeof childVal !== "boolean" && childVal != null);
  if (childPresent && !parentPresent) {
    fail(`--${child} requires ${parent}; the argument would otherwise be ignored.`);
  }
}

// --- Command: Status ---

if (values.status && values.export) {
  fail("--export cannot be combined with other operations (--status); run --export alone.");
}

if (values.status) {
  // otherOps includes --status itself; exclude it so a bare --status passes.
  const combinedStatus = otherOps(values).filter(f => f !== "--status");
  if (combinedStatus.length > 0) {
    fail(`--status cannot be combined with other operations (${combinedStatus.join(", ")}); run --status alone.`);
  }
  const response = {
    ...makeStatusResponse(state),
    schemaVersion: state.schemaVersion,
    acceptanceCriteria: state.acceptanceCriteria,
    lenses: state.lenses,
    fullHistory: state.thoughtHistory,
    branchDetails: state.branches,
    claimDetails: state.claims,
    hypothesisDetails: state.hypotheses,
    auditTrail: state.auditTrail || [],
  };
  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
}

// --- Command: Export ---

if (values.export) {
  const combinedExport = otherOps(values);
  if (combinedExport.length > 0) {
    fail(`--export cannot be combined with other operations (${combinedExport.join(", ")}); run --export alone.`);
  }
  console.log(buildLintReport(state));
  process.exit(0);
}

// --- Command: Register Claim ---

if (values.registerClaim != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids external claims. Use internal derivation.");
  }
  if (values.registerClaim.trim() === "") fail("--registerClaim statement cannot be empty");
  // Path B linkage is mandatory: every claim must name the hypothesis it bears
  // on (Route B strict gatekeeper). Linkage to a nonexistent hypothesis is a
  // wiring error, not a soft warn.
  if (values.supports == null || values.supports.trim() === "") {
    fail("--supports <hyp-id> is required when --registerClaim is set: a claim must name the hypothesis it bears on.");
  }
  if (!state.hypotheses?.[values.supports]) {
    fail(`--supports target '${values.supports}' not found in state. Register the hypothesis first.`);
  }
  const count = Object.keys(state.claims).length + 1;
  const claimId = `claim-${count}`;
  const claim: Claim = {
    id: claimId,
    statement: values.registerClaim,
    registeredAtThought: state.thoughtHistory.length,
    sources: [],
    status: "pending",
    supports: values.supports,
  };
  state.claims[claimId] = claim;
  recordAudit(state, { op: "registerClaim", target: claimId, detail: values.registerClaim });
  saveState(state);
  console.log(JSON.stringify({ registered: claimId, statement: values.registerClaim, status: "pending" }, null, 2));
  process.exit(0);
}

// --- Command: Register Hypothesis ---

if (values.registerHypothesis != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids hypotheses. Use internal derivation.");
  }
  if (values.registerHypothesis.trim() === "") fail("--registerHypothesis statement cannot be empty");
  if (values.falsification == null || values.falsification.trim() === "") {
    fail("--falsification is required when --registerHypothesis is set: a hypothesis without a falsification clause cannot be tested.");
  }
  const count = Object.keys(state.hypotheses || {}).length + 1;
  const hypId = `hyp-${count}`;
  const hyp: Hypothesis = {
    id: hypId,
    statement: values.registerHypothesis,
    status: "pending",
    falsification: values.falsification,
  };
  if (!state.hypotheses) state.hypotheses = {};
  state.hypotheses[hypId] = hyp;
  recordAudit(state, { op: "registerHypothesis", target: hypId, detail: values.registerHypothesis });
  saveState(state);
  console.log(JSON.stringify({ registered: hypId, statement: values.registerHypothesis, status: "pending" }, null, 2));
  process.exit(0);
}

// --- Command: Resolve Hypothesis ---

if (values.resolveHypothesis != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids hypotheses. Use internal derivation.");
  }
  const hyp = state.hypotheses?.[values.resolveHypothesis];
  if (!hyp) fail(`Hypothesis ${values.resolveHypothesis} not found in state`);
  const status = values.hypothesisStatus as HypothesisStatus;
  if (!status) fail("--hypothesisStatus is required when --resolveHypothesis is set");

  const validStatuses: HypothesisStatus[] = ["pending", "selected", "rejected", "synthesized", "merged"];
  if (!validStatuses.includes(status)) {
    fail(`Invalid --hypothesisStatus: ${status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  // Merge checks run before notes/falsificationResult so misuse of --mergedInto
  // reports its own message even when resolution metadata is absent.
  if (values.mergedInto && status !== "merged") {
    fail("--mergedInto is only valid with --hypothesisStatus merged.");
  }

  if (status === "merged") {
    // A merge is documented by --mergedInto alone; an absorbed node has no
    // falsification outcome of its own, so supplying one is misuse.
    if (values.falsificationResult != null) {
      fail("--falsificationResult is not valid with --hypothesisStatus merged; the surviving hypothesis keeps the falsification outcome.");
    }
    const target = values.mergedInto;
    if (!target) fail("--mergedInto is required when --hypothesisStatus is 'merged' (which surviving hypothesis absorbed this one).");
    if (target === hyp.id) fail("--mergedInto cannot reference the hypothesis being resolved itself.");
    if (!state.hypotheses?.[target]) fail(`--mergedInto target '${target}' not found in state.`);
    if (state.hypotheses[target].status === "merged") fail(`--mergedInto target '${target}' is already merged into another hypothesis; merge chains are not allowed.`);
    if (state.hypotheses[target].status === "rejected") fail(`--mergedInto target '${target}' is already rejected; cannot merge into a rejected hypothesis.`);
    // Keep merges flat: if another hypothesis already merged INTO this one, this
    // one must stay put as the survivor — merging it onward would leave that
    // pointer stranded on a merged node (a two-hop chain).
    const victim = Object.values(state.hypotheses ?? {}).find(
      (h) => h.id !== hyp.id && h.mergedInto === hyp.id,
    );
    if (victim) {
      fail(`Hypothesis '${hyp.id}' already absorbs '${victim.id}' and cannot itself be merged onward; merge chains are not allowed. Re-point '${victim.id}' to '${target}' first.`);
    }
    // Project a clean object: only fields valid for the target status are
    // carried over, so a stale falsificationResult/notes can never survive a
    // merge regardless of which resolution ran before.
    const clean: Hypothesis = {
      id: hyp.id, statement: hyp.statement, status,
      falsification: hyp.falsification, mergedInto: target,
    };
    if (values.hypothesisNotes) clean.notes = values.hypothesisNotes;
    state.hypotheses![hyp.id] = clean;
  } else {
    // A survivor that still absorbs members (mergedInto pointers) cannot be
    // re-resolved to `rejected`/`pending`: that would strand each member's
    // mergedInto on a node that no longer carries them. `selected`/`synthesized`
    // keep the survivor a valid merge target, so they stay allowed.
    if (status === "rejected" || status === "pending") {
      const absorbed = Object.values(state.hypotheses ?? {}).find(
        (h) => h.id !== hyp.id && h.mergedInto === hyp.id,
      );
      if (absorbed) {
        fail(`Hypothesis '${hyp.id}' still absorbs '${absorbed.id}' (mergedInto -> '${hyp.id}') and cannot be re-resolved to '${status}'. Re-point '${absorbed.id}' to another survivor first.`);
      }
    }
    // Project a clean object: mergedInto/notes/falsificationResult are only
    // written when valid for this status, never deleted after the fact.
    const clean: Hypothesis = { id: hyp.id, statement: hyp.statement, status, falsification: hyp.falsification };
    if (values.hypothesisNotes) clean.notes = values.hypothesisNotes;
    if (values.falsificationResult != null) clean.falsificationResult = values.falsificationResult;
    state.hypotheses![hyp.id] = clean;
  }

  // Terminal resolutions must carry the falsification audit trail: what the
  // hypothesis predicted would falsify it, and whether that held. A merge is
  // documented by --mergedInto alone; the surviving hypothesis keeps its own
  // falsification outcome, so a merge has no notes/falsificationResult of its own.
  // Terminal resolutions must carry notes.
  if (status !== "pending") {
    if (values.hypothesisNotes == null || values.hypothesisNotes.trim() === "") {
      fail("--hypothesisNotes is required when resolving a hypothesis to a terminal status: record why this outcome was reached.");
    }
  }
  // Merges do not require falsificationResult (the surviving hypothesis keeps its own),
  // but all other terminal resolutions must record whether the falsification clause held or broke.
  if (status !== "pending" && status !== "merged") {
    if (values.falsificationResult == null || values.falsificationResult.trim() === "") {
      fail("--falsificationResult is required when resolving a hypothesis to a terminal status: record whether the falsification clause held or broke.");
    }
  }

  const updated = state.hypotheses![hyp.id];

  recordAudit(state, { op: "resolveHypothesis", target: hyp.id, detail: status === "merged" ? `merged->${values.mergedInto}` : status });
  saveState(state);
  console.log(JSON.stringify({ resolved: hyp.id, status: updated.status, mergedInto: updated.mergedInto, notes: updated.notes }, null, 2));
  process.exit(0);
}

// --- Command: Add Acceptance Criterion ---

if (values.addCriterion != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids acceptance criteria — they are a Path B construct.");
  }
  if (values.addCriterion.trim() === "") fail("--addCriterion text cannot be empty");
  const id = `crit-${state.acceptanceCriteria.length + 1}`;
  state.acceptanceCriteria.push({ id, criterion: values.addCriterion.trim() });
  recordAudit(state, { op: "addCriterion", target: id, detail: values.addCriterion.trim() });
  saveState(state);
  console.log(JSON.stringify({ added: id, criterion: values.addCriterion.trim(), met: null }, null, 2));
  process.exit(0);
}

// --- Command: Check Acceptance Criterion ---

if (values.checkCriterion != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids acceptance criteria — they are a Path B construct.");
  }
  const crit = state.acceptanceCriteria.find(c => c.id === values.checkCriterion);
  if (!crit) fail(`Criterion ${values.checkCriterion} not found in state`);
  if (values.met == null || (values.met !== "true" && values.met !== "false")) {
    fail(`--met must be 'true' or 'false' when --checkCriterion is set (got '${values.met ?? ""}'); any other value would silently leave the criterion unchecked.`);
  }
  crit.met = values.met === "true";
  crit.checkedAtHistoryIndex = state.thoughtHistory.length;
  crit.checkedAtThought = state.thoughtHistory.length;
  if (values.criterionNotes != null) crit.notes = values.criterionNotes;
  recordAudit(state, { op: "checkCriterion", target: crit.id, detail: values.met });
  saveState(state);
  console.log(JSON.stringify({ checked: crit.id, met: crit.met, checkedAtThought: crit.checkedAtHistoryIndex, notes: crit.notes }, null, 2));
  process.exit(0);
}

// --- Command: Record Lens Finding ---

if (values.recordLens) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids lens records — they are a Path B construct.");
  }
  if (values.lens == null || values.lens.trim() === "") fail("--lens is required when --recordLens is set");
  if (values.finding == null || values.finding.trim() === "") fail("--finding is required when --recordLens is set");
  const entry: LensFinding = { lens: values.lens.trim(), finding: values.finding.trim(), atThought: state.thoughtHistory.length };
  state.lenses.push(entry);
  recordAudit(state, { op: "recordLens", target: entry.lens, detail: entry.finding });
  saveState(state);
  console.log(JSON.stringify({ recorded: entry }, null, 2));
  process.exit(0);
}

/**
 * Known multi-segment public suffixes. Matches are checked against lowercase hostnames.
 * Static lookup table as Record<string, true> per rule ts-set-map.
 */
const MULTI_SEGMENT_SUFFIXES: Record<string, true> = {
  "co.uk": true,
  "gov.uk": true,
  "ac.uk": true,
  "org.uk": true,
  "com.tw": true,
  "org.tw": true,
  "edu.tw": true,
  "gov.tw": true,
  "com.au": true,
  "net.au": true,
  "org.au": true,
  "co.jp": true,
  "ne.jp": true,
  "co.nz": true,
  "org.nz": true,
  "ac.nz": true,
  "co.in": true,
  "firm.in": true,
  "net.in": true,
  "org.in": true,
  "com.br": true,
  "net.br": true,
  "org.br": true,
  "co.za": true,
  "org.za": true,
  "co.kr": true,
  "or.kr": true,
  "com.cn": true,
  "net.cn": true,
  "org.cn": true,
  "com.mx": true,
  "com.sg": true,
  "com.hk": true,
  "co.id": true,
  "com.tr": true,
  "gov.tr": true,
  "org.tr": true,
  "com.ar": true,
  "net.ar": true,
  "org.ar": true,
  "gov.ar": true,
  "co.il": true,
  "org.il": true,
  "gov.il": true,
  "co.th": true,
  "ac.th": true,
  "go.th": true,
  "com.ua": true,
  "org.ua": true,
  "gov.ua": true,
  "com.my": true,
  "gov.my": true,
  "org.my": true,
  "github.io": true,
  "gitlab.io": true,
  "herokuapp.com": true,
  "pages.dev": true,
  "vercel.app": true,
  "netlify.app": true,
  "web.app": true,
  "firebaseapp.com": true,
  "onrender.com": true,
  "railway.app": true,
  "fly.dev": true,
  "workers.dev": true,
  "azurewebsites.net": true,
  "cloudfront.net": true,
};

function rootDomain(urlStr: string): string {
  // A claim source must be an http(s) URL. Reject file:///, data:, bare
  // non-host strings ("foo/file"), and anything else that cannot name an
  // origin — before any scheme-tolerating fallback is attempted.
  const trimmed = urlStr.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    // Reject real scheme URLs that are not http(s) — file:///, data:, ftp:, etc.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.includes("://")) {
      fail(`--claimSource '${urlStr}' is not an http(s) URL; sources must name their origin domain.`);
    }
    // A bare host or host/path ("example.com/x") is tolerated only when the
    // leading token looks like a real domain (contains a dot, or is an IP).
    const lead = trimmed.split("/")[0];
    if (!lead.includes(".") && !/^(\d{1,3}\.){3}\d{1,3}$/.test(lead)) {
      fail(`--claimSource '${urlStr}' does not name a host; sources must name their origin domain.`);
    }
    urlStr = `https://${trimmed}`;
  }
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname.toLowerCase();
  } catch {
    fail(`--claimSource '${urlStr}' is not a parseable URL; sources must name their origin domain.`);
  }
  // "example.com." (FQDN root dot) is the same host as "example.com".
  hostname = hostname.replace(/\.+$/, "");
  // A bare IPv4/IPv6 host is its own domain — never join its "last two labels".
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) return hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  // Last two labels forming a known multi-segment public suffix mean the
  // registrable domain is three labels deep (bbc.co.uk, not co.uk).
  return MULTI_SEGMENT_SUFFIXES[parts.slice(-2).join(".")]
    ? parts.slice(-3).join(".")
    : parts.slice(-2).join(".");
}

// --- Command: Verify Claim ---

if (values.verifyClaim != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids claim verification. Use internal derivation.");
  }
  const claim = state.claims[values.verifyClaim];
  if (!claim) fail(`Claim ${values.verifyClaim} not found in state`);
  const sources = values.claimSource || [];
  const tiers = (values.claimTier || []).map(t => Number(t));
  const status = values.claimStatus as ClaimStatus;
  if (!status) fail("--claimStatus is required when --verifyClaim is set");

  const validStatuses: ClaimStatus[] = ["pending", "verified", "single_source", "unverified", "not_found"];
  if (!validStatuses.includes(status)) {
    fail(`Invalid --claimStatus: ${status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  // Guardrail 1c-shape: whenever --claimTier is supplied it must be a well-formed
  // tier vector — integers 1-4, one per --claimSource. This runs for every status,
  // not just verified, so a non-verified call cannot persist NaN or a tier list
  // that does not correspond to the recorded sources.
  if (tiers.length > 0) {
    // Digits only — rejects 1e0, 0x1, +1, 01, matching the thoughtNumber
    // convention. Must run before range-check since 1e0 coerces to 1.
    if ((values.claimTier || []).some(s => s !== String(Number(s)) || !Number.isInteger(Number(s)))) {
      fail(`--claimTier must be an integer 1-4 spelled as digits (Tier 1 primary ... Tier 4 prohibited). Got: ${(values.claimTier || []).join(", ")}`);
    }
    if (tiers.some(t => t < 1 || t > 4)) {
      fail(`--claimTier must be an integer 1-4 (Tier 1 primary ... Tier 4 prohibited). Got: ${(values.claimTier || []).join(", ")}`);
    }
    if (tiers.length !== sources.length) {
      fail(`--claimTier must have one --claimTier per --claimSource: found ${tiers.length} tier(s) for ${sources.length} source(s).`);
    }
  }

  // Guardrail 1: 2-source requirement for verified (count + distinct root domains)
  if (status === "verified") {
    const rootDomains = new Set(sources.map(rootDomain));
    if (sources.length < 2 || rootDomains.size < 2) {
      fail(`--claimStatus verified requires at least 2 independent --claimSource arguments from distinct root domains. Found ${sources.length} source(s), ${rootDomains.size} root domain(s). Use 'single_source' or 'unverified' if fewer.`);
    }

    // Guardrail 1c: --claimTier enforces references/source-tiers.md:40 —
    // "Even multiple Tier 3 sources cannot elevate a claim to verified".
    // Tiers align positionally with --claimSource: the i-th --claimTier classifies the i-th --claimSource.
    if (tiers.length === 0) {
      fail("--claimTier is required for --claimStatus verified: classify each --claimSource against references/source-tiers.md (1-4). Even multiple Tier 3 sources cannot elevate a claim to verified.");
    }

    const tier1or2 = tiers.filter(t => t <= 2).length;
    if (tier1or2 < 2) {
      fail(`--claimStatus verified requires at least 2 sources from Tier 1 or Tier 2 (references/source-tiers.md:40); found ${tier1or2}. Multiple Tier 3/4 sources cannot elevate a claim to verified - use 'single_source' or 'unverified'.`);
    }
    // Guardrail 1b (v3.0.0): verified claims must carry the evidence trio —
    // a quote anchoring the claim, plus a negative search attempt and its result.
    if (values.claimQuote == null || values.claimQuote.trim() === "") {
      fail("--claimQuote is required when --claimStatus is 'verified': record the verbatim source text that anchors this claim.");
    }
    if (values.negativeQuery == null || values.negativeQuery.trim() === "") {
      fail("--negativeQuery is required when --claimStatus is 'verified': record the counter-evidence search you ran.");
    }
    if (values.negativeFinding == null || values.negativeFinding.trim() === "") {
      fail("--negativeFinding is required when --claimStatus is 'verified': record what the counter-evidence search found (or that none existed).");
    }
  }

  // Guardrail 3: a verified claim is final — it may be re-verified, never demoted.
  if (claim.status === "verified" && status !== "verified") {
    fail(`Claim ${claim.id} cannot demote verified claim to ${status}; verification results are final.`);
  }

  // Guardrail 2: negative resolutions require a recorded caveat
  if ((status === "single_source" || status === "unverified" || status === "not_found") && !values.claimNotes) {
    fail(`--claimStatus ${status} requires --claimNotes explaining why the claim could not be fully verified`);
  }

  // Project a clean claim per target status: fields that do not belong to the
  // status are never written, so a pending re-verify cannot strand evidence and
  // a non-pending re-verify cannot strand stale verification fields.
  const projected: Claim = {
    id: claim.id, statement: claim.statement, registeredAtThought: claim.registeredAtThought,
    sources: status === "pending" && sources.length === 0 ? claim.sources : sources,
    status,
  };
  if (claim.supports != null) projected.supports = claim.supports;
  if (status !== "pending") {
    if (tiers.length > 0) projected.tiers = tiers;
    else if (claim.tiers != null) projected.tiers = claim.tiers; // un-tiered re-verify keeps prior tiers
    if (values.claimNotes) projected.notes = values.claimNotes;
    if (values.claimQuote != null) projected.quote = values.claimQuote;
    if (values.negativeQuery != null) projected.negativeQuery = values.negativeQuery;
    if (values.negativeFinding != null) projected.negativeFinding = values.negativeFinding;
  }
  state.claims[claim.id] = projected;

  recordAudit(state, { op: "verifyClaim", target: claim.id, detail: status });
  saveState(state);
  console.log(JSON.stringify({ verified: claim.id, status: projected.status, sources: projected.sources, notes: projected.notes }, null, 2));
  process.exit(0);
}

// --- Thought submission flow ---

// Validate numeric arguments eagerly so malformed values fail fast.
// Decimal digits only: rejects "1e1", "0x10", " 5", "+5", "5.0".
if (values.thoughtNumber != null) {
  const tn = Number(values.thoughtNumber);
  if (!/^\d+$/.test(values.thoughtNumber) || !Number.isSafeInteger(tn) || tn < 1) fail("--thoughtNumber must be an integer >= 1");
}
if (values.totalThoughts != null) {
  const tt = Number(values.totalThoughts);
  if (!/^\d+$/.test(values.totalThoughts) || !Number.isSafeInteger(tt) || tt < 1) fail("--totalThoughts must be an integer >= 1");
}

if (values.thought == null) fail("--thought is required");
if (values.thought.trim() === "") fail("--thought cannot be empty");
if (!values.thoughtNumber) fail("--thoughtNumber is required");
if (!values.totalThoughts) fail("--totalThoughts is required");
if (!values.nextThoughtNeeded) fail("--nextThoughtNeeded is required");

const thoughtNumber = Number(values.thoughtNumber);
let totalThoughts = Number(values.totalThoughts);
const nextRaw = values.nextThoughtNeeded.toLowerCase();
if (nextRaw !== "true" && nextRaw !== "false") {
  fail(`--nextThoughtNeeded must be 'true' or 'false' (got '${values.nextThoughtNeeded}'); any other value would silently terminate the session.`);
}
const nextThoughtNeeded = nextRaw === "true";

// --newInsight is the convergence declaration: only 'false' (with optional
// --newInsightNotes) is a valid terminating/explanatory value. 'true' just
// duplicates --nextThoughtNeeded true and would silently skip gate 9.
if (values.newInsight != null && values.newInsight !== "false") {
  fail(`--newInsight must be 'false' when set (got '${values.newInsight}'); a 'true' value duplicates --nextThoughtNeeded and is not a convergence declaration.`);
}

// Session immutability: a concluded session (last recorded thought had
// nextThoughtNeeded=false) must not accept further thoughts. Restart with --reset.
const lastRecorded = state.thoughtHistory[state.thoughtHistory.length - 1];
if (lastRecorded != null && lastRecorded.nextThoughtNeeded === false) {
  fail(`Session already terminated at thought ${lastRecorded.thoughtNumber} (nextThoughtNeeded=false). A terminated session is immutable; start a new one with --reset.`);
}

if (thoughtNumber > totalThoughts) {
  console.error(`Note: totalThoughts adjusted ${totalThoughts}->${thoughtNumber} (--thoughtNumber exceeded the declared estimate).`);
  totalThoughts = thoughtNumber;
}

// Track mode (Step 0 classification is mandatory on the first thought of a session).
// History must be empty AND the flag present — a side-command setting state.mode
// earlier does not waive the documented first-thought requirement.
if (state.thoughtHistory.length === 0 && values.mode == null) {
  fail("--mode is required on the first thought of a session: 'path-a' (closed-form) or 'path-b' (open-ended). Step 0 classification is mandatory.");
}
const resolvedMode = resolveMode(state, values.mode);
if (resolvedMode == null) {
  fail("--mode is required on the first thought of a session: 'path-a' (closed-form) or 'path-b' (open-ended). Step 0 classification is mandatory.");
}

// Path A hard cap: depth expansion beyond 5 thoughts is prohibited
if (state.mode === "path-a") {
  const currentTotal = state.thoughtHistory.length + 1;
  if (currentTotal > 5) {
    fail(`Path A depth exceeds 5 thoughts (${currentTotal}/5); conclude or escalate to Path B via --reset.`);
  }
}

// --- Termination Hard Gates (when nextThoughtNeeded is false) ---
if (!nextThoughtNeeded) {
  // Gate 1: Cannot terminate if any claim is still pending
  const pending = Object.values(state.claims).filter(c => c.status === "pending");
  if (pending.length > 0) {
    fail(`Cannot terminate with --nextThoughtNeeded false: ${pending.length} claim(s) still pending: ${pending.map(c => c.id).join(", ")}. Resolve all claims via --verifyClaim before concluding.`);
  }

  // Gate 2 (Path A): Minimum 3 thoughts (including this concluding thought, total thoughts in history + this one >= 3)
  if (state.mode === "path-a") {
    const totalCount = state.thoughtHistory.length + 1;
    if (totalCount < 3) {
      fail(`Path A requires at least 3 thoughts (1: Restate/Constraints -> 2: Derive -> 3: Cross-validate). Current: ${totalCount}.`);
    }
  }

  // Gate 3 (Path B): Minimum 2 hypotheses registered, none pending
  if (state.mode === "path-b") {
    const hypList = Object.values(state.hypotheses || {});
    if (hypList.length < 2) {
      fail(`Path B requires at least 2 hypotheses (registered via --registerHypothesis). Found ${hypList.length}.`);
    }
    const pendingHyps = hypList.filter(h => h.status === "pending");
    if (pendingHyps.length > 0) {
      fail(`Path B requires all hypotheses to be resolved (selected, rejected, synthesized, or merged). ${pendingHyps.length} hypotheses still pending: ${pendingHyps.map(h => h.id).join(", ")}.`);
    }

    // Gate 3b (Path B): termination requires at least 2 distinct hypotheses after merges
    const distinctHyps = hypList.filter(h => h.status !== "merged");
    if (distinctHyps.length < 2) {
      fail(`Path B termination requires at least 2 distinct hypotheses after merges; currently ${distinctHyps.length} (${distinctHyps.map(h => h.id).join(", ")}).`);
    }
    // Termination with every hypothesis rejected is an unresolved conclusion:
    // at least one must carry forward (selected or synthesized).
    const carried = hypList.filter(h => h.status === "selected" || h.status === "synthesized");
    if (carried.length === 0) {
      fail("Path B termination requires at least one hypothesis to be selected or synthesized; all resolved hypotheses are rejected.");
    }

    // Gate 4 (Path B): convergence requires at least one decompose + one synthesis round
    if (state.thoughtHistory.length < 2) {
      fail(`Path B requires at least 2 prior thoughts before termination (decompose, then synthesize). Current: ${state.thoughtHistory.length}.`);
    }

    // Gate 5 (Path B): cannot conclude immediately after flagging for depth expansion
    const previousThought = state.thoughtHistory[state.thoughtHistory.length - 1];
    if (previousThought.needsMoreThoughts) {
      fail(`Cannot terminate with --nextThoughtNeeded false: the previous thought (${previousThought.thoughtNumber}) set --needsMoreThoughts, signalling new insight was still being sought. Submit at least one more thought.`);
    }

    // --- Reasoning-Depth Hard Gates 6-10 (plan v3.4 §6) ---

    // Gate 6 (criteria): ≥1 acceptance criterion registered, and ALL must be checked
    const critList = state.acceptanceCriteria;
    if (critList.length === 0) {
      enforceGate("criteria", "Path B termination requires at least 1 acceptance criterion registered via --addCriterion. Found 0.");
    } else {
      const unchecked = critList.filter(c => c.met === undefined);
      if (unchecked.length > 0) {
        enforceGate("criteria", `Path B termination requires all acceptance criteria to be checked via --checkCriterion. ${unchecked.length} unchecked: ${unchecked.map(c => c.id).join(", ")}.`);
      }
    }

    // Gate 7 (criteriaRevision): any met=false criterion requires a subsequent revision
    // thought (thoughtNumber > checkedAtThought), unless this terminating thought
    // carries non-empty --newInsightNotes as an explicit residual-risk rationale.
    const unmetList = critList.filter(c => c.met === false);
    if (unmetList.length > 0) {
      const hasRationale = values.newInsightNotes != null && values.newInsightNotes.trim().length > 0;
      if (!hasRationale) {
        // Need every unmet criterion to be followed by a revision thought
        for (const unmet of unmetList) {
          const checkedAt = unmet.checkedAtHistoryIndex ?? unmet.checkedAtThought ?? -1;
          const subsequentRevision = state.thoughtHistory.some(
            (t, idx) => t.isRevision && idx + 1 > checkedAt,
          );
          if (!subsequentRevision) {
            enforceGate(
              "criteriaRevision",
              `Criterion ${unmet.id} marked met=false at thought ${checkedAt} without a subsequent --isRevision thought addressing it. Revise or supply --newInsightNotes explaining why termination is safe.`,
            );
            break;
          }
        }
      }
    }

    // Gate 8 (lenses): ≥2 distinct lens names recorded (case/NFKC normalized)
    const distinctLenses = new Set(state.lenses.map(l => l.lens.normalize("NFKC").toLowerCase()));
    if (distinctLenses.size < 2) {
      enforceGate(
        "lenses",
        `Path B termination requires at least 2 distinct perspective lenses recorded via --recordLens (found ${distinctLenses.size}: ${[...distinctLenses].join(", ") || "none"}).`,
      );
    }

    // Gate 9 (convergence): terminating thought must declare --newInsight false
    // (with optional notes), OR the history must prove exploration via a revision
    // or branch. A bare conclusion without either cannot claim convergence.
    const hasBranchOrRevision = state.thoughtHistory.some(
      t => t.isRevision || t.branchFromThought != null,
    );
    const declaredConvergence = values.newInsight === "false" && values.newInsightNotes != null && values.newInsightNotes.trim().length > 0;
    if (!hasBranchOrRevision && !declaredConvergence) {
      enforceGate(
        "convergence",
        "Path B termination requires a convergence declaration (--newInsight false --newInsightNotes '...') or prior exploration in history (--isRevision or --branchFromThought).",
      );
    }

    // Gate 10 (falsificationResult): consistency assert — every resolved hypothesis
    // must have a non-empty falsificationResult.
    for (const h of hypList) {
      if (h.status !== "pending" && h.status !== "merged" && (!h.falsificationResult || h.falsificationResult.trim().length === 0)) {
        enforceGate(
          "falsificationResult",
          `Hypothesis ${h.id} is resolved (${h.status}) but lacks a non-empty falsificationResult in state.`,
        );
      }
    }
  }
}

const thoughtData: ThoughtData = {
  thought: values.thought,
  thoughtNumber,
  totalThoughts,
  nextThoughtNeeded,
};

if (values.isRevision) {
  if (values.branchFromThought != null) fail("--isRevision and --branchFromThought are mutually exclusive");
  if (!values.revisesThought) fail("--revisesThought is required when --isRevision is set");
  if (!/^\d+$/.test(values.revisesThought)) fail("--revisesThought must be an integer >= 1");
  const revisesThought = parseInt(values.revisesThought, 10);
  if (isNaN(revisesThought) || revisesThought < 1) fail("--revisesThought must be an integer >= 1");
  if (!state.thoughtHistory.some(t => t.thoughtNumber === revisesThought)) {
    fail(`Cannot revise thought ${revisesThought}: not found in history`);
  }
  thoughtData.isRevision = true;
  thoughtData.revisesThought = revisesThought;
}

if (values.branchFromThought != null) {
  if (!values.branchId) fail("--branchId is required when --branchFromThought is set");
  if (!/^\d+$/.test(values.branchFromThought)) fail("--branchFromThought must be an integer >= 1");
  const branchFrom = parseInt(values.branchFromThought, 10);
  if (isNaN(branchFrom) || branchFrom < 1) fail("--branchFromThought must be an integer >= 1");
  if (!state.thoughtHistory.some(t => t.thoughtNumber === branchFrom)) {
    fail(`Cannot branch from thought ${branchFrom}: not found in history`);
  }
  thoughtData.branchFromThought = branchFrom;
  thoughtData.branchId = values.branchId;
}

if (values.needsMoreThoughts) {
  thoughtData.needsMoreThoughts = true;
}

if (values.newInsight != null) {
  thoughtData.newInsight = false; // only 'false' reaches here (validated above)
}
if (values.newInsightNotes != null && values.newInsightNotes.trim() !== "") {
  thoughtData.newInsightNotes = values.newInsightNotes;
}

thoughtData.historyIndex = state.thoughtHistory.length + 1;

if (!thoughtData.isRevision && state.thoughtHistory.some(t => t.thoughtNumber === thoughtNumber)) {
  fail(`thought ${thoughtNumber} already exists in history`);
}

state.thoughtHistory.push(thoughtData);

if (thoughtData.branchFromThought != null && thoughtData.branchId != null) {
  if (!state.branches[thoughtData.branchId]) {
    state.branches[thoughtData.branchId] = [];
  }
  state.branches[thoughtData.branchId].push(thoughtData);
}

saveState(state);

// Output
console.error(formatThought(thoughtData));

const status = makeStatusResponse(state);
const branchList = status.branches.length > 0 ? ` branches=${status.branches.join(",")}` : "";
const claimList = status.claims.length > 0 ? ` claims=${status.claims.join(",")}` : "";
const hypList = status.hypotheses.length > 0 ? ` hypotheses=${status.hypotheses.join(",")}` : "";
const modeStr = status.mode ? ` mode=${status.mode}` : "";
console.log(`[${status.thoughtNumber}/${status.totalThoughts}] history=${status.thoughtHistoryLength}${modeStr}${branchList}${claimList}${hypList} next=${status.nextThoughtNeeded}`);

if (!nextThoughtNeeded) {
  console.log("");
  console.log(buildLintReport(state));
}
