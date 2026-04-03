## Why

The current app has a partial local-AI story: the browser can run a Gemma-family classifier, but save/enrichment still treats that result as disposable metadata and the server embedding path ignores the `GEMINI_EMBEDDING_2_API_KEY` already present in local configuration. At the same time, extraction reliability is only partially observable, because the hot path records preview provenance but not a uniform count of how much text or source payload was actually captured. Title quality is also inconsistent, with many cards persisting weak placeholders like “Untitled” or stale URL-derived names even when the original source contains better descriptive language.

## What Changes

- Wire Gemini Embedding 2 configuration through the server embedding provider and diagnostics, including support for the dedicated `GEMINI_EMBEDDING_2_API_KEY` environment variable.
- Promote browser-produced local AI classification into a first-class save/enrichment input so cards can still get usable type/title/tag/summary metadata when remote AI is unavailable.
- Make the browser local-AI runtime configurable at the Gemma-family model level instead of hard-coding stale model labels, and keep common keyboard shortcuts usable in the add/search surfaces.
- Persist generalized extraction metrics on the enrichment hot path, including extracted text byte counts, deduplicated coverage, compressed source-text bytes, raw payload bytes, image counts, and preview provenance for scraped saves.
- Add a slower rendered-browser recovery path when static scraping is weak or blocked, so the general website hot path can target at least 80% coverage of a compressed source-text snapshot.
- Rank title candidates from scraped content, local AI, DSPy, and heuristics so weak placeholders are replaced with memorable source-aware titles while preserving diagnostics about the decision.
- Keep existing semantic search/vector storage behavior intact, while making the “remote embeddings unavailable” state explicit instead of silently discarding the local-first path.

## Capabilities

### New Capabilities
- `local-first-ai-runtime`: Browser local AI can seed and sustain card classification when cloud AI is unavailable.
- `embedding-provider-compatibility`: Gemini Embedding 2 configuration is discoverable, validated, and diagnosable from existing embedding utilities.
- `source-extraction-metrics`: The scrape/enrichment hot path records consistent extraction counts, coverage targets, and recovery provenance across platforms.
- `source-title-preservation`: Enrichment replaces weak titles with the strongest source-aware candidate and records why that title won.

### Modified Capabilities

- None.

## Impact

- Affected web code: `web/src/lib/local-ai/*`, `web/src/components/AddButton/AddButton.tsx`, `web/src/components/AddModal/AddModal.tsx`, `web/src/components/SearchBar/SearchBar.tsx`, `web/src/pages/SettingsPage/SettingsPage.tsx`, and related UI status components.
- Affected API code: `api/src/lib/ai/embeddings.ts`, `api/src/lib/ai/titleOptimization.ts`, `api/src/lib/scraper/scraper.ts`, `api/src/lib/scraper/sourceText.ts`, `api/src/lib/scraper/renderedContent.ts`, `api/src/services/cards/cards.ts`, `api/src/services/enrichment/enrichment.ts`, and verification/diagnostic helpers.
- Affected behavior: new-card save flow, enrichment classification fallback, title selection, embedding provider detection, keyboard shortcut behavior, static-vs-rendered scrape recovery, and scraped-card metadata shape.
- Dependencies/systems: existing `@huggingface/transformers` browser runtime, Google Gemini embedding API, Supabase pgvector, and current scrape pipeline diagnostics.
