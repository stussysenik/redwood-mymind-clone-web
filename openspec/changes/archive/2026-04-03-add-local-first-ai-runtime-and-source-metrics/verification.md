## Verification

Verified on 2026-04-03 in the local workspace.

### Completed checks

- `openspec instructions apply --change "add-local-first-ai-runtime-and-source-metrics" --json`
  - Result: `12/12` tasks complete, state `all_done`.

- `yarn rw type-check api --prisma false --generate false 2>&1 | rg -n "scraper/(scraper|sourceText|renderedContent)|enrichment\\.ts|enrichment\\.test|titleOptimization|localClassification|embeddings" || true`
  - Result: no type errors reported for the API files changed by this change.

- `yarn rw type-check web --prisma false --generate false 2>&1 | rg -n "AddButton|AddModal|SearchBar|LocalAIToggle|SettingsPage|local-ai/(config|worker|prompt|context|types)" || true`
  - Result: no type errors reported for the web files changed by this change.

- `npx -y react-doctor@latest . --verbose --diff`
  - Result: React Doctor reported no issues in scanned changed files.
  - Limitation: lint-backed checks were incomplete because the repo oxlint configuration references a missing `jsx_a11y` rule: `no-noninteractive-element-interactions`.

- `yarn rw exec diagnoseVisualExtraction -- https://example.com`
  - Result: emitted live scrape metrics with `sourcePayloadBytes: 528`, `sourceTextBytes: 258`, `sourceTextKind: "compressed-visible-html"`, and `sourceTextCoverageTarget: 0.8`.

- `yarn rw exec diagnoseVisualExtraction -- https://www.linkedin.com/company/openai/`
  - Result: emitted live scrape metrics with `sourcePayloadBytes: 360361`, `sourceTextBytes: 6044`, `sourceTextKind: "compressed-visible-html"`, and `sourceTextCoverageTarget: 0.8`.

- `npx -y tsx --tsconfig api/tsconfig.json -e "import { extractRenderedPageContent } ..."`
  - Result: command exited `0`, which is consistent with the new rendered recovery module loading and returning without crashing.
  - Limitation: structured stdout from this probe did not surface reliably in the local exec environment, so the direct rendered-path assertion remains weaker than the compile-time verification.

### Repo-wide verification noise outside this change

- `yarn rw type-check api --prisma false --generate false`
  - Still fails in pre-existing areas including:
    - `api/src/functions/graphql.ts`
    - `api/src/lib/ai/classificationPipeline.test.ts`
    - `api/src/lib/ai/classificationPipeline.ts`
    - `api/src/lib/ai/vectorStore.ts`
    - `api/src/lib/pinecone.ts`
    - `api/src/lib/scraper/browserFactory.ts`
    - `api/src/lib/scraper/screenshotPlaywright.ts`
    - `api/src/services/search/search.ts`

- `yarn rw type-check web --prisma false --generate false`
  - Still fails in pre-existing areas including:
    - `.storybook/main.ts`
    - `web/src/components/CardsCell/CardsCell.tsx`
    - `web/src/components/GraphClient/GraphClient.tsx`
    - `web/src/components/SearchCell/SearchCell.tsx`
    - `web/src/components/SpaceCell/SpaceCell.tsx`

- `yarn jest api/src/lib/ai/titleOptimization.test.ts api/src/lib/ai/localClassification.test.ts api/src/lib/ai/embeddings.test.ts api/src/services/enrichment/enrichment.test.ts --runInBand`
  - Failed before test execution in Redwood Jest global setup.
  - Blocking issue: Prisma test DB reset failed with `P3016`, caused by `P1010`, against `.redwood/test.db`.

### Runtime / architecture notes

- Local env verification:
  - `.env.local` contains `GEMINI_EMBEDDING_2_API_KEY`, so the new Gemini alias path is exercised by local configuration without requiring legacy Google key names.

- Gemma runtime contract:
  - Browser local-AI defaults now point at `google/gemma-4-E2B-it` with a centralized `Gemma 4` label.
  - End-to-end browser inference was not smoke-tested in this verification pass, so actual runtime success still depends on the installed `@huggingface/transformers` build and browser WebGPU/WASM support.

- Scraper reliability:
  - The Instagram hot path is improved and remains API-first (`graphql` / mirror / embed-html / og-tags), and the shared enrichment merge path now records metrics for Instagram, Twitter/X, and generic websites.
  - Weak or blocked static HTML on the general website path now triggers a slower rendered-browser recovery attempt, and recovered results persist recovery provenance.
  - This change does **not** solve authenticated scraping, residential-IP reputation, or a universal anti-bot bypass layer.
  - CORS is not the main blocker on the server-side scrape path; upstream blocking and source accessibility still are.

- Source-fidelity observability:
  - The hot path now records extracted text bytes, deduplicated text totals, compressed source-text bytes, source payload bytes when measurable, payload kind, image counts, preview provenance, the configured `0.8` source-text coverage target, and whether that target was met.
  - The new `0.8` target is defined against compressed source text, not raw HTML bytes.
  - This is still not a raw-source checksum guarantee. Exact source-byte matching and universal anti-bot recovery remain out of scope.

- “99.9% local” limits:
  - Save-time classification can now stay useful without remote GLM/DSPy because browser local classification is durable.
  - Semantic retrieval still depends on remote embeddings because pgvector storage remains fixed to the existing remote-compatible embedding contract.
