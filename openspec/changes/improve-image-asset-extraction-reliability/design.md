## Context

The current scrape pipeline optimizes for fast extraction but still treats "some text plus no image" as an acceptable saved state. Instagram is the most fragile branch because it mixes share URLs, canonical URLs, reels, posts, and mixed-media sidecars, while the current fallback logic collapses everything to `/p/<shortcode>/`. Outside Instagram, the generic persistence layer does not guarantee any visual asset when source metadata lacks `og:image`.

The product requirement is broader than a platform bug: a user saving a remotely reachable link should almost always get a visible card. Deployed failures also need to leave evidence, because production-only extraction gaps have been hard to reproduce locally.

## Goals / Non-Goals

**Goals:**
- Normalize Instagram extraction targets without losing media kind.
- Preserve slide-level media metadata for Instagram carousels and videos.
- Guarantee a fallback preview asset for scraped links that would otherwise save without a visual.
- Add structured diagnostics that make partial or failed extraction runs explainable.

**Non-Goals:**
- Introduce a new external scraping vendor or Meta API dependency.
- Persist native video binaries or download Instagram media to local storage.
- Redesign the frontend presentation of non-Instagram cards beyond consuming better metadata.

## Decisions

### Decision: Replace shortcode-only handling with target parsing
The extractor will derive a normalized Instagram target object that includes `shortcode`, `kind`, and resolved URL details. This avoids the current blind spot where reels fall back to `/p/<shortcode>/` endpoints.

Alternative considered: Keep shortcode-only handling and special-case reels later.
Why rejected: It keeps the core mismatch in place and makes diagnostics less trustworthy.

### Decision: Carry slide-level media metadata through the scrape boundary
`InstagramPostData` and the generic scraped payload will include `mediaTypes` and `videoPositions`, allowing the enrichment layer to persist those fields directly to card metadata.

Alternative considered: Infer video slides in the frontend from URL patterns.
Why rejected: The frontend only sees preview URLs, not enough source truth to infer mixed carousels reliably.

### Decision: Guarantee visuals in the enrichment merge layer
The fallback preview guarantee will live in `buildScrapedCardUpdate`, where all scrape results converge before persistence. If no source image exists and the card has no current image, the merge layer will promote a screenshot preview URL and mark its provenance.

Alternative considered: Add screenshot fallback separately in every scraper branch.
Why rejected: That duplicates logic across platforms and still risks missing future scraper branches.

### Decision: Expand diagnostics rather than add a new background service
The existing Instagram diagnostic path will be extended to report normalized-target and partial-result context. This gives us a deploy verification loop without introducing a new Elixir service just to explain scraper decisions.

Alternative considered: Move extraction provenance immediately into the Elixir worker pipeline.
Why rejected: It is a larger architecture change than needed for the current product issue and would slow delivery of the actual fix.

## Risks / Trade-offs

- [Fallback screenshots can be less semantically useful than source media] → Mitigation: prefer source media whenever present and record preview provenance so fallbacks remain visible.
- [Instagram share URLs may still exist that cannot be resolved to a shortcode] → Mitigation: preserve diagnostics for unresolved targets and fall back to preview capture rather than silently saving an empty card.
- [More metadata fields increase merge complexity] → Mitigation: add focused unit tests around merge behavior and keep fallback rules centralized.
- [Microlink fallback is an external dependency] → Mitigation: reuse the dependency already present in the product and keep Playwright available as a separate capture path.

## Migration Plan

1. Add OpenSpec artifacts and implement extractor changes behind the current scrape path.
2. Extend enrichment merge logic to persist preview provenance and screenshot fallback assets.
3. Add regression tests for Instagram target handling, mixed-media sidecars, and fallback preview promotion.
4. Verify locally against representative live URLs plus automated tests.
5. Deploy normally; if issues remain, use the new diagnostic output to inspect resolved targets and strategy traces before attempting broader architecture changes.

Rollback strategy: revert the change set. Existing scraper behavior remains intact because no schema migration is required.

## Open Questions

- Whether any high-value platform besides Instagram needs a custom preview guarantee beyond the generic screenshot fallback.
- Whether to expose the richer diagnostics through a user-facing endpoint later or keep them as code-level/operator tooling for now.
