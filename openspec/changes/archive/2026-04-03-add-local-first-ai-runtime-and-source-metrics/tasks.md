## 1. Embedding And Runtime Configuration

- [x] 1.1 Recognize `GEMINI_EMBEDDING_2_API_KEY` in the embedding provider and keep diagnostics/provenance accurate.
- [x] 1.2 Centralize browser local-AI model identifiers and labels so the runtime is configurable at the Gemma-family level.

## 2. Local-First Save And Enrichment

- [x] 2.1 Normalize browser local AI classification during `saveCard` and use it to fill missing initial card fields without overwriting user input.
- [x] 2.2 Reuse valid local AI classification inside the enrichment pipeline before remote GLM/DSPy fallback.

## 3. Source Extraction Metrics

- [x] 3.1 Persist extracted text byte counts, deduplicated coverage, compressed source-text bytes, source payload bytes, image counts, and preview provenance in the shared scraped-card merge path.
- [x] 3.2 Surface the new extraction metrics, the explicit `0.8` source-text coverage target, and recovery provenance in targeted tests or diagnostics so the hot path is inspectable.
- [x] 3.3 Add a slower rendered-browser recovery path for weak or blocked static scrapes and prefer it when it materially improves the extracted source text.

## 4. Title Preservation And Shortcuts

- [x] 4.1 Rank weak/generic titles against scraped, local-AI, DSPy, and heuristic candidates and persist title-selection diagnostics.
- [x] 4.2 Preserve native `Cmd/Ctrl+A` behavior while keeping `Cmd/Ctrl+Enter` and `Escape` reliable in add/search flows.

## 5. Verification

- [x] 5.1 Add focused regression coverage for Gemini key detection, local-first classification fallback, extraction metrics, and title ranking.
- [x] 5.2 Run targeted verification and record remaining blind spots for “fully local”, source-fidelity, and scraper-reliability gaps.
- [x] 5.3 Run live visual-extraction diagnostics on representative URLs to confirm source-text metrics are emitted end to end.
