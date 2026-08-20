# Changelog

## Unreleased (2026-08-20)

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