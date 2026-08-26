# Claude-Reasoning v2.0.0 Release Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Turn `cr-reasoning-v2` into an honest, runnable Claude-Reasoning v2.0.0 release with configurable MCP stdio execution, graph-driven stage traversal, verified evidence handling, and aligned documentation.

**Architecture:** Add a small transport-independent MCP stdio client around Node child processes. Tool plugins receive configured server definitions and delegate capability calls to that client. The executor traverses the selected algorithm graph through a stage-handler map, enforcing graph edges, bounded loops, and P0 gates; unavailable MCP services produce insufficient evidence rather than fabricated citations.

**Tech Stack:** TypeScript, Node.js child_process/readline, Vitest, pnpm, js-yaml, Python unified-fetch MCP server.

---

### Task 1: Repair type contracts and establish a green baseline

**Files:**
- Modify: `src/kernel/gates.ts`
- Modify: `src/kernel/types.ts`
- Modify: `test/algorithms.test.ts`
- Modify: `test/gates.test.ts`

**Steps:**
1. Add a failing type-focused test or compile assertion for the intended `EntityCheckInput` fields and permissive stage registry input.
2. Run `pnpm typecheck` and record the expected current errors.
3. Make the smallest type corrections without changing gate behavior.
4. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
5. Commit: `fix: restore kernel type contracts`.

### Task 2: Add MCP stdio client with fake-server integration coverage

**Files:**
- Create: `src/kernel/mcp-stdio-client.ts`
- Create: `test/mcp-stdio-client.test.ts`

**Steps:**
1. Write tests against a temporary Node child-process fake server covering initialize, initialized notification, tools/list, tools/call, request IDs, timeout, malformed response, server stderr/error, and exit.
2. Run the focused test and verify it fails for the missing client.
3. Implement lifecycle-safe JSON-RPC line transport with configurable command, args, cwd, env, timeout, and close.
4. Run the focused test and verify it passes.
5. Run the complete suite and commit: `feat: add configurable mcp stdio client`.

### Task 3: Wire configured MCP clients into tool plugins and config hot-swap

**Files:**
- Modify: `src/kernel/config-loader.ts`
- Modify: `plugins/tools/unified-fetch.ts`
- Modify: `plugins/tools/seq-thinking.ts`
- Modify: `plugins/tools/index.ts`
- Create/modify: `test/tools-mcp-integration.test.ts`
- Modify: `config.yaml`

**Steps:**
1. Write tests proving configured server definitions create clients, capability calls use MCP results, and changing config creates a new binding without stale clients.
2. Run focused tests and verify failure before implementation.
3. Implement dependency-injected configured tool construction, preserving explicit local fallback only when no server is configured.
4. Point the default unified-fetch path to `C:/Users/PaulPaul/Projects/unified-fetch/unified-fetch-server.py` and document the machine-specific override requirement.
5. Run tests/typecheck/build and commit: `feat: wire configured mcp tool transports`.

### Task 4: Replace fabricated Stage 3 evidence with real capability execution

**Files:**
- Modify: `src/kernel/executor.ts`
- Modify: `src/kernel/s3-parallel.ts`
- Modify: `src/kernel/types.ts`
- Create/modify: `test/stage3-mcp-execution.test.ts`

**Steps:**
1. Write tests asserting search and scrape calls generate traceable tool calls, real URLs/citations, claim registry updates, negative-search status, and insufficient evidence on unavailable services.
2. Run focused tests and verify the fabricated-evidence behavior fails the new assertions.
3. Implement search fan-out, top-result scrape verification, structured evidence normalization, and conservative checklist/gate values.
4. Run focused tests, full tests, typecheck, and build; commit: `feat: execute stage three through configured capabilities`.

### Task 5: Implement graph-driven runtime traversal

**Files:**
- Modify: `src/kernel/executor.ts`
- Modify: `src/kernel/types.ts`
- Modify: `src/kernel/gates.ts` only if required by tests
- Create/modify: `test/graph-execution.test.ts`

**Steps:**
1. Write topology tests using custom graphs/handlers proving edge order, conditional edges, parallel groups, bounded loops, and mandatory P0 reachability.
2. Run focused tests and verify current fixed sequence fails.
3. Implement a graph walker with stage-handler dispatch, loop counters, condition evaluation from stage state, and deterministic output recording.
4. Run full tests/typecheck/build and commit: `feat: execute algorithm graphs at runtime`.

### Task 6: Align CLI, package metadata, documentation, and release notes

**Files:**
- Modify: `package.json`
- Create: `src/cli.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `architecture.md`
- Modify: `mcp-toolchain.md`
- Modify: prompt/reference files that claim capabilities not implemented
- Modify: `.gitignore` or scripts only if verification requires it

**Steps:**
1. Write CLI smoke tests for config path, JSON output, nonzero exit on failed P0 gate, and successful injected/fake MCP execution.
2. Run focused tests and verify the current package has no executable CLI/build output.
3. Implement the CLI and correct all claims to match actual runtime behavior, including the external default server path and override instructions.
4. Run documentation consistency scans and full verification; commit: `docs: align claude-reasoning v2.0.0 release surface`.

### Task 7: Independent review and release verification

**Files:**
- No planned code changes unless review finds a defect.

**Steps:**
1. Run independent code review against this plan and the complete diff.
2. Fix Critical/Important findings with tests first.
3. Run fresh `pnpm test`, `pnpm typecheck`, `pnpm build`, `git diff --check`, graph tests, fake-MCP integration tests, and real unified-fetch smoke test.
4. Verify target remote `https://github.com/okokjai/claude-reasoning`, branch history, CHANGELOG, package version, tag absence/presence, and release prerequisites.
5. Commit any final fixes: `chore: verify v2.0.0 release readiness`.

### Task 8: Push, merge, and publish

**Steps:**
1. Push the feature branch to the target repository only after all checks pass.
2. Create/update a PR and obtain merge confirmation; do not assume the old `cr-reasoning-v2` PR exists.
3. Re-fetch the merged `master` and rerun all verification on the merge commit.
4. Create annotated tag `v2.0.0` only after merge-commit verification.
5. Push the tag and create the GitHub Release with the final CHANGELOG notes.
6. Verify tag, release, and merge commit point to the same commit.
