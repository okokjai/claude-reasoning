# Anti-Hallucination Semantic Gates

Before delivering the final conclusion on any **Path B** reasoning task, execute these 5 semantic verification gates. These operate as a **Verifier Separation** firewall: the agent must critically review its own generated claims as an independent auditor.

---

## Gate 1: Specific Entity & Metric Grounding
- **Entity check**: Every specific named entity (organization, person — including a handle, username, or author name — company/product affiliation, model number, library, protocol, endpoint, version number, or URL) must have appeared in retrieved search results or session ground truth. This list is illustrative, not exhaustive.
- **Metric & price check**: Every quantitative metric (prices, token limits, latency, benchmarks, percentages) must be directly traced to a verified source URL.
- **No expansion rule**: Do not expand, complete, or infer an entity's name, identity, or affiliation beyond what the source states verbatim. A handle stays a handle; an abbreviation stays an abbreviation unless a retrieved source resolves it.
- **Rule**: If a metric, price, or entity detail cannot be tied to an explicit source URL, it **must not** appear as a definitive claim. Demote to an unverified estimate or remove it; never fill the gap from memory. Follow Gate 4 and search for the missing detail before writing it down.

---

## Gate 2: Dual Independent Sources for Load-Bearing Facts
- **Independence rule**: A claim marked `verified` requires at least 2 distinct root-domain sources from Tier 1 or Tier 2 (see `references/source-tiers.md`).
- **Single-source flag**: If only one source exists, it must be explicitly labeled `single_source` or `[Probable]` in the conclusion. Never present single-source claims as consensus facts.
- **Prohibited**: Synthesizing two articles that both quote the exact same press release or single blog post as "dual sources".

---

## Gate 3: Temporal Currency & Version Alignment
- **Reference date**: the only "today" is the script's `today` field (printed by `--status` / `--reset`, local calendar date `YYYY-MM-DD`). Compare every source age against it — never against a date read off a search snippet, a page's last-modified stamp, or memory. The lint report warns when a `verified` claim's newest `--claimDate` is more than 180 days before `today`.
- **Recency check**: When evaluating fast-moving technologies or APIs, verify the timestamp of the source and record it as `--claimDate` (one per `--claimSource`, publish date of that source).
- **Version binding**: Explicitly tie claims to specific software versions (e.g., "In Claude 3.5 Sonnet (2024-10-22 release)...", "As of AWS Bedrock API v2...").
- **Stale assumption check**: If a source is > 6 months old (measured against `today`) in an active field, formulate a negative verification query (Gate 4) to ensure the feature has not been deprecated or altered.
- **"Latest" queries carry the current month**: a freshness query must include the current year-month from `today`. If the window returns nothing, report "no result in window" — never substitute an older result and imply it is current.

---

## Gate 4: Negative Search & Disconfirmation (Falsification)
- **Active search for disproof**: Before finalizing any affirmative conclusion (e.g. "Tool X is completely free", "Library Y is thread-safe"), conduct at least one explicit negative/adversarial search query:
  - Examples: `"<Tool X> limitations pricing caveats"`, `"<Library Y> thread safety race condition issue"`.
- **Concealed contradiction check**: If search results surface known bugs, caveats, or conflicting reports, they **must not** be hidden. Surface them under "Residual Uncertainty" or "Contested Claims".

---

## Gate 5: Honest Tool Absence & Negative Result Reporting
- **Zero tool fabrication**: If the session lacks web search, browser, or MCP fetch capabilities, explicitly report:
  `--verifyClaim claim-N --claimStatus unverified --claimNotes "No search or fetch tool available in this session"`
- **Legitimacy of negative findings**: Reporting "no public documentation found" or "feature not verified" is an acceptable, high-integrity engineering deliverable. Never fabricate details to appear more authoritative.
