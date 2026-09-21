#!/usr/bin/env bun
/**
 * claude-reasoning 2.0.0 — Sequential thinking state machine with claim-gated verification.
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

export interface State {
  thoughtHistory: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
  claims: Record<string, Claim>;
}

function loadState(): State {
  if (existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      return {
        thoughtHistory: data.thoughtHistory || [],
        branches: data.branches || {},
        claims: data.claims || {},
      };
    } catch {
      return { thoughtHistory: [], branches: {}, claims: {} };
    }
  }
  return { thoughtHistory: [], branches: {}, claims: {} };
}

function saveState(state: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
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

  if (historyLength === 0) {
    return {
      thoughtNumber: 0,
      totalThoughts: 0,
      nextThoughtNeeded: true,
      branches: branchIds,
      thoughtHistoryLength: historyLength,
      claims: claimIds,
      pendingClaims,
    };
  }

  const latest = state.thoughtHistory[historyLength - 1];
  return {
    thoughtNumber: latest.thoughtNumber,
    totalThoughts: latest.totalThoughts,
    nextThoughtNeeded: latest.nextThoughtNeeded,
    branches: branchIds,
    thoughtHistoryLength: historyLength,
    claims: claimIds,
    pendingClaims,
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
    status: { type: "boolean", default: false },
    reset: { type: "boolean", default: false },
  },
  strict: true,
});

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
  };
  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
}

// --- Command: Register Claim ---

if (values.registerClaim) {
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
  saveState(state);
  console.log(JSON.stringify({ registered: claimId, statement: values.registerClaim, status: "pending" }, null, 2));
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

  // Guardrail 1: 2-source requirement for verified
  if (status === "verified" && sources.length < 2) {
    fail(`--claimStatus verified requires at least 2 independent --claimSource arguments. Found ${sources.length}. Use 'single_source' or 'unverified' if fewer.`);
  }

  claim.status = status;
  claim.sources = sources;
  if (values.claimNotes) claim.notes = values.claimNotes;

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

// Guardrail 2: Cannot terminate if any claim is still pending
if (!nextThoughtNeeded) {
  const pending = Object.values(state.claims).filter(c => c.status === "pending");
  if (pending.length > 0) {
    fail(`Cannot terminate with --nextThoughtNeeded false: ${pending.length} claim(s) still pending: ${pending.map(c => c.id).join(", ")}. Resolve all claims via --verifyClaim before concluding.`);
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
console.log(`[${status.thoughtNumber}/${status.totalThoughts}] history=${status.thoughtHistoryLength}${branchList}${claimList} next=${status.nextThoughtNeeded}`);
