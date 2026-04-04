## 1. Hybrid Search

- [x] 1.1 Define a retrieval contract that combines keyword, tag, and embedding signals.
- [x] 1.2 Add explicit compatibility checks for embedding provider, model, and vector dimension.
- [x] 1.3 Ensure similar-card retrieval and primary search share a consistent ranking vocabulary.

## 2. Tag Reliability

- [x] 2.1 Preserve normalized tags through enrichment and merge paths.
- [x] 2.2 Ensure tag visibility in search results, detail surfaces, and filter flows.
- [x] 2.3 Add regression coverage for tag persistence and lossless tag rendering.

## 3. Diagnostics

- [x] 3.1 Emit searchable embedding diagnostics with provenance and failure reasons.
- [x] 3.2 Make search verification output explain why a result was ranked or skipped.

## 4. Verification

- [x] 4.1 Define live search queries for exact match, semantic match, and tag-only match cases.
- [x] 4.2 Verify that tag filters still work when enrichment metadata changes.
- [x] 4.3 Record residual blind spots and follow-up gaps after validation.
