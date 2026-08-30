# MCP Toolchain Reference

## Runtime Behavior

The CLI and `PipelineExecutor` launch configured MCP servers through JSON-RPC stdio clients. `search` and `scrape` calls are recorded in Stage 3 tool traces and normalized into evidence and citations. If a configured server cannot initialize or call a capability, the result is `Insufficient` evidence and the P0 result fails; no placeholder citation is generated. If no server definition exists, the tool plugin uses its explicit local fallback. The default unified-fetch path in `config.yaml` is machine-specific (`C:/Users/PaulPaul/.claude/unified-fetch/unified-fetch-server.py`); provide an external config override on another machine.


| Tool | Purpose | When Used |
|------|---------|-----------|
| `sequentialthinking` | Reasoning nodes (branching/backtracking/visualization) | Stage 0 bounded brainstorm, Decomposition, Hypothesis, Critique stages; Stage 0 uses a linear fallback when unavailable |
| `mcp__unified-fetch__search` | Multi-engine search (Hound -> DDG -> Google -> Direct) | Verification stage (preferred) |
| `mcp__unified-fetch__scrape` | Multi-engine web scraping (Hound -> newspaper3k -> Trafilatura -> readability -> jusText -> Direct) | Verification stage, known URL needs full text |
| `mcp__unified-fetch__status` | Check engine health | Platform detection |

## Platform Mode Toolchain Mapping

| Platform Mode | Search Tool | Browse/Scrape Tool | Reasoning Engine |
|---------------|-------------|-------------------|------------------|
| CLI Full Mode | `unified-fetch search` | `unified-fetch scrape` | `sequentialthinking` |
| Desktop Mode | `WebSearch` | `WebFetch` | None |

## Common Task Tool Mapping

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

## Execution Enforcement (Hooks)

The reasoning flow is enforced by the environment, not by model self-discipline:

| Hook | Role | Mechanism |
|------|------|-----------|
| `UserPromptSubmit` | Contract generation | Detects `/claude-reasoning` → generates `~/.claude/reasoning-contracts/{session}.json` (required tool sequence) |
| `PostToolUse` | Trail recording | Every tool call → environment appends to `~/.claude/reasoning-trail/{session}.jsonl` (model does not participate) |
| `Stop` | Gate | Before model stops, compares trail vs contract → missing items block + inject missing list |

**Hard contract**: A2 execution rule 1's `mcp__unified-fetch__status` must be actually called (no exceptions).
**Soft contract**: Stage 3 search/scrape and sequential-thinking calls are audited by `sync-check.sh --runtime` as WARN.
**Kill switch**: Sessions without a contract are completely unaffected; adversarial tampering (model using tools to modify trail) is physically unpreventable — honest declaration.