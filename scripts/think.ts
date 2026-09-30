#!/usr/bin/env bun
/**
 * claude-reasoning 2.2.5 - Sequential thinking state machine with claim-gated verification.
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
const STATE_FILE = process.env.THINK_STATE_FILE || join(__dirname, ".think_state.json");

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

export type HypothesisStatus = "pending" | "selected" | "rejected" | "synthesized" | "merged";

export interface Hypothesis {
  id: string;
  statement: string;
  status: HypothesisStatus;
  notes?: string;
  mergedInto?: string;
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

// --- Conclusion card (--export) ---

type CalibratedTag = "[Confirmed]" | "[Probable]" | "[Plausible]" | "[Contested]" | "[Unverified]";

const TAG_BY_CLAIM_STATUS: Record<ClaimStatus, CalibratedTag> = {
  verified: "[Confirmed]",
  single_source: "[Probable]",
  unverified: "[Unverified]",
  not_found: "[Unverified]",
  pending: "[Unverified]",
};

/** Quote multi-line free text so user content can never forge card headings. */
function quoteBlock(text: string): string {
  return text.split("\n").map(l => `> ${l}`).join("\n");
}

/**
 * Derive a markdown conclusion card purely from persisted state — no invented
 * content. It is a FACT SHEET: it reports what was recorded (selected
 * hypotheses with their rationale, claim outcomes, the final thought, the
 * trace shape) and deliberately does NOT rate the reasoning itself. The
 * calibrated final answer is still written by the model per
 * references/conclusion-card.md.
 *
 * Design rules (2.2.5):
 *  - Claims are not linked to hypotheses, so claim statistics are reported as
 *    "fact-check coverage" and never promote the primary finding to [Confirmed].
 *  - Path A has no claims by contract; it is never penalised for that.
 *  - Free text is block-quoted; every selected/merged hypothesis is listed.
 */
function buildConclusionCard(state: State): string {
  const claims = Object.values(state.claims);
  const hypotheses = Object.values(state.hypotheses || {});
  const history = state.thoughtHistory;
  const isPathA = state.mode === "path-a";
  const terminated = history.length > 0 && history[history.length - 1].nextThoughtNeeded === false;

  const selected = hypotheses.filter(h => h.status === "selected" || h.status === "synthesized");
  const rejected = hypotheses.filter(h => h.status === "rejected");
  const merged = hypotheses.filter(h => h.status === "merged");
  const openHyp = hypotheses.filter(h => h.status === "pending");
  const lastThought = history.length > 0 ? history[history.length - 1].thought : null;

  const verifiedN = claims.filter(c => c.status === "verified").length;
  const singleN = claims.filter(c => c.status === "single_source").length;
  const unresolvedN = claims.length - verifiedN;

  // Primary finding: a reasoning-derived conclusion is [Plausible] by definition;
  // external facts are calibrated separately in "Calibrated Findings".
  let primary: string;
  if (selected.length > 0) {
    primary = selected
      .map(h => `[Plausible] ${h.statement}${h.notes ? ` — why: ${h.notes}` : ""} (${h.id})`)
      .join("\n");
  } else if (isPathA && lastThought != null) {
    primary = `[Plausible] See final thought below (closed-form; correctness rests on independent cross-validation).`;
  } else if (hypotheses.length > 0) {
    primary = "No hypothesis was selected or synthesized; see final thought below.";
  } else {
    primary = "No hypothesis registered; see final thought below.";
  }

  const findingLines = claims.map(c => {
    const note = c.notes ? ` — ${c.notes}` : "";
    return `- ${TAG_BY_CLAIM_STATUS[c.status]} ${c.statement} (${c.id})${note}`;
  });

  let confidence: string[];
  if (isPathA) {
    confidence = [
      "- Level: n/a (closed-form)",
      "- Rationale: no external claims by contract; correctness rests on the independent cross-validation recorded in the thoughts.",
    ];
  } else if (claims.length === 0) {
    confidence = [
      "- Level: not rated by script",
      "- Rationale: no external claims registered (correct when the question is purely internal); rate the reasoning in the final answer.",
    ];
  } else {
    const level = verifiedN === claims.length ? "High" : verifiedN > 0 || singleN > 0 ? "Medium" : "Low";
    confidence = [
      `- Level (fact-check coverage only): ${level}`,
      `- Rationale: ${verifiedN}/${claims.length} claims verified, ${singleN} single-source, ${claims.length - verifiedN - singleN} unverified/not found. Claims are not linked to hypotheses, so this does not rate the reasoning itself.`,
    ];
  }

  const evidenceUrls = [...new Set(claims.flatMap(c => c.sources))];

  const residual: string[] = [];
  for (const c of claims) {
    if (c.status !== "verified") {
      residual.push(`- [Unverified] Re-verify ${c.id} (${c.status})${c.notes ? `: ${c.notes}` : ""}`);
    }
  }
  for (const h of openHyp) residual.push(`- [Unverified] Hypothesis ${h.id} still pending resolution`);
  if (residual.length === 0) {
    residual.push(claims.length > 0 ? "- All registered claims verified (blind spots outside the registered claims are not tracked)." : "- None recorded by script.");
  }

  const nextSteps: string[] = [];
  if (!terminated) nextSteps.push("- Session still open; continue thinking or submit a terminating thought with --nextThoughtNeeded false.");
  if (unresolvedN > 0) nextSteps.push("- Re-verify unresolved claims via --verifyClaim with independent sources.");
  if (openHyp.length > 0) nextSteps.push("- Resolve pending hypotheses via --resolveHypothesis.");
  if (nextSteps.length === 0) nextSteps.push("- None from script gates. The final answer must still be written by the model per references/conclusion-card.md.");

  const revisions = history.filter(t => t.isRevision).length;
  const branchIds = Object.keys(state.branches);
  const trace = `- Thoughts: ${history.length} (revisions: ${revisions}, branches: ${branchIds.length > 0 ? branchIds.join(", ") : "none"})`;

  const sections: string[] = [
    `# Conclusion Card${state.mode ? ` (${state.mode})` : ""}`,
    "",
    "## Primary Finding",
    primary,
    "",
    "## Calibrated Findings",
    findingLines.length > 0 ? findingLines.join("\n") : isPathA ? "- No external claims (Path A)." : "- No claims registered.",
    "",
    "## Confidence Assessment",
    ...confidence,
  ];
  if (!isPathA) {
    sections.push(
      "",
      "## Decision Matrix",
      ...(selected.length > 0 ? selected.map(h => `- Selected: ${h.id} — ${h.statement}`) : ["- Selected: none"]),
      ...rejected.map(h => `- Rejected: ${h.id} — ${h.statement}${h.notes ? ` (why: ${h.notes})` : ""}`),
      ...merged.map(h => `- Merged: ${h.id} → ${h.mergedInto ?? "?"} — ${h.statement}${h.notes ? ` (${h.notes})` : ""}`),
      ...openHyp.map(h => `- Pending: ${h.id} — ${h.statement}`),
    );
  }
  sections.push(
    "",
    "## Key Evidence Sources",
    evidenceUrls.length > 0 ? evidenceUrls.map(u => `- ${u}`).join("\n") : "- None recorded.",
    "",
    "## Reasoning Trace",
    trace,
    "",
    "## Final Thought",
    lastThought != null ? quoteBlock(lastThought) : "> (no thoughts recorded yet)",
    "",
    "## Residual Uncertainty & Blind Spots",
    residual.join("\n"),
    "",
    "## Actionable Next Steps / Exit Conditions",
    nextSteps.join("\n"),
  );
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
  registerClaim?: string;
  verifyClaim?: string;
  claimStatus?: string;
  claimSource?: string[];
  claimNotes?: string;
  mode?: string;
  registerHypothesis?: string;
  resolveHypothesis?: string;
  hypothesisStatus?: string;
  hypothesisNotes?: string;
  mergedInto?: string;
  status?: boolean;
  reset?: boolean;
  export?: boolean;
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
    mergedInto: { type: "string" },
    status: { type: "boolean", default: false },
    reset: { type: "boolean", default: false },
    export: { type: "boolean", default: false },
  },
  strict: true,
}) as unknown as { values: ParsedArgs });
} catch (err: unknown) {
  const e = err as Error;
  fail(`Invalid arguments: ${e.message}`);
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
    v.mode != null && "--mode",
    v.registerClaim != null && "--registerClaim",
    v.verifyClaim != null && "--verifyClaim",
    v.claimStatus != null && "--claimStatus",
    v.claimSource != null && "--claimSource",
    v.claimNotes != null && "--claimNotes",
    v.registerHypothesis != null && "--registerHypothesis",
    v.resolveHypothesis != null && "--resolveHypothesis",
    v.hypothesisStatus != null && "--hypothesisStatus",
    v.hypothesisNotes != null && "--hypothesisNotes",
    v.mergedInto != null && "--mergedInto",
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

// --- Command: Status ---

if (values.status && values.export) {
  fail("--export cannot be combined with other operations (--status); run --export alone.");
}

if (values.status) {
  const response = {
    ...makeStatusResponse(state),
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
  console.log(buildConclusionCard(state));
  process.exit(0);
}

// --- Command: Register Claim ---

if (values.registerClaim != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids external claims. Use internal derivation.");
  }
  if (values.registerClaim === "") fail("--registerClaim statement cannot be empty");
  const count = Object.keys(state.claims).length + 1;
  const claimId = `claim-${count}`;
  const claim: Claim = {
    id: claimId,
    statement: values.registerClaim,
    registeredAtThought: state.thoughtHistory.length,
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

if (values.registerHypothesis != null) {
  requireModeEstablished(state, values.mode);
  if (state.mode === "path-a") {
    fail("Path A (closed-form) forbids hypotheses. Use internal derivation.");
  }
  if (values.registerHypothesis === "") fail("--registerHypothesis statement cannot be empty");
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

  if (values.mergedInto && status !== "merged") {
    fail("--mergedInto is only valid with --hypothesisStatus merged.");
  }

  if (status === "merged") {
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
    hyp.mergedInto = target;
  } else {
    delete hyp.mergedInto;
  }

  hyp.status = status;
  if (values.hypothesisNotes) hyp.notes = values.hypothesisNotes;

  recordAudit(state, { op: "resolveHypothesis", target: hyp.id, detail: status === "merged" ? `merged->${values.mergedInto}` : status });
  saveState(state);
  console.log(JSON.stringify({ resolved: hyp.id, status: hyp.status, mergedInto: hyp.mergedInto, notes: hyp.notes }, null, 2));
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
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname.toLowerCase();
  } catch {
    try {
      // Tolerate a missing scheme so "example.com/page" still buckets under example.com.
      hostname = new URL(`https://${urlStr}`).hostname.toLowerCase();
    } catch {
      fail(`--claimSource '${urlStr}' is not a parseable URL; sources must name their origin domain.`);
    }
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
  const status = values.claimStatus as ClaimStatus;
  if (!status) fail("--claimStatus is required when --verifyClaim is set");

  const validStatuses: ClaimStatus[] = ["pending", "verified", "single_source", "unverified", "not_found"];
  if (!validStatuses.includes(status)) {
    fail(`Invalid --claimStatus: ${status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  // Guardrail 1: 2-source requirement for verified (count + distinct root domains)
  if (status === "verified") {
    const rootDomains = new Set(sources.map(rootDomain));
    if (sources.length < 2 || rootDomains.size < 2) {
      fail(`--claimStatus verified requires at least 2 independent --claimSource arguments from distinct root domains. Found ${sources.length} source(s), ${rootDomains.size} root domain(s). Use 'single_source' or 'unverified' if fewer.`);
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

  claim.status = status;
  // Re-marking a claim pending must not wipe evidence already attached.
  if (status !== "pending" || sources.length > 0) claim.sources = sources;
  if (values.claimNotes) claim.notes = values.claimNotes;

  recordAudit(state, { op: "verifyClaim", target: claim.id, detail: status });
  saveState(state);
  console.log(JSON.stringify({ verified: claim.id, status: claim.status, sources: claim.sources, notes: claim.notes }, null, 2));
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
if (values.thought === "") fail("--thought cannot be empty");
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
  console.log(buildConclusionCard(state));
}
