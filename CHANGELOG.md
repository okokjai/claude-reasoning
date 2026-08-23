# Changelog

## v1.1.3 (2026-08-23)
**L1 Honest Naming — "degrade" → "linear mode"**

1. **Terminology correction** — `degrade`/`degradation`/`Linear degradation` replaced with `linear mode`/`revert to linear`/`Linear Mode` across all 10 files: architecture.md, CHANGELOG.md, README.md (3 occurrences), contracts/A2.md, contracts/C1.md, stages/stage-0-mini-brainstorming.md (2), stages/stage-5-critique.md, SKILL.md, scripts/sync-check.sh.
2. **Rationale** — sequential-thinking is a node logger, not a DAG engine. `can_branch=false` removes branch visualization, not core reasoning capability. "Degradation" implied a functional loss that does not exist; all stages, contracts, and output schemas are identical in both modes.
3. **Triggered by** — [[honest-naming-preference]] memory: user values honest naming over framework-borrowed terminology.

## v1.1.2 (2026-08-23)
**SKILL.md Slim — progressive disclosure**

1. **SKILL.md 25.8KB → 8.2KB (-68%)** — Restructured as routing layer: Frontmatter + Usage + Pipeline Quick Reference + Execution Flow (Read → Do) + Reference Files index.
2. **Added 4 reference files** (load on demand):
   - `architecture.md` — Full DAG diagram + topology + Stage Rules (read on first execution)
   - `mcp-toolchain.md` — Tool mapping table + Execution Enforcement Hooks (read at Stage 3)
   - `output-spec.md` — Conclusion Card format + evidence language calibration (read at Stage 6)
   - `memory-integration.md` — Memory write paths + cache table (read at wrap-up)
3. **Removed dead weight** — `docs/plans/` (2 historical design files), `scripts/*.bak` (2), `scripts/.sync-check.step10.old.py`, empty `scripts/sequential-thinking.sh`, `scripts/contract-gen.sh` (the corresponding .py files are kept).
4. **sync-check.sh updated** — can_branch/Verifier Separation/revision limit checks extended to architecture.md; README project tree check no longer requires docs/plans.
5. **README updated** — project tree reflects new structure.

## v1.1.1 (2026-08-23)
**Execution Trail Enforcement — environment-enforced reasoning flow**

1. **Contract layer** — `UserPromptSubmit` hook generates session execution contract (hard/soft required tool sequence)
2. **Trail layer** — `PostToolUse` hook appends tool call trail to environment (model cannot forge)
3. **Gate layer** — `Stop` hook compares trail vs contract; blocks on missing items, prevents step-skipping
4. **Audit** — `sync-check.sh --runtime` compares global session trail, exposes forged execution records
5. **Scripts** — `contract-gen.py`, `trail-log.sh`, `gate-check.py/.sh`

## v1.1.0 (2026-08-22)
**P0/P1 alignment release — docs, contracts, scripts, and release closure**

### P0: Docs/Config Alignment
1. **README DAG terminology** — `DAG orchestration` -> `forward DAG-shaped pipeline + bounded conditional control-flow` with B9->B5->B6->B7->B8->B9 and Stage 5/5.5/6 bounded reroutes.
2. **README claim lifecycle & failure routes** — added `claim_registry: Stage 2->Stage 3->Stage 4/5->Stage 5.5` and `Stage 5.5->Stage 3/5`, `Stage 6->Stage 1` with `failure_context` + bounds (<=3 / Stage0 <=1, `no_new_angle=>iteration_count=0`).
3. **README MCP config** — `@anthropic-ai/mcp-server-sequential-thinking` -> `@modelcontextprotocol/server-sequential-thinking`; `~/.claude/mcp_servers.json` -> `~/.claude.json` + `mcp_servers.json` (Windows: `C:/Users/<you>/.claude.json`).
4. **README can_branch** — new section: `can_branch:true|false`, `false` = linear mode, no stage skipped.
5. **README Stage 0 packet invariants** — `candidate_frame_count 0..4`, `selected_frame_count 0..2`, `no_new_angle=true=>iteration_count=0`, framing_status canon.
6. **README project tree** — added `docs/plans/` (removed in v1.1.2 slim), `scripts/memory-cleanup.sh` + details.
7. **SKILL.md alignment** — same DAG + MCP fixes, topology note, requires updated.

### P1: Contract Closure
8. **A1/A0 enum closure** — `data_type` 5-value enum + legacy alias `internal-logic` documented; `scale < small` vacuous note fixed; A3 stale ref fixed.
9. **Type A threshold unified** — A3/A4/Stage 3/Stage 6 aligned to `>=2 independent sources (at least 1 T1/T2) or >=2 consistent T3/T4/T5 (not independently verified); single-source/all-T3 = verification failed`.
10. **C2 field chain** — added `A1->Stage 0`, `Stage 3->Stage 2` rerun edge, fixed `A2->Stage 6 platform_mode` mandatory, fixed `Stage 6->Quality` ambient fields, moved `precision_score` to output-only.
11. **Quality denominator** — full /50 base + optional freshness -> /55, simplified /30 -> /36 (6x6) to match actual fields.
12. **A2 critique mapping** — small 5->6 (5 core + Problem Reframing Check), medium 8, large 9 aligned with Stage 5 table.
13. **Scripts** — `sync-check.sh` added Steps 7-9 (README alignment, contract closure, release/tag WARN); `memory-cleanup.sh` dry-run verified.

Prior Unreleased (2026-08-20) included:

1. **Stage 0 Mini Brainstorm** — Added a mandatory bounded control-flow framing pass before decomposition, with at most four divergent frames, two selected frames, and one bounded B9 → B5 → B6 → B7 → B8 → B9 iteration.
2. **Stage 5 Reframing** — Added one lightweight harder-frame check that distinguishes framing defects from hypothesis and evidence defects without rerunning the full brainstorm.
3. **Safety and Fallback Bounds** — Kept brainstorm output candidate-only, so it cannot bypass verification or quality gates; when sequential-thinking is unavailable, the same bounded phases are recorded linearly.

## v1.0.0 (2026-08-12)
**English Edition — derived from claude-reasoning-distillation v7.5.1**

1. **Full English Adaptation** — All 6 stages, 5 modes, quality self-assessment, and contracts fully adapted from the original Chinese to English. No Chinese characters remain.
2. **Internationalization** — All China-specific references (Baidu Maps, Dianping, Xiaohongshu, Taobao, JD, Qichacha, Tianyancha) replaced with international equivalents (Google Maps, OpenStreetMap, Yelp, Reddit, Amazon, Crunchbase, OpenCorporates). Currency notation generalized from RMB to locale-aware USD/EUR/GBP.
3. **Terminology Standardization** — All confidence_bucket values, verification_status values, evidence_quality values, and perspective names consistently rendered in English per the standardized glossary.
4. **Pedagogical Examples Internationalized** — Counterexamples in Stage 3 (Ito Optical, Aimu Optical, Tuoke, Shenzhen optical stores) replaced with fictional generic brand "Acme Vision" / "Sightline Optical" in Austin, TX. Stage 6 evidence-level examples (Zeiss Shenzhen, Aisi Eyewear, Shenzhen eyewear market) replaced with generic international equivalents.
5. **Marketing Indicator Words** — Chinese marketing superlatives (tianhuaban, shouxuan, wangzhe, juele) replaced with English equivalents ("game changer", "best-in-class", "unbeatable", "the GOAT") while preserving the original rule structure.
6. **Preserved Identifiers** — All code identifiers, field names, MCP tool call parameter names, branch IDs, numerical thresholds, and scoring frameworks preserved exactly as in the original.