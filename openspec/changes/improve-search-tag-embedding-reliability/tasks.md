## 1. Hybrid Search

- [ ] 1.1 Define a retrieval contract that combines keyword, tag, and embedding signals.
- [ ] 1.2 Add explicit compatibility checks for embedding provider, model, and vector dimension.
- [ ] 1.3 Ensure similar-card retrieval and primary search share a consistent ranking vocabulary.

## 2. Tag Reliability

- [ ] 2.1 Preserve normalized tags through enrichment and merge paths.
- [ ] 2.2 Ensure tag visibility in search results, detail surfaces, and filter flows.
- [ ] 2.3 Add regression coverage for tag persistence and lossless tag rendering.

## 3. Diagnostics

- [ ] 3.1 Emit searchable embedding diagnostics with provenance and failure reasons.
- [ ] 3.2 Make search verification output explain why a result was ranked or skipped.

## 4. Verification

- [ ] 4.1 Define live search queries for exact match, semantic match, and tag-only match cases.
- [ ] 4.2 Verify that tag filters still work when enrichment metadata changes.
- [ ] 4.3 Record residual blind spots and follow-up gaps after validation.
