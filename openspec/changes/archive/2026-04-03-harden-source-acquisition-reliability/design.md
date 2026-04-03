## Context

The current scraper already records source-text coverage and can fall back from static HTML to a slower rendered-HTML recovery path. That improved observability, but the rendered path still only looks at the final DOM and does not capture the browser-side JSON/text payloads that often contain the real source content for social and client-rendered sites. The static path also treats some login walls, consent walls, and JavaScript shells as successful captures because they produce enough text to clear simple byte thresholds.

The enrichment pipeline has a natural retry boundary: it already runs background scraping before classification and can pay extra latency once when the first acquisition looks weak. The design goal is to use that existing hot path rather than adding a separate async queue or manual operator workflow.

## Goals / Non-Goals

**Goals:**

- Capture richer browser-side evidence during rendered recovery, including meaningful JSON/text responses in addition to the final DOM.
- Detect blocker-shell acquisitions explicitly and use those signals to trigger stronger recovery.
- Allow enrichment to run one aggressive browser acquisition retry when the first scrape still looks low-quality.
- Persist enough diagnostics to explain which evidence sources were captured and why the recovery/escalation path ran.

**Non-Goals:**

- Residential proxying, anti-bot bypass, or authenticated session management.
- Exact raw-byte equivalence with every source payload.
- A multi-job retry queue or long-running acquisition orchestration service.

## Decisions

### 1. Rendered recovery becomes a browser acquisition bundle, not a DOM-only fetch

The rendered recovery module will collect:

- final rendered HTML
- page title
- a compressed text snapshot from intercepted JSON/text responses
- explicit blocker signals observed in the page snapshot or page title
- counts of intercepted response bodies that contributed source text

This keeps the recovery model simple: one browser session yields a bundle of evidence that the scraper can merge into a better source snapshot. Capturing the network payload summary is cheaper and less brittle than building per-site DOM scrapers for every client-rendered experience.

Alternative considered:

- Building more platform-specific DOM selectors only. Rejected because it does not address client-rendered data that never appears cleanly in the final DOM.

### 2. Blocker detection is shared text analysis, not platform-specific branching

The scraper will analyze normalized source snapshots for blocker signals such as login walls, signup prompts, JavaScript-only shells, consent walls, and app-open interstitials. These signals are not treated as proof that the scrape failed, but they do trigger rendered recovery and aggressive escalation when they dominate the acquisition.

Alternative considered:

- Hard-coding blocker logic separately in each platform extractor. Rejected because generic websites and failing social fallbacks share the same failure modes.

### 3. Enrichment escalates at most once with an aggressive browser pass

The enrichment pipeline will run the current scrape first. If the resulting extraction metrics show blocker signals, low source-text coverage, or a generic/weak fallback title, enrichment will run one aggressive browser acquisition pass and prefer it only when it materially improves the evidence.

This bounds cost and avoids unbounded retry loops while still tightening the first background enrichment pass substantially.

Alternative considered:

- Immediate multi-stage retry queues. Rejected for now because the current architecture already has one background pipeline invocation and no durable retry scheduler.

### 4. Diagnostics stay in the shared extraction metrics contract

The shared merge path will persist:

- acquisition evidence kinds
- blocker signals
- rendered network response counts/text bytes
- whether an aggressive recovery attempt ran and why

Persisting these fields in the same contract as the rest of the extraction metrics keeps operators on one inspection surface and avoids one-off debug metadata blobs.

## Risks / Trade-offs

- [Browser acquisition costs more time and memory] → Limit intercepted payload sizes, response counts, and aggressive retries to one pass.
- [Interception can collect noisy text] → Normalize and deduplicate network text before merging it into the source snapshot.
- [Blocker detection can false-positive on legitimate content] → Use blocker signals as escalation hints, not as unconditional failure states.
- [Some sites still block the browser session entirely] → Persist the attempt and blocker diagnostics so failures are explicit instead of silent.

## Migration Plan

- No schema migration is required because acquisition diagnostics continue to live in card metadata.
- Rollout is additive: existing scrapes keep working, and new metrics fields appear only when the richer acquisition path runs.
- If the new bundle capture causes issues, the aggressive-enrichment retry can be disabled by reverting the single retry decision without removing the rest of the metrics contract.

## Open Questions

- Whether the aggressive browser pass should later be gated by an environment flag for deployed latency budgets.
- Whether screenshot OCR should become part of the same acquisition bundle or remain a separate follow-up capability.
