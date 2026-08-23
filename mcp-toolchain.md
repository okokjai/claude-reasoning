# MCP Toolchain Reference

## Primary Toolchain Mapping

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

推理流程由環境強制執行，不依賴模型自律：

| Hook | 角色 | 機制 |
|------|------|------|
| `UserPromptSubmit` | 契約生成 | 偵測 `/claude-reasoning` → 生成 `~/.claude/reasoning-contracts/{session}.json`（必需工具序列）|
| `PostToolUse` | 軌跡記錄 | 每次工具調用 → 環境追加 `~/.claude/reasoning-trail/{session}.jsonl`（模型不參與）|
| `Stop` | 閘門 | 模型停止前對比 trail vs 契約 → 缺失則 block + 注入缺失清單 |

**硬性契約**：A2 執行規則 1 的 `mcp__unified-fetch__status` 必須實際調用（無例外）。
**軟性契約**：Stage 3 搜索/爬取、sequential-thinking 調用，由 `sync-check.sh --runtime` 以 WARN 審計。
**Kill switch**：無契約的 session 完全不受影響；對抗性篡改（模型用工具改 trail）為物理不可防，誠實聲明。