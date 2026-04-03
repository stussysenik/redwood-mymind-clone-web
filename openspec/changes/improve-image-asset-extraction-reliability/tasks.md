## 1. Instagram Extraction

- [x] 1.1 Normalize Instagram targets so extraction preserves media kind and resolved share URLs.
- [x] 1.2 Persist slide-level media metadata for Instagram carousels, including video positions.
- [x] 1.3 Tighten partial-result detection so degraded Instagram results continue probing before being accepted.

## 2. Visual Fallback Guarantee

- [x] 2.1 Extend scraped-card merge logic to preserve preview provenance and promote a fallback preview asset when no image exists.
- [x] 2.2 Thread preview metadata through scraper and enrichment code without overwriting better existing images.

## 3. Verification

- [x] 3.1 Expand diagnostics to report normalized targets, partial-result reasons, and selected preview provenance.
- [x] 3.2 Add regression tests for Instagram target normalization, mixed-media extraction, and fallback preview promotion.
- [x] 3.3 Run targeted verification and record any residual blind spots.
