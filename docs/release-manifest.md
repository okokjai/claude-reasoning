# Release Manifest

This manifest explains the roles of the files shipped with Claude-Reasoning v2.0.5. It is a boundary guide, not a deletion list.

## File roles

| Category | Paths | Required for | Notes |
|---|---|---|---|
| Claude Code entry | `SKILL.md` | Claude Code skill use | Skill router and execution flow entry point. |
| Skill contracts | `contracts/` | Claude Code skill use | Current root-relative contract paths validated by `scripts/sync-check.sh`. |
| Skill stages | `stages/` | Claude Code skill use | Current root-relative stage paths and stage rules. |
| Skill modes | `modes/` | Claude Code skill use | Mode-specific reasoning instructions. |
| Skill quality | `quality/` | Claude Code skill use | Quality self-assessment instructions. |
| Skill references | `architecture.md`, `mcp-toolchain.md`, `output-spec.md`, `memory-integration.md` | Claude Code skill use | Progressive-disclosure reference material. `architecture.md` and `mcp-toolchain.md` describe distinct concerns and are not interchangeable. |
| TypeScript runtime | `src/` | CLI/runtime development and build | Kernel, executor, configuration, gates, and CLI source. |
| Runtime plugins | `plugins/` | CLI/runtime development and build | Algorithms, MCP tool adapters, and router. |
| CLI package metadata | `package.json`, `pnpm-lock.yaml`, `tsconfig.json` | Installation/build | Defines scripts, dependencies, compiler output, and reproducible installs. |
| MCP configuration | `config.yaml` | Local CLI execution | The checked-in unified-fetch path is machine-specific; use `--config` with a host-specific configuration elsewhere. |
| Compatibility prompt bundle | `prompts/` | Compatibility/manual prompt consumers where applicable | Retained while external consumers and provenance are being audited. Do not edit a mirrored file in isolation. |
| Tests | `test/` | Development and release verification | Runtime, MCP, graph, CLI, and end-to-end regression coverage; not required by the compiled CLI at runtime. |
| Integration helpers | `scripts/` | Skill maintenance and validation | Includes sync and hook-related helpers; do not remove without auditing callers. |
| Development history | `docs/plans/` | Maintainer context | Release planning material, not a runtime dependency. |

## Prompt path policy

The root-level `contracts/`, `stages/`, `modes/`, and `quality/` directories are the current compatibility-sensitive paths: `SKILL.md`, `scripts/sync-check.sh`, and runtime stage metadata refer to them. The corresponding `prompts/` files are retained rather than deleted because external Claude Code or manual consumers may use those paths, and the repository has not established a safe cross-platform redirect mechanism.

The mirrored contract, stage, mode, and quality files are currently byte-identical where corresponding files exist. The architecture and MCP toolchain documents have meaningful content differences, so they must remain separate until a deliberate audience-specific consolidation is designed and verified.

## Change policy

- Do not modify the published `v2.0.0` tag for repository organization work.
- The `v2.0.1` release contains documentation and compatibility-boundary clarifications; it does not remove runtime functionality.
- Do not replace prompt files with symlinks or redirect stubs without testing Claude Code and package behavior on supported platforms.
- Before removing or moving a path, search repository and external installation/configuration locations for references, check for dynamic use, and run the complete verification suite.
- Treat this manifest as documentation of roles; it does not authorize deletion of any listed path.
