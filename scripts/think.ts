#!/usr/bin/env bun
/**
 * claude-reasoning 2.1.1 — Sequential thinking state machine with claim-gated verification.
 * Zero MCP dependencies. Persistent state in .think_state.json.
 *
 * Upstream foundation: thedotmack/sequential-thinking-skill (MIT License)
 * Enhanced with Claim Pre-registration, Dual-Source Verification, and Guardrails.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, ".think_state.json");

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

export type ClaimStatus = "pending" | "verified" | "single_source" | "unverified" | "not_found";

export interface Claim {
  id: string;
  statement: string;
  registeredAtThought: number;
  sources: string[];
  status: ClaimStatus;
  notes?: string;
}

export type HypothesisStatus = "pending" | "selected" | "rejected" | "synthesized";

export interface Hypothesis {
  id: string;
  statement: string;
  status: HypothesisStatus;
  notes?: string;
}

export type ThinkingMode = "path-a" | "path-b";

export interface AuditEntry {
  op: "registerClaim" | "verifyClaim" | "registerHypothesis" | "resolveHypothesis";
  target: string;
  detail?: string;
}

export interface State {
  mode?: ThinkingMode;
  thoughtHistory: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
  claims: Record<string, Claim>;
  hypotheses: Record<string, Hypothesis>;
  auditTrail?: AuditEntry[];
}

function loadState(): State {
  if (existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      return {
        mode: data.mode,
        thoughtHistory: data.thoughtHistory || [],
        branches: data.branches || {},
        claims: data.claims || {},
        hypotheses: data.hypotheses || {},
        auditTrail: data.auditTrail || [],
      };
    } catch {
      return { thoughtHistory: [], branches: {}, claims: {}, hypotheses: {}, auditTrail: [] };
    }
  }
  return { thoughtHistory: [], branches: {}, claims: {}, hypotheses: {}, auditTrail: [] };
}

function saveState(state: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function recordAudit(state: State, entry: AuditEntry): void {
  if (!state.auditTrail) state.auditTrail = [];
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

// --- Parse CLI args ---

const { values } = parseArgs({
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
    registerClaim: { type: "string" },
    verifyClaim: { type: "string" },
    claimStatus: { type: "string" },
    claimSource: { type: "string", multiple: true },
    claimNotes: { type: "string" },
    mode: { type: "string" },
    registerHypothesis: { type: "string" },
    resolveHypothesis: { type: "string" },
    hypothesisStatus: { type: "string" },
    hypothesisNotes: { type: "string" },
    status: { type: "boolean", default: false },
    reset: { type: "boolean", default: false },
  },
  strict: true,
});

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

// --- Command: Reset ---

if (values.reset) {
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  console.log(JSON.stringify({ status: "reset", message: "Thinking session cleared" }, null, 2));
  process.exit(0);
}

const state = loadState();

// --- Command: Status ---

if (values.status) {
  const response = {
    ...makeStatusResponse(state),
    fullHistory: state.thoughtHistory,
    branchDetails: state.branches,
    claimDetails: state.claims,
    auditTrail: state.auditTrail || [],
  };
  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
}

// --- Command: Register Claim ---

if (values.registerClaim) {
  resolveMode(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids external claims. Use internal derivation.");
  }
  const count = Object.keys(state.claims).length + 1;
  const claimId = `claim-${count}`;
  const claim: Claim = {
    id: claimId,
    statement: values.registerClaim,
    registeredAtThought: state.thoughtHistory.length + 1,
    sources: [],
    status: "pending",
  };
  state.claims[claimId] = claim;
  recordAudit(state, { op: "registerClaim", target: claimId, detail: values.registerClaim });
  saveState(state);
  console.log(JSON.stringify({ registered: claimId, statement: values.registerClaim, status: "pending" }, null, 2));
  process.exit(0);
}

// --- Command: Register Hypothesis ---

if (values.registerHypothesis) {
  resolveMode(state, values.mode);
  const count = Object.keys(state.hypotheses || {}).length + 1;
  const hypId = `hyp-${count}`;
  const hyp: Hypothesis = {
    id: hypId,
    statement: values.registerHypothesis,
    status: "pending",
  };
  if (!state.hypotheses) state.hypotheses = {};
  state.hypotheses[hypId] = hyp;
  recordAudit(state, { op: "registerHypothesis", target: hypId, detail: values.registerHypothesis });
  saveState(state);
  console.log(JSON.stringify({ registered: hypId, statement: values.registerHypothesis, status: "pending" }, null, 2));
  process.exit(0);
}

// --- Command: Resolve Hypothesis ---

if (values.resolveHypothesis) {
  resolveMode(state, values.mode);
  const hyp = state.hypotheses?.[values.resolveHypothesis];
  if (!hyp) fail(`Hypothesis ${values.resolveHypothesis} not found in state`);
  const status = values.hypothesisStatus as HypothesisStatus;
  if (!status) fail("--hypothesisStatus is required when --resolveHypothesis is set");

  const validStatuses: HypothesisStatus[] = ["pending", "selected", "rejected", "synthesized"];
  if (!validStatuses.includes(status)) {
    fail(`Invalid --hypothesisStatus: ${status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  hyp.status = status;
  if (values.hypothesisNotes) hyp.notes = values.hypothesisNotes;

  recordAudit(state, { op: "resolveHypothesis", target: hyp.id, detail: status });
  saveState(state);
  console.log(JSON.stringify({ resolved: hyp.id, status: hyp.status, notes: hyp.notes }, null, 2));
  process.exit(0);
}

// --- Command: Verify Claim ---

if (values.verifyClaim) {
  const claim = state.claims[values.verifyClaim];
  if (!claim) fail(`Claim ${values.verifyClaim} not found in state`);
  const sources = values.claimSource || [];
  const status = values.claimStatus as ClaimStatus;
  if (!status) fail("--claimStatus is required when --verifyClaim is set");

  const validStatuses: ClaimStatus[] = ["pending", "verified", "single_source", "unverified", "not_found"];
  if (!validStatuses.includes(status)) {
    fail(`Invalid --claimStatus: ${status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  // Guardrail 1: 2-source requirement for verified (count + distinct root domains)
  if (status === "verified") {
    const rootDomains = new Set(
      sources.map(s => {
        try {
          return new URL(s).hostname.split(".").slice(-2).join(".");
        } catch {
          return s; // malformed URL counts as its own bucket -> fails dual-domain check
        }
      })
    );
    if (sources.length < 2 || rootDomains.size < 2) {
      fail(`--claimStatus verified requires at least 2 independent --claimSource arguments from distinct root domains. Found ${sources.length} source(s), ${rootDomains.size} root domain(s). Use 'single_source' or 'unverified' if fewer.`);
    }
  }

  // Guardrail 2: negative resolutions require a recorded caveat
  if ((status === "single_source" || status === "unverified" || status === "not_found") && !values.claimNotes) {
    fail(`--claimStatus ${status} requires --claimNotes explaining why the claim could not be fully verified`);
  }

  claim.status = status;
  claim.sources = sources;
  if (values.claimNotes) claim.notes = values.claimNotes;

  recordAudit(state, { op: "verifyClaim", target: claim.id, detail: status });
  saveState(state);
  console.log(JSON.stringify({ verified: claim.id, status: claim.status, sources: claim.sources, notes: claim.notes }, null, 2));
  process.exit(0);
}

// --- Thought submission flow ---

if (!values.thought) fail("--thought is required");
if (!values.thoughtNumber) fail("--thoughtNumber is required");
if (!values.totalThoughts) fail("--totalThoughts is required");
if (!values.nextThoughtNeeded) fail("--nextThoughtNeeded is required");

const thoughtNumber = parseInt(values.thoughtNumber, 10);
let totalThoughts = parseInt(values.totalThoughts, 10);
const nextThoughtNeeded = values.nextThoughtNeeded.toLowerCase() === "true";

if (isNaN(thoughtNumber) || thoughtNumber < 1) fail("--thoughtNumber must be an integer >= 1");
if (isNaN(totalThoughts) || totalThoughts < 1) fail("--totalThoughts must be an integer >= 1");

if (thoughtNumber > totalThoughts) {
  totalThoughts = thoughtNumber;
}

// Track mode (Step 0 classification is mandatory on the first thought of a session)
const resolvedMode = resolveMode(state, values.mode);
if (resolvedMode == null) {
  fail("--mode is required on the first thought of a session: 'path-a' (closed-form) or 'path-b' (open-ended). Step 0 classification is mandatory.");
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
      fail(`Path B requires all hypotheses to be resolved (selected, rejected, or synthesized). ${pendingHyps.length} hypotheses still pending: ${pendingHyps.map(h => h.id).join(", ")}.`);
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
  }
}

const thoughtData: ThoughtData = {
  thought: values.thought,
  thoughtNumber,
  totalThoughts,
  nextThoughtNeeded,
};

if (values.isRevision) {
  if (!values.revisesThought) fail("--revisesThought is required when --isRevision is set");
  const revisesThought = parseInt(values.revisesThought, 10);
  if (isNaN(revisesThought) || revisesThought < 1) fail("--revisesThought must be an integer >= 1");
  thoughtData.isRevision = true;
  thoughtData.revisesThought = revisesThought;
}

if (values.branchFromThought != null) {
  if (!values.branchId) fail("--branchId is required when --branchFromThought is set");
  const branchFrom = parseInt(values.branchFromThought, 10);
  if (isNaN(branchFrom) || branchFrom < 1) fail("--branchFromThought must be an integer >= 1");
  thoughtData.branchFromThought = branchFrom;
  thoughtData.branchId = values.branchId;
}

if (values.needsMoreThoughts) {
  thoughtData.needsMoreThoughts = true;
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
