## Why

Saved links are still landing without usable visuals often enough to break the core product promise, with Instagram mobile/share URLs being the most visible failure case. We need to stop accepting "scrape succeeded but no image asset was persisted" as a good outcome and add enough diagnostics to verify behavior in deployed environments instead of re-litigating the same failures.

## What Changes

- Normalize Instagram targets across canonical, mobile, and share URLs while preserving post kind (`p`, `reel`, `tv`) for downstream extraction.
- Extract full Instagram carousel media lists, preserve slide-level video markers, and carry that metadata through enrichment so the UI can denote video slides correctly.
- Guarantee a persisted preview asset for scraped links when no first-party image is extracted by promoting a screenshot fallback instead of saving a visually empty card.
- Tune fallback screenshot capture URLs to wait for meaningful page content before snapshotting so saved previews do not freeze on loading states.
- Expand extraction diagnostics so failed or degraded runs record which strategy was tried, what target URL was resolved, and why the chosen result was considered partial or final.

## Capabilities

### New Capabilities

- `instagram-media-extraction`: Canonicalize Instagram targets and return complete media metadata for posts, reels, and carousels.
- `visual-asset-guarantee`: Persist a usable preview asset for scraped URLs even when source metadata does not provide a direct image.
- `extraction-diagnostics`: Expose enough structured evidence to debug extraction failures and blind spots across environments.

### Modified Capabilities

- None.

## Impact

- Affected code: `api/src/lib/scraper/instagramExtractor.ts`, `api/src/lib/scraper/scraper.ts`, `api/src/services/enrichment/enrichment.ts`, related tests, and verification scripts.
- Affected systems: Instagram extraction, generic scrape persistence, enrichment metadata, and operator troubleshooting workflows.
- No external dependency is required for the initial fix; existing Microlink and Playwright integrations remain the fallback path.
