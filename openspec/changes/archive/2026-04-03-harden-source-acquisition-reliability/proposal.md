## Why

The scraper now measures source-text coverage, but it still loses too much fidelity when a page renders its real content through client-side network calls or when the fetched HTML is mostly a login wall, consent wall, or generic shell. That leaves the hot path with the right observability but not enough evidence to recover weak acquisitions consistently.

## What Changes

- Add a browser acquisition bundle for rendered recovery so the scraper can capture rendered HTML, intercepted JSON/text responses, and blocker signals from a single browser session.
- Promote blocker-shell detection into the shared scraper path so login walls, consent walls, and “enable JavaScript” shells trigger slower recovery deliberately instead of being treated as successful HTML captures.
- Let enrichment escalate low-quality acquisitions into an aggressive browser acquisition pass before continuing classification, so the first background enrichment pass tightens failure handling automatically.
- Persist acquisition diagnostics in the shared extraction metrics contract so operators can see which evidence sources were captured and whether a recovery/escalation path ran.

## Capabilities

### New Capabilities

- `source-acquisition-reliability`: Capture and prioritize richer browser-acquired source evidence when static or blocked scrapes are insufficient.

### Modified Capabilities

- `source-extraction-metrics`: Extend the shared metrics contract to record acquisition evidence kinds, blocker signals, and aggressive recovery attempts.

## Impact

- Affected code: `api/src/lib/scraper/*`, `api/src/services/enrichment/enrichment.ts`, `scripts/diagnoseVisualExtraction.ts`
- Affected behavior: generic website scraping, rendered recovery, enrichment retry/escalation, shared extraction diagnostics
- Dependencies/systems: Playwright browser sessions, existing scraper metrics persistence, OpenSpec source extraction specs
