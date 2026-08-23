# Changelog

## v1.1.1 (2026-08-23)
**Execution Trail Enforcement — 環境強制推理流程**
1. **Contract 層** — `UserPromptSubmit` hook 生成 session 執行契約（硬/軟必需工具序列）
2. **Trail 層** — `PostToolUse` hook 環境追加工具調用軌跡，模型不可偽造
3. **Gate 層** — `Stop` hook 對比 trail vs 契約，缺失則 block，阻止當次跳步驟
4. **審計** — `sync-check.sh --runtime` 對比全域 session trail，暴露偽造執行記錄
5. **腳本** — `contract-gen.py/.sh`、`trail-log.sh`、`gate-check.py/.sh`

## v1.1.0 (2026-08-22)
**P0/P1 alignment release — docs, contracts, scripts, and release closure**

### P0: Docs/Config Alignment
1. **README DAG terminology** — `DAG orchestration` -> `forward DAG-shaped pipeline + bounded conditional control-flow` with B9->B5->B6->B7->B8->B9 and Stage 5/5.5/6 bounded reroutes.
2. **README claim lifecycle & failure routes** — added `claim_registry: Stage 2->Stage 3->Stage 4/5->Stage 5.5` and `Stage 5.5->Stage 3/5`, `Stage 6->Stage 1` with `failure_context` + bounds (<=3 / Stage0 <=1, `no_new_angle=>iteration_count=0`).
3. **README MCP config** — `@anthropic-ai/mcp-server-sequential-thinking` -> `@modelcontextprotocol/server-sequential-thinking`; `~/.claude/mcp_servers.json` -> `~/.claude.json` + `mcp_servers.json` (Windows: `C:/Users/<you>/.claude.json`).
4. **README can_branch** — new section: `can_branch:true|false`, `false` = linear degradation, no stage skipped.
5. **README Stage 0 packet invariants** — `candidate_frame_count 0..4`, `selected_frame_count 0..2`, `no_new_angle=true=>iteration_count=0`, framing_status canon.
6. **README project tree** — added `docs/plans/`, `scripts/memory-cleanup.sh` + details.
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