# Source Tiers Hierarchy (from claude-reasoning A4)

When verifying factual claims, source credibility determines whether a claim can be marked `verified`, must remain `single_source`, or is rejected.

---

## Tier 1: Primary & Authoritative Sources
**Weight: High (counts as 1 primary source toward dual-source requirement)**

- **Official documentation**: Vendor docs (docs.aws.amazon.com, cloud.google.com, docs.anthropic.com).
- **First-party source code / Git repositories**: Commit history, release tags, PR merges, official SDKs.
- **Regulatory & legal filings**: SEC reports (10-K, 10-Q), court rulings, patent filings.
- **Formal release notes & changelogs**: Signed releases, official engineering blog announcements authored by core maintainers.
- **Primary data endpoints**: Direct query to live official APIs or status pages.

*Dual-source rule*: Two distinct Tier 1 endpoints from separate organizations (e.g. AWS docs + Anthropic announcement) satisfy `verified`.

---

## Tier 2: Secondary Reputable Sources
**Weight: Moderate (counts as 1 secondary source; requires corroboration)**

- **Major peer-reviewed publications**: IEEE, ACM, Nature, arXiv preprints (flag preprint status).
- **Established technology journalism**: Reuters, Bloomberg, The Verge, Ars Technica, Wired.
- **Audited benchmark reports**: Independent evaluation bodies with reproducible methodologies (e.g. MLPerf).
- **Major industry research firms**: Gartner, Forrester, IDC (when citing primary data, not sponsored content).

*Dual-source rule*: Tier 2 + Tier 1 satisfies `verified`. Two independent Tier 2 sources satisfy `verified` if they do not cite the same primary press release.

---

## Tier 3: Tertiary & Community Sources
**Weight: Weak (CANNOT satisfy `verified` alone; max status: `single_source` or used for preliminary hypotheses)**

- **Personal / engineering blogs**: Medium, Substack, dev.to, individual developer writeups.
- **Community forums & Q&A**: Stack Overflow, Reddit, Hacker News, GitHub Issues / Discussions.
- **Community wikis**: Wikipedia (must trace to primary citations; do not cite Wikipedia article directly for load-bearing claims).
- **Conference presentations**: Slide decks without accompanying peer-reviewed papers.

*Rule*: Even multiple Tier 3 sources cannot elevate a claim to `verified` if no Tier 1 or Tier 2 source confirms it. Status must remain `single_source` or `unverified`.

---

## Tier 4: Unreliable & Disallowed Sources
**Weight: Zero (PROHIBITED as evidence)**

- **AI-generated summaries**: Perplexity / SearchGPT auto-summaries without verifying underlying URLs.
- **SEO content farms**: Generic aggregator websites, automated re-publishing platforms.
- **Sponsored content / Advertorials**: Marketing vendor comparisons with commercial conflicts of interest.
- **Social media rumors**: Unverified posts on X, LinkedIn, or chat channels without primary proof.

---

## Dual-Source Independence Test
Before marking `--claimStatus verified`:
1. **Domain Diversity**: The two `--claimSource` URLs must resolve to distinct root domains owned by different entities.
2. **Syndication Check**: Ensure Source B is not merely quoting or summarizing a press release from Source A.
3. If only one independent source exists, you **must** record `--claimStatus single_source`.
