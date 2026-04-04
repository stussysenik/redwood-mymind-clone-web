# Verification

Date: 2026-04-03

## Commands Run

### Live hybrid-search verification

```bash
yarn rw exec diagnoseSearch -- --case 'exact=Making Design Book' --case 'tag=#design-screenshot' --case 'semantic=curated mobile pattern gallery'
```

Observed:
- Exact case returned `Making Design Book by Irma Boom` as rank 1.
- Tag-only case returned four `design-screenshot` matches with `exact-tag-match:8` in the ranking reasons.
- Semantic case returned no results and explicitly reported the blind spot: `GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY is not configured`.

### Tag-filter verification

```bash
yarn rw exec diagnoseSearch -- --tag '#design-screenshot' --case 'filter=Apple'
```

Observed:
- Filtered query returned only `Apple Liquid Glass UI Design Elements`.
- Result explanations showed both keyword and tag signals, confirming the persisted canonical tag still drives filtering even when the card carries enrichment metadata.

### Focused smoke check after formatting

```bash
yarn rw exec diagnoseSearch -- --limit 1 --case 'exact=Making Design Book'
```

Observed:
- Script still executed successfully after formatting and code cleanup.

## Coverage Added

- Search diagnostics now emit:
  - embedding compatibility status
  - ranking signals
  - per-result reasons
  - skipped semantic reasons
- Tag persistence now normalizes tags on:
  - card save
  - card update
  - enrichment merge
- Regression tests were added for:
  - explainable search diagnostics
  - semantic-only result tag sanitization
  - legacy/user tag normalization during enrichment merge

## Residual Blind Spots

- Semantic retrieval could not be fully validated in this environment because embeddings are unavailable locally:
  - `GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY is not configured`
- The Redwood Jest harness could not be executed end-to-end because the test database reset failed before tests ran:
  - Prisma reset error `P3016` / `P1010` against `.redwood/test.db`

## Follow-up Gaps

- Re-run the live semantic verification case once an embedding provider is configured.
- Repair the Redwood API test database setup so the new regression tests can run under the normal harness instead of only being added statically.
