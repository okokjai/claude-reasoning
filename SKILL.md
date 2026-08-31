---
name: claude-reasoning
version: 2.0.5
description: Graph-based reasoning pipeline — contracts, stages, modes in separate files with a forward DAG-shaped pipeline + bounded conditional control-flow. Progressive disclosure: SKILL.md is a router; full instructions load per stage from contracts/, stages/, modes/, quality/ + reference docs. Zero Python dependency. 8 domain-aware verification paths + unified-fetch multi-engine search/scrape.
triggers:
  - "reasoning"
  - "structured reasoning"
  - "reasoning framework"
  - "deep analysis"
  - "why"
  - "root cause"
requires:
  - "unified-fetch (MCP Server) — multi-engine search/scrape (4 search + 6 scrape, built-in fallback, configured in ~/.claude.json or mcp_servers.json)"
  - "sequential-thinking (MCP Server) — reasoning node branching/backtracking/visualization (configured in ~/.claude.json or mcp_servers.json, package @modelcontextprotocol/server-sequential-thinking)"
depends_on:
  - using-superpowers@* — upstream routing
  - auto-fix-loop@* — technical fixes requiring root cause analysis
  - evolution@* — system evolution requiring design decisions
---

# Claude Reasoning v2.0.5 — Graph-Based Reasoning Pipeline

## Usage

```
/skill claude-reasoning [question description]

Modes (optional, auto-routed by the system; see contracts/A0.md):
  diagnostic   Diagnostic reasoning — system failures, bugs, root cause
  design       Design reasoning — architecture, API, system design
  decision     Decision reasoning — technology selection, option comparison
  optimization Optimization reasoning — performance tuning, parameter search
  innovation   Innovation reasoning — breaking bottlenecks, new approaches

Domains (auto-detected; see contracts/A1.md):
  investment   Investment analysis — stocks, crypto, funds, real estate
  finance      Personal finance — budgeting, tax, insurance, retirement
  career       Career development — planning, negotiation, learning paths
  learning     Learning & growth — knowledge management, skill acquisition
  relationship Interpersonal — communication, conflict, emotions
  tech         Technology — technical solutions, automation, tool selection
  daily        Daily life — shopping, dining, travel, weather
  general      General reasoning — retains all 5 reasoning modes
```

Examples:
```
  /skill claude-reasoning analyze Bitcoin market conditions for H2 2026
  /skill claude-reasoning recommend a clean hotel near downtown Austin under $120
  /skill claude-reasoning plan a career transition into AI engineering
  /skill claude-reasoning diagnostic production server crashed at 3am
  /skill claude-reasoning optimization reduce cloud costs without changing architecture
```

---

## Pipeline Quick Reference

```
A1 → A0 → A2 → C0 → Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 5.5 → Stage 6
```

| Node | File | Tool |
|------|------|------|
| Contracts A1/A0/A2/A3/A4 | `contracts/*.md` | Contract templates (no tools) |
| Contract C0 | `contracts/C0.md` | User context capture |
| Contract C1 | `contracts/C1.md` | Skip strategy (mandatory Stage 0 preserved) |
| Contract C2 | `contracts/C2.md` | Inter-stage transfer edge definitions |
| Stage 0: Mini Brainstorming | `stages/stage-0-mini-brainstorming.md` | `sequentialthinking` + linear fallback |
| Stage 1: Decomposition | `stages/stage-1-decomposition.md` | `sequentialthinking` |
| Stage 2: Hypothesis | `stages/stage-2-hypothesis.md` | `sequentialthinking` |
| Stage 3: Verification | `stages/stage-3-verification.md` | `unified-fetch` |
| Stage 4: Synthesis | `stages/stage-4-synthesis.md` | None (pure reasoning) |
| Stage 5: Critique | `stages/stage-5-critique.md` | `sequentialthinking`; includes Problem Reframing Check |
| Stage 5.5: Anti-Hallucination | `stages/stage-5.5-hallucination-harness.md` | None (P0 gate, 3 checks) |
| Stage 6: Conclusion | `stages/stage-6-conclusion.md` | None (P0 gate + Conclusion Card) |
| Quality Self-Assessment | `quality/self-assessment.md` | Scoring → Memory |

---

## Execution Flow (Read → Do)

**Read each file before executing its stage. Files are the source of truth; this page is only the router.**

1. **Read `contracts/A1.md`** — classify `data_type` / `primary_domain`. Non-trigger conditions → answer directly, do not enter the flow.
2. **Read `contracts/A0.md`** — route `primary_mode` (or use a user-specified mode).
3. **Read `contracts/A2.md`** — fill reasoning strategy; **must actually call** `mcp__unified-fetch__status` for platform detection (CLI Full / Desktop), set `evidence_cap` / `quality_cap` / `can_branch`.
4. **Read `contracts/C0.md`** — capture user context (auto-trigger for decision/daily/career; otherwise explicit defaults).
5. **Read `stages/stage-0-mini-brainstorming.md`** — mandatory bounded framing → emit `brainstorm_packet` (candidate only, never evidence).
6. **Read `stages/stage-1-decomposition.md`** — decompose into sub-problems; open sequential-thinking branches.
7. **Read `stages/stage-2-hypothesis.md`** — generate hypotheses + complete `claim_registry` (P0, before any search).
8. **Read `stages/stage-3-verification.md`** — verify each hypothesis via unified-fetch; negative search; T1-T5 source annotation; entity existence check.
9. **Read `stages/stage-4-synthesis.md`** — merge evidence, emit `preliminary_conclusion` (pure reasoning).
10. **Read `stages/stage-5-critique.md`** — critique perspectives + one Problem Reframing Check + precision audit; backtrack/revise on blind spots.
11. **Read `stages/stage-5.5-hallucination-harness.md`** — independent P0 gate (entity/source/cross-reference). Must pass before Stage 6.
12. **Read `stages/stage-6-conclusion.md`** — P0 gates + Conclusion Card with evidence language calibration.
13. **Read `quality/self-assessment.md`** — score (full /50 or simplified /36), write Pattern Asset to Memory.

Skip strategy per **`contracts/C1.md`**; only C1 may shorten later stages, and no rule removes mandatory Stage 0. Fallback paths (`can_branch=false`, Desktop Mode) use linear execution, never skip stages.

---

## Reference Files (load on demand)

| File | Content | Load Before |
|------|---------|-------------|
| `architecture.md` | Full DAG diagram, topology note, stage rules, backtracking mechanism, principles | First execution |
| `mcp-toolchain.md` | Tool mapping tables + execution enforcement hooks | Stage 3 |
| `output-spec.md` | Required outputs, Conclusion Card format, evidence language calibration | Stage 6 |
| `memory-integration.md` | Memory write paths + cross-topic cache table | Stage 6 → Memory |

---

## 5 Reasoning Modes

| Mode | File | Core Mechanism | Use For |
|------|------|----------------|---------|
| Diagnostic | `modes/diagnostic.md` | Symptoms → candidate causes → elimination → minimal intervention | Bug fixes, system failures, data anomalies |
| Design | `modes/design.md` | Requirements → constraints → solution space → Pareto frontier | Architecture, API design, refactoring |
| Decision | `modes/decision.md` | Options × criteria → weighted scoring → sensitivity analysis | Tech selection, vendor selection, ranking |
| Optimization | `modes/optimization.md` | Current state → gradient direction → step size → convergence | Performance/cost optimization, tuning |
| Innovation | `modes/innovation.md` | Break assumptions → recombine → new combinations | Breaking bottlenecks, new features |

---

## Collaboration with Other Skills

| Upstream Skill | Role | Handoff Point |
|---------------|------|---------------|
| using-superpowers | Detects tasks requiring reasoning | Routes to this skill |
| auto-fix-loop | Technical fixes needing root cause analysis | Shared hypothesis/verification stages |
| evolution | System evolution needing design decisions | Design mode |

---

## Post-Edit Sync (Mandatory)

After any modification, `bash scripts/sync-check.sh` must pass all checks before claiming completion. The full post-edit checklist (MCP toolchain reconciliation, dead code check, date check, memory volume check) is defined in sync-check.sh's individual Steps and Step 8's memory-cleanup.sh.