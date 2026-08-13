---
name: claude-reasoning
version: 1.0.0
description: Comprehensive reasoning engine — reasoning chains x structured contract templates. Graph architecture: contracts, stages, modes in separate files with DAG orchestration. Native Markdown contract templates with explicit input/output fields + validation rules + sequential-thinking DAG branching/backtracking/visualization. Zero Python dependency. 8 domain-aware verification paths + unified-fetch multi-engine search/scrape.
triggers:
  - "reasoning"
  - "structured reasoning"
  - "reasoning framework"
  - "deep analysis"
  - "why"
  - "root cause"
requires:
  - "unified-fetch (MCP Server) — multi-engine search/scrape (4 search + 6 scrape, built-in fallback, configured in mcp_servers.json)"
  - "sequential-thinking (MCP Server) — reasoning node branching/backtracking/visualization (configured in mcp_servers.json)"
depends_on:
  - using-superpowers@* — upstream routing
  - auto-fix-loop@* — technical fixes requiring root cause analysis
  - evolution@* — system evolution requiring design decisions
---

# Claude Reasoning v1.0.0 — Graph-Based Reasoning Pipeline

## Usage

```
/skill claude-reasoning [question description]

Modes (optional, auto-routed by the system):
  diagnostic   Diagnostic reasoning — system failures, bugs, root cause
  design       Design reasoning — architecture, API, system design
  decision     Decision reasoning — technology selection, option comparison
  optimization Optimization reasoning — performance tuning, parameter search
  innovation   Innovation reasoning — breaking bottlenecks, new approaches

Mode auto-routing: supports manual mode specification, or omit to let the system infer from the question (see contracts/A0.md).

Domains (auto-detected, can also be specified manually):
  investment   Investment analysis — stocks, crypto, funds, real estate
  finance      Personal finance — budgeting, tax, insurance, retirement
  career       Career development — planning, negotiation, learning paths
  learning     Learning & growth — knowledge management, skill acquisition
  relationship Interpersonal — communication, conflict, emotions
  tech         Technology — technical solutions, automation, tool selection
  daily        Daily life — shopping, dining, travel, weather
  general      General reasoning — retains all 5 reasoning modes

Examples:
  /skill claude-reasoning analyze Bitcoin market conditions for H2 2026
  /skill claude-reasoning recommend a clean hotel near downtown Austin under $120
  /skill claude-reasoning plan a career transition into AI engineering
  /skill claude-reasoning diagnostic production server crashed at 3am
  /skill claude-reasoning optimization reduce cloud costs without changing architecture
```

---

## Design Philosophy

This skill uses **native Markdown structured prompt templates** (explicit input/output fields + validation rules) with the **sequential-thinking MCP Server** DAG node engine (branching/backtracking/visualization). This is a "contract template"-driven reasoning chain architecture with zero Python dependency — usable directly in any environment.

**Graph structure**: Contracts (node types) → Stages (execution nodes) → Quality Self-Assessment (terminal nodes), with C2 contract defining edges (required/optional transfer fields).

---

## Core Architecture: Reasoning Chain DAG

```
+-------------------------------------------------------------------+
|                     Contract Framework Layer (Skeleton)             |
|   Responsibilities: problem classification, reasoning strategy,     |
|   P0 gates, quality self-assessment, memory writes                  |
|   Contracts: contracts/A1.md + contracts/A0.md + contracts/A2.md   |
|   + contracts/C0.md + contracts/A3.md + contracts/A4.md            |
+-------------------------------------------------------------------+
|                                                                     |
|  contracts/A1.md: Problem characteristics (data_type / domain)     |
|  contracts/A0.md: Mode routing (inferred from A1 output)           |
|  contracts/A2.md: Reasoning strategy (mode / scale / platform /    |
|                   quality_cap / verification_paths)                 |
|  contracts/C0.md: User context (user_constraints /                 |
|                   implicit_assumptions / success_criteria)          |
|  contracts/A3.md: Claim types (A/B/C/D/E + verification thresholds)|
|  contracts/A4.md: Source quality (T1-T5 + marketing detection)     |
|       |                                                             |
|       v                                                             |
|  stages/stage-1-decomposition.md -> sequential-thinking decomposit. |
|       |  +-- Sub-problem A (independent branch)                    |
|       |  +-- Sub-problem B (independent branch)                    |
|       |  +-- Sub-problem C (independent branch)                    |
|       |                                                             |
|       v                                                             |
|  stages/stage-2-hypothesis.md -> sequential-thinking hypotheses    |
|       |  +-- Hypothesis A (branch)                                  |
|       |  +-- Hypothesis B (branch)                                  |
|       |  +-- Hypothesis C (branch)                                  |
|       |  +-- null hypothesis (branch)                               |
|       |                                                             |
|       v                                                             |
|  stages/stage-3-verification.md -> unified-fetch verification      |
|       |  <- each hypothesis verified independently, results written |
|       |     back to sequential-thinking nodes                       |
|       |                                                             |
|       v                                                             |
|  stages/stage-4-synthesis.md -> pure reasoning, evidence merge     |
|       |                                                             |
|       v                                                             |
|  stages/stage-5-critique.md -> sequential-thinking critique        |
|       |  +-- Correctness perspective (branch)                       |
|       |  +-- Risk perspective (branch)                              |
|       |  +-- ... other perspectives (branch)                        |
|       |  +-- if blind spot found -> backtrack to Stage 2            |
|       |                                                             |
|       v                                                             |
|  stages/stage-5.5-hallucination-harness.md -> independent          |
|       |  anti-hallucination gate                                    |
|       |  +-- Check 1: Entity existence                              |
|       |  +-- Check 2: Source verification                           |
|       |  +-- Check 3: Cross-reference                               |
|       |                                                             |
|       v                                                             |
|  stages/stage-6-conclusion.md -> P0 gate + Conclusion Card         |
|       |                                                             |
|       v                                                             |
|  quality/self-assessment.md -> Quality self-assessment -> memory   |
|                                                                     |
+-------------------------------------------------------------------+

> **Fallback path**: If `can_branch=false` (sequential-thinking unavailable at runtime), Stages 1/2/5 degrade to linear reasoning. Branches are recorded as text instead of sequentialthinking calls.
```

### Stage Rules

| Stage | Tool Used | Reason |
|-------|-----------|--------|
| Contracts A1 + A2 | Contract templates (problem characteristics + reasoning strategy) | Classification and strategy only |
| Contract C0 | Contract template (user context capture) | Structured user constraints |
| Stage 1: Decomposition | `sequentialthinking` | Sub-problems need independent branch development |
| Stage 2: Hypothesis | `sequentialthinking` | Each hypothesis needs independent branch; Stage 5 can backtrack to revise here |
| Stage 3: Verification | `unified-fetch` | Requires actual search/browse/scrape (built-in 4-engine search + 6-engine scrape fallback) |
| Stage 4: Synthesis | None (pure reasoning) | Merging evidence does not need tools |
| Stage 5: Critique | `sequentialthinking` | Multi-perspective branching + backtracking revision |
| Stage 5.5: Anti-Hallucination Harness | None (pure reasoning) | Independent P0 gate, three checks: entity/source/cross-reference |
| Stage 6: Conclusion | None (P0 gate check) | Final judgment does not need tools |

### Contract C2 (Edge Definition)

**Edge definition file**: `contracts/C2.md` — defines required/optional transfer fields between each node, ensuring data integrity across stages.

---

## Backtracking Revision Mechanism (sequential-thinking exclusive)

```
When a blind spot is found during the critique stage:
  sequentialthinking({
    thought: "L4: Blind spot found — Hypothesis A ignores inflation factor",
    thoughtNumber: 8,
    totalThoughts: 12,
    branchFromThought: 2,   // branch from Hypothesis stage, Hypothesis A
    branchId: "revision-A",
    nextThoughtNeeded: true
  })

  // Revise on the Hypothesis stage branch
  sequentialthinking({
    thought: "L1 (revision): Hypothesis A with inflation adjustment...",
    thoughtNumber: 9,
    totalThoughts: 12,
    branchFromThought: 2,
    branchId: "revision-A",
    isRevision: true,
    revisesThought: 2,
    nextThoughtNeeded: true
  })

  // Re-verify the revised hypothesis
  // -> call unified-fetch to verify new data
  // -> write results back to the same branchId
```

**Backtracking termination condition**: each reasoning round has a revision limit of 3; beyond that, force entry into the conclusion stage, accept residual uncertainty, and explicitly mark unresolved blind spots in `residual_uncertainty`.

---

## MCP Toolchain

### Primary Toolchain Mapping

| Tool | Purpose | When Used |
|------|---------|-----------|
| `sequentialthinking` | Reasoning nodes (branching/backtracking/visualization) | Decomposition, Hypothesis, Critique stages |
| `mcp__unified-fetch__search` | Multi-engine search (Hound -> DDG -> Google -> Direct) | Verification stage (preferred) |
| `mcp__unified-fetch__scrape` | Multi-engine web scraping (Hound -> newspaper3k -> Trafilatura -> readability -> jusText -> Direct) | Verification stage, known URL needs full text |
| `mcp__unified-fetch__status` | Check engine health | Platform detection |

### Platform Mode Toolchain Mapping

| Platform Mode | Search Tool | Browse/Scrape Tool | Reasoning Engine |
|---------------|-------------|-------------------|------------------|
| CLI Full Mode | `unified-fetch search` | `unified-fetch scrape` | `sequentialthinking` |
| Desktop Mode | `WebSearch` | `WebFetch` | None |

### Common Task Tool Mapping

| Task Type | Call Sequence |
|-----------|--------------|
| Stock analysis | `unified-fetch search("ticker price financials")` then `unified-fetch scrape(url)` |
| Cryptocurrency | `unified-fetch search("coin name price market cap")` |
| Hotel comparison | `unified-fetch search("city hotel price rating")` then `unified-fetch scrape(url1)` + `unified-fetch scrape(url2)` |
| Restaurant recommendation | `unified-fetch search("city cuisine cuisine type price rating")` |
| Multi-page comparison | `unified-fetch scrape(url1)` + `unified-fetch scrape(url2)` + `unified-fetch scrape(url3)` |
| Shopping comparison | `unified-fetch search("product name price")` |
| Weather query | `unified-fetch search("city weather forecast")` |
| Job search | `unified-fetch search("position salary city")` |
| Course recommendation | `unified-fetch search("skill name online course rating price")` |
| Live browsing | `unified-fetch scrape(url)` |
| Precise extraction | `unified-fetch scrape(url)` (built-in 6-engine fallback, no manual specification needed) |

---

## Node Definition Files

### Contract Layer (Node Types)

| Contract | File | Purpose |
|----------|------|---------|
| A0 | `contracts/A0.md` | Mode routing (inferred from A1 output) |
| A1 | `contracts/A1.md` | Problem characteristics |
| A2 | `contracts/A2.md` | Reasoning strategy + platform detection + domain-aware verification paths |
| A3 | `contracts/A3.md` | Claim type definitions (A/B/C/D/E) + verification thresholds |
| A4 | `contracts/A4.md` | Source quality tiers (T1-T5) + marketing content detection |
| C0 | `contracts/C0.md` | User context capture |
| C1 | `contracts/C1.md` | Skip strategy unified management |
| C2 | `contracts/C2.md` | Inter-stage transfer edge definitions |

### Stage Layer (Execution Nodes)

| Stage | File | Tool |
|-------|------|------|
| Stage 1: Decomposition | `stages/stage-1-decomposition.md` | sequential-thinking |
| Stage 2: Hypothesis | `stages/stage-2-hypothesis.md` | sequential-thinking |
| Stage 3: Verification | `stages/stage-3-verification.md` | unified-fetch |
| Stage 4: Synthesis | `stages/stage-4-synthesis.md` | None (pure reasoning) |
| Stage 5: Critique | `stages/stage-5-critique.md` | sequential-thinking |
| Stage 5.5: Anti-Hallucination Harness | `stages/stage-5.5-hallucination-harness.md` | None (pure reasoning P0 gate) |
| Stage 6: Conclusion | `stages/stage-6-conclusion.md` | None (P0 gate check) |

### Mode Layer (Reasoning Templates)

| Mode | File | Core Mechanism |
|------|------|----------------|
| Diagnostic | `modes/diagnostic.md` | Symptoms -> candidate causes -> elimination verification -> minimal intervention |
| Design | `modes/design.md` | Requirements -> constraints -> solution space -> Pareto frontier |
| Decision | `modes/decision.md` | Options x criteria -> weighted scoring -> sensitivity analysis |
| Optimization | `modes/optimization.md` | Current state -> gradient direction -> step size -> convergence check |
| Innovation | `modes/innovation.md` | Break assumptions -> recombine elements -> new combinations |

### Quality Layer

| File | Purpose |
|------|---------|
| `quality/self-assessment.md` | Full scale (/50) + simplified scale (/30) + domain fitness + pre-assessment checklist |

---

## 5 Reasoning Modes

### 1. Diagnostic: Differential Diagnosis
Core mechanism: Symptoms -> candidate causes -> elimination verification -> minimal intervention
Applies to: Bug fixes, system failures, performance issues, data anomalies
See: `modes/diagnostic.md`

### 2. Design: Design Space Exploration
Core mechanism: Requirements -> constraints -> solution space -> Pareto frontier
Applies to: Architecture design, API design, system refactoring, technical proposals
See: `modes/design.md`

### 3. Decision: Decision Matrix
Core mechanism: Options x criteria -> weighted scoring -> sensitivity analysis
Applies to: Technology selection, vendor selection, priority ranking, option decisions
See: `modes/decision.md`

### 4. Optimization: Gradient Descent Thinking
Core mechanism: Current state -> gradient direction -> step size -> convergence check
Applies to: Performance optimization, cost optimization, process optimization, parameter tuning
See: `modes/optimization.md`

### 5. Innovation: Lateral Thinking
Core mechanism: Break assumptions -> recombine elements -> new combinations
Applies to: Breaking bottlenecks, new feature ideation, non-traditional solutions
See: `modes/innovation.md`

---

## Output Specification

### Required Outputs Per Invocation

```
## Reasoning Log
- Mode used: [mode name]
- Domain: [domain name]
- Stage execution summary: [one sentence per stage]
- Key turning points: [where reasoning path changed, including backtracking records]
- sequential-thinking tree: [branch count, backtracking revision count, revision attempts]
- Residual uncertainty: [unresolved questions]

## Conclusion Card
- Conclusion:
- Core evidence:
- Key evidence sources: [URL list]
- Confidence: [high/medium/low]
- Recommended actions:

## Pattern Asset (saved to Memory)
- Domain:
- Mode type:
- Core mechanism:
- Key lessons from this case:
- Reusable abstraction:
- Backtracking experience: [reason and method of this revision]
```

---

## Memory Integration

### Write Structure

```
# Pattern Assets (success patterns)
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-patterns/{type}/{pattern-name}.md

# Reasoning Logs
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-logs/YYYY-MM-DD_task-name.md

# Anti-Patterns (failure experiences)
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-anti-patterns/{category}.md

# Experience Cache (cross-topic transfer learning)
${CLAUDE_MEMORY_DIR:-$HOME/.claude/memory}/reasoning-patterns/cache/{topic-category}.md
```

### Cross-Topic Experience Cache Mechanism

| New Topic Category | Cache File |
|--------------------|------------|
| Macroeconomics | cache/macro-economy.md |
| Budget accommodation | cache/budget-accommodation.md |
| Precious metals/jewelry | cache/precious-metals.md |
| Tech industry | cache/tech-industry.md |
| Policy/regulation | cache/policy-regulation.md |
| Career transition | cache/career-switch.md |
| Interpersonal conflict | cache/conflict-resolution.md |
| Financial planning | cache/financial-planning.md |

### Pattern Index Format

```markdown
# Pattern: {pattern-name}
**Domain**: {domain}
**Mode**: {mode}
**Problem**: {brief description}
**Core mechanism**: {3-5 key steps}
**Success**: {yes/no}
**Key lessons**: {learnings from this case}
**Tools used**: {unified-fetch search / unified-fetch scrape / sequentialthinking}
**Reusable for**: {list of similar scenarios}
```

### Anti-Pattern Format

```markdown
# Anti-Pattern: {pattern-name}
**Problem type**: {hallucination/over-reasoning/tool-not-used/insufficient-evidence}
**Scenario**: {specific scenario description}
**Failure mode**: {specific error manifestation}
**Root cause**: {why it happened}
**Prevention**: {how to avoid}
```

---

## Collaboration with Other Skills

| Upstream Skill | Role | Handoff Point |
|---------------|------|---------------|
| using-superpowers | Detects tasks requiring reasoning | Routes to this skill |
| auto-fix-loop | Technical fixes needing root cause analysis | Shared hypothesis/verification stages |
| evolution | System evolution needing design decisions | Design mode |

---

## Principles

- **Decompose first, then hypothesize** — do not skip steps
- **At least 2 competing hypotheses per sub-problem** — avoid confirmation bias
- **Critique layer is mandatory** — at least 3 perspectives for high-risk problems
- **Branches can be backtracked and revised** — when a blind spot is found during critique, backtrack to the hypothesis stage rather than starting over
- **Forward propagation** — decomposition -> hypothesis -> verification -> synthesis -> critique -> conclusion, each stage's judgment passes to the next
- **Record the full reasoning chain** — including the sequential-thinking node tree
- **Deposit success patterns to Memory** — call them directly next time
- **Post-edit, always reconcile related files** — after modifying any node, reconcile MEMORY.md index and check related file references
- **Verifier Separation** — gates/scores/hallucination judgments are produced by independent perspectives to avoid self-assessment bias

### Post-Edit Sync Checklist (Mandatory)

```
[ ] Step 1: Modify node file (contracts/ stages/ modes/ quality/)
    +-- After modification, check whether C2 edge definitions are still correct

[ ] Step 2: Reconcile SKILL.md references
    +-- All files referenced in SKILL.md exist

[ ] Step 3: Reconcile Memory index
    +-- MEMORY.md entries vs actual files all exist

[ ] Step 4: Reconcile related file references
    +-- Files referenced in each node file exist

[ ] Step 5: MCP toolchain reconciliation
    +-- requires declarations vs actual mcp_servers.json consistent
    +-- MCP tools mentioned in SKILL.md vs actually available tools consistent

[ ] Step 6: Dead code check
    +-- grep -rn "research-router\|freeweb\|smart_search\|smart_fetch" SKILL.md -> 0 results
    +-- (Hound is part of unified-fetch engine description, not dead code, excluded from check)

[ ] Step 7: Date check
    +-- All dates in SKILL.md == today's date

[ ] Step 8: Memory volume check (optional)
    +-- bash scripts/memory-cleanup.sh --dry-run -> confirm reasoning log count and pending cleanup list
```

### One-Shot Comprehensive Check Command

```bash
bash scripts/sync-check.sh
```