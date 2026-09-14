---
name: claude-reasoning
version: 2.2.3
description: Graph-based reasoning pipeline. Dual-mode — when the engine
  (MCP/CLI invoker) is reachable it runs the full DAG with SQLite checkpoints;
  when the engine is absent the skill degrades to native in-session execution
  of the same stage prompts.
triggers: ["reasoning", "structured reasoning", "deep analysis", "root cause"]
---
# claude-reasoning — Dual-Mode Router

## Mode selection (evaluate in order)

1. **Engine mode — MCP.** If the MCP tool `claude_reason` / `cr_reason` is
   exposed, invoke it with the user's question. On success return its result.
2. **Engine mode — CLI.** If MCP is absent, run
   `npx claude-reasoning run "<question>" --json`. A `threadId` plus
   `conclusion_card` in stdout is a success.
3. **Native mode — in-session.** If either engine path errors
   (MCP timeout / `Invoker needs a baseUrl` / non-zero CLI exit), DO NOT
   surface the error to the user. Instead execute the pipeline in-session
   using the prompts under `prompts/` as instructions.

## Engine mode notes

- Env resolution order (per field): `CR_REASONING_*` → generic
  `ANTHROPIC_*` / `OPENAI_*` → `config.yaml`. The config file is optional
  when env already supplies `baseUrl`.
- CLI runs untimed; MCP calls may hit a client-side timeout — treat that as a
  signal to degrade to native mode, not a fatal error.

## Native mode — stage contract

Read `prompts/stages/` and `prompts/contracts/` and replay them in order,
accumulating each stage's declared output fields into working state:

```
init → C0 → [hitl clarify if C0 flags it] → s0 → s1 → s2 → s3
     → s4 → s5 →(needs_revision? backtrack to target)→ s5.5
     →(gate fail? → s3/s5)→ s6 → quality → done
```

- `C0` (`contracts/C0.md`): extract immutable constraints; may flag
  `clarification_needed`. If so, ask the user once, then continue.
- `s0`–`s6` (`stages/stage-*.md`): execute each stage's instruction block and
  keep its structured output fields (the schema in each prompt) as working
  state for downstream stages.
- `s5` critique may set `needs_revision` + `revision_target`; honor it by
  re-running the named stage once (stage-0 revision allowed at most once).
- `s5.5` (`stages/stage-5.5-hallucination-harness.md` +
  `kernel/gates.ts`): anti-hallucination gate; on failure route back to
  `s3` (source fix) or `s5` (wording fix), max 3 backtracks.
- `quality` (`prompts/quality/self-assessment.md`): final audit, attach
  `quality_score` to the conclusion card.

Produce the same observable contract as engine mode: a final
`conclusion_card` string plus `quality_score`. Do NOT just narrate — emit the
structured fields each stage declares.

Do NOT dump prompt files into the user-visible reply; execute them.

**⚠️ Native mode has NO deterministic gates.** Engine mode enforces
`antiHallucinationGate` (P0 entity/source/cross-ref checks), 4 `conclusionGates`,
and `runPrecisionAudit` in code. Native mode replays the same prompts but every
check is self-reported by the model — hallucination protection is NOT equivalent.
Prefer engine mode whenever a backend is reachable; treat native output as
unverified until independently checked.
