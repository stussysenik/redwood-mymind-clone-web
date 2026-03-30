# Pipeline 99.9% Reliability Design

## Problem
Enrichment pipeline is at 87.5% success rate. 13 failure modes identified across scraper, classifier, quality gate, and infrastructure layers. The user needs every card tagged correctly before the next deploy.

## Fixes (Priority Order)

### A. Hard Crash Fixes (Card Loss Prevention)

**A1. UTF-8 encoding crash in scraper**
- File: `scraper.ex`
- Fix: Wrap all scraped content with `String.valid?/1` check, replace invalid bytes with `<<0xFFFD>>` (Unicode replacement char)
- No external deps needed — use `:unicode.characters_to_binary/2` for conversion

**A2. Logger formatter crash with binary card IDs**
- File: `worker.ex`
- Fix: Format binary UUIDs to hex string before passing to Logger.metadata
- Already have `format_uuid` in quality_gate.ex — reuse it

### B. API Cascade Fixes (Stop Wasting 190s)

**B3. Remove GLM text retry on timeout**
- File: `classifier.ex`
- Fix: Remove the retry-on-timeout block in `try_glm/3`. If GLM times out, go straight to fallback instead of burning another 30s.

**B4. Reduce NIM timeout from 90s to 45s**
- File: `classifier.ex`
- Fix: If Kimi doesn't respond in 45s, it's not going to. Fall through to GLM faster.

**B5. Skip GLM vision on known-bad image URLs**
- File: `classifier.ex`
- Fix: Skip vision when image_url contains twitter/x.com CDN (returns HTML, always fails with error 1210)

### C. Quality Fixes (Better Tags)

**C6. Fallback stopword filter**
- File: `classifier.ex` `extract_keywords/3`
- Fix: Import quality gate's stopword list and reject stopwords in fallback. Currently "your", "with", "more" slip through.

**C7. Quality gate cap_tags negative count bug**
- File: `quality_gate.ex`
- Fix: Guard `cap_tags` to return early when `length(tags) <= max`

**C8. DB write retry with backoff**
- File: `worker.ex`
- Fix: 3 retries with 1s/2s/3s backoff on write_enriched failure

### D. Stale Data Cleanup (After Code Fixes)

**D9. New backfill mode: re-enrich bad cards**
- File: `backfill.ex`
- Fix: Add `--force-all` flag that targets cards with bad tags:
  - Cards with stopword tags ("this", "that", "blame", etc.)
  - Cards with only generic tags ("design", "technology", "ai")
  - Cards with `tagsSource = 'fallback'`

## Files Modified
- `mymind_enrichment/lib/mymind_enrichment/pipeline/scraper.ex`
- `mymind_enrichment/lib/mymind_enrichment/pipeline/classifier.ex`
- `mymind_enrichment/lib/mymind_enrichment/pipeline/quality_gate.ex`
- `mymind_enrichment/lib/mymind_enrichment/pipeline/worker.ex`
- `mymind_enrichment/lib/mix/tasks/backfill.ex`

## Verification
- Compile with zero warnings
- Run backfill on 20 cards with `--limit 20`
- Check: 0 CRASHes, 0 logger formatter errors
- Check: No tags contain stopwords
- Check: Fallback tags use title + platform, not keyword garbage
