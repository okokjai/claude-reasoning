# agents.md — Guide for AI Agents Working on This Repo

This file tells an AI agent (or any contributor) how to modify this repository safely. It is a maintenance contract, not a feature spec. The human-readable feature documentation lives in `README.md`.

## Before You Start

- **Toolchain**: Node >= 20, `pnpm`. Run `pnpm install` then `pnpm build` before touching anything.
- **Completion claim**: never claim "done" before `bash scripts/sync-check.sh` prints `=== All checks passed ===`. The repo has strict consistency checks (contract semantics, README alignment, memory index, version/tag state).
- **Two layers, two audiences**:
  - `SKILL.md` + `contracts/` `stages/` `modes/` `quality/` — the Claude Code skill (model-driven reasoning; the human + model use this at runtime).
  - `src/` + `plugins/` — the TypeScript runtime (`cr-reasoning` CLI) that enforces structure and P0 gates.
  - `prompts/` — compatibility mirror of the skill files. **Never edit a single `prompts/` file in isolation**; run the sync checks afterwards.

## Non-Negotiables

- **P0 gates never weaken.** S5.5 (anti-hallucination) and S6 (conclusion) semantics in `src/kernel/gates.ts` and `stages/` are the product's core value. Any algorithm plugin's graph must reach both gates (`verifyP0Reachability` / `verifyP0GatesReachable` reject graphs that don't).
- **No silent behavior removal.** Keep documented schema fields and stage semantics; compatibility-sensitive paths are on purpose.
- **Tests are the evidence.** `pnpm test` (140 tests: e2e, graph traversal, gates, router, tools, MCP, CLI) and `pnpm typecheck` must pass. For bug fixes, write a failing test first (RED → GREEN), then verify no regression.
- **Do not edit only one mirrored copy** (root `contracts/`/`stages/`/… vs `prompts/`). If you change a stage or contract, both the skill docs and the checks must stay consistent.

## Hotswap Conventions

- **Algorithm plugin**: ~50 lines — implement `AlgorithmPlugin` (`build_graph(stages)` + `cost_model`), register it in `plugins/algorithms/index.ts`, select via `config.yaml: paradigm`.
- **Tool plugin**: ~30-line adapter implementing a capability (`search` / `scrape` / `reasoning-logger`); bind via `config.yaml: tools.<capability>` + `mcp_servers.<id>`.
- **Selection priority (v2.0.3)**: `user_specified` > `config.paradigm` (non-empty, non-`auto`) > Router (hard rules → budget downgrade → weighted score). Do not regress this to "config.paradigm never read".
- **Machine-specific config**: the checked-in `config.yaml` unified-fetch command points to a local path (`C:/Users/PaulPaul/.claude/...`); on other machines override `mcp_servers.unified-fetch` via `--config`, and never bake another machine's path into the repo.

## Editing the Skill Files (.md)

- Keep the pipeline: `A1 → A0 → A2 → C0 → Stage 0 → … → Stage 5 → Stage 5.5 → Stage 6 → Quality`.
- Stage 0 stays mandatory; its packet invariants (`candidate_frame_count` 0–4, `selected_frame_count` 0–2, `no_new_angle` ⇔ `iteration_count=0`) and the bounded B9 loop are contract, not decoration.
- C2 transfer fields are the contract surface — add/remove a mandatory field means updating `contracts/C2.md` and every stage that consumes it.
- After editing any doc: update `CHANGELOG.md` (top entry or new version section) and re-run `scripts/sync-check.sh`.

## Release (6 steps, one missing = not released)

1. Local done: `bash scripts/sync-check.sh` → `All checks passed` (working tree clean after review).
2. Pushed: local HEAD == `origin/master`.
3. CHANGELOG: version section exists (`## vX.Y.Z (date)`); `Unreleased` moved into it.
4. Git tag: annotated `vX.Y.Z`, pushed (`git tag` + `git ls-remote --tags origin` agree).
5. GitHub Release: created for the tag, not a draft (`gh release`/API `html_url` exists).
6. Consistency: tag → commit == Release `target_commitish` == local HEAD.

Version number placement: the CLI package version lives in `package.json`; the skill version lives in `SKILL.md` frontmatter + `CHANGELOG.md`. Keep them deliberate; document what changed in the matching release.

## When Finished

- Read the full output of `pnpm test`, `pnpm build`, and `scripts/sync-check.sh`; report actual status (passes/fails/skips), never "should pass".
- If you touched memory paths (`CLAUDE_MEMORY_DIR`, `resolve-memory-dir.py`), confirm the resolver output matches where memories actually live on this machine.