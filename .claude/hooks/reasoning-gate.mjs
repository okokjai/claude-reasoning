#!/usr/bin/env bun
// PreToolUse reasoning gate for claude-reasoning.
// Blocks Edit/Write/mutating-Bash in this repo until scripts/.think_state.json
// has converged (last thought's nextThoughtNeeded === false).
// Contract: stdin = Claude Code PreToolUse JSON; stdout = JSON with
// hookSpecificOutput { hookEventName, permissionDecision, permissionDecisionReason }.
// State path overridable via REASONING_GATE_STATE (tests isolate with a temp file).
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const STATE_FILE =
  process.env.REASONING_GATE_STATE || join(REPO_ROOT, "scripts", ".think_state.json");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let payload = {};
try {
  payload = JSON.parse(raw || "{}");
} catch {
  payload = {};
}

const toolName = String(payload.tool_name || "");
const input = payload.tool_input || {};

const GATED = new Set(["Edit", "Write", "Bash"]);
if (!GATED.has(toolName)) {
  process.stdout.write("{}");
  process.exit(0);
}

// Converged = state file exists, thoughtHistory non-empty, last thought closed.
function isConverged() {
  if (!existsSync(STATE_FILE)) return false;
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    const h = state.thoughtHistory;
    if (!Array.isArray(h) || h.length === 0) return false;
    return h[h.length - 1].nextThoughtNeeded === false;
  } catch {
    return false;
  }
}

const REASON =
  "REASONING_GATE: 未收斂的思考狀態 — 先執行 bun scripts/think.ts --mode path-a|path-b " +
  "完成分類並收斂（nextThoughtNeeded=false）再修改，或先 --reset 開始新會話。";

function block() {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: REASON,
      },
    }),
  );
  process.exit(0);
}

// Commands that mutate the filesystem (heuristic; read-only commands pass).
// Conservative by design — may over-block, never under-blocks. Documented boundary.
const MUTATING =
  />>|>\s*[^|&;]|\bmv\s|\bcp\s|\brm\s|\bsd\s|\bsed\s+-i\b|\btee\b|\btruncate\b|\btouch\s|\bmkdir\s|\bcurl\s+(-o|--output)\b|\bgit\s+(reset\s+--hard|checkout\s+--|clean\s+-f)\b|\binstall\s|\btar\s+-|\bunzip\b|\b(del|copy|move|ren|xcopy)\s/;

if (toolName === "Bash") {
  const cmd = String(input.command || "");
  // The reasoning action itself writes the state file — allow only a single
  // un-chained think.ts invocation. Chained commands (& / | / ;) and other
  // executables are NOT exempt: "think.ts --reset && rm -rf ." must be denied.
  if (
    !/[&;|]/.test(cmd) &&
    /^(bun\s+)?[\w./-]*think\.ts\b/.test(cmd.trim())
  ) {
    process.stdout.write("{}");
    process.exit(0);
  }
  if (MUTATING.test(cmd) && !isConverged()) block();
  process.stdout.write("{}");
  process.exit(0);
}

// Edit / Write: gate self-files and the state file itself are exempt.
const filePath = String(input.file_path || input.path || "");
if (
  filePath.includes(".claude") ||
  filePath.endsWith(".think_state.json") ||
  filePath.endsWith("settings.json")
) {
  process.stdout.write("{}");
  process.exit(0);
}
if (!isConverged()) block();
process.stdout.write("{}");
process.exit(0);
