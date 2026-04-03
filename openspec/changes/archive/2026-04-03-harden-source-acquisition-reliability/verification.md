## Verification

Verified on 2026-04-03 in the local workspace.

### Completed checks

- `openspec instructions apply --change "harden-source-acquisition-reliability" --json`
  - Result before archive: `8/8` tasks complete, state `all_done`.

- `yarn rw type-check api --prisma false --generate false 2>&1 | rg -n "scraper/(scraper|sourceText|renderedContent)|enrichment\\.ts|enrichment\\.test|diagnoseVisualExtraction" || true`
  - Result: no type errors reported for the API files changed by this change.

- `git diff --check -- api/src/lib/scraper/sourceText.ts api/src/lib/scraper/sourceText.test.ts api/src/lib/scraper/renderedContent.ts api/src/lib/scraper/scraper.ts api/src/services/enrichment/enrichment.ts api/src/services/enrichment/enrichment.test.ts scripts/diagnoseVisualExtraction.ts openspec/changes/harden-source-acquisition-reliability`
  - Result: clean.

- `yarn rw exec diagnoseVisualExtraction -- https://example.com`
  - Result: emitted the new shared acquisition fields with `sourceEvidenceKinds: ["static-html"]` and no blocker or rendered-network metrics, as expected for a clean static page.

- `yarn rw exec diagnoseVisualExtraction -- --aggressive https://www.linkedin.com/company/openai/`
  - Result: emitted live blocker diagnostics with `blockerSignals: ["signup-wall"]`.
  - Result: the first scrape still won for this URL, so the final saved scrape remained `sourceEvidenceKinds: ["static-html"]` with no rendered-network contribution.

- `yarn rw exec diagnoseVisualExtraction -- --aggressive https://x.com/OpenAI`
  - Result: the X/Twitter API-specific extractor declined the non-status URL and the request fell back into the generic path cleanly.
  - Result: the aggressive browser path did not materially improve the acquisition for this URL in local verification, so the final scrape remained a thin static HTML fallback rather than claiming false recovery.

### Repo-wide verification noise outside this change

- `yarn rw type-check api --prisma false --generate false`
  - Still fails in pre-existing areas outside this change, including:
    - `api/src/functions/graphql.ts`
    - `api/src/lib/ai/classificationPipeline.test.ts`
    - `api/src/lib/ai/classificationPipeline.ts`
    - `api/src/lib/ai/vectorStore.ts`
    - `api/src/lib/pinecone.ts`
    - `api/src/lib/scraper/browserFactory.ts`
    - `api/src/lib/scraper/screenshotPlaywright.ts`
    - `api/src/services/search/search.ts`

- `yarn jest api/src/lib/scraper/sourceText.test.ts api/src/services/enrichment/enrichment.test.ts --runInBand`
  - Not relied on in this pass because Redwood Jest global setup is still blocked by the pre-existing Prisma test DB reset failure (`P3016` caused by `P1010`) against `.redwood/test.db`.

### Runtime / architecture notes

- What improved:
  - The rendered recovery path now captures a bounded browser acquisition bundle: final DOM, normalized network-derived text, and blocker signals.
  - The shared extraction metrics contract now persists acquisition evidence kinds, blocker signals, rendered-network counts/bytes, and aggressive retry provenance.
  - `enrichCardPipeline` now performs one bounded aggressive browser acquisition retry when the first scrape remains weak or blocker-heavy, and it only replaces the first scrape when materially better.

- What is still not solved:
  - Residential IP reputation, authenticated sessions, and universal anti-bot bypass remain out of scope.
  - Some URLs still produce a thin fallback even after aggressive browser acquisition. The difference now is that the failure is explicit in diagnostics instead of being mistaken for a rich acquisition.
