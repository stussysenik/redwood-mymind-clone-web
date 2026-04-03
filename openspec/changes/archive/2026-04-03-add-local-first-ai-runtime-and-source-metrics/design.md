## Context

The repo already has three adjacent building blocks:

- a browser-side Transformers.js worker that runs a Gemma-family local classifier,
- a server enrichment pipeline that still prefers remote GLM/DSPy classification,
- a server embedding layer that already defaults to Gemini but only recognizes legacy Google key names.

That means the product is close to a local-first architecture, but not actually there. Local classification is currently best-effort decoration, not an authoritative fallback. Semantic retrieval still depends on remote embeddings. Extraction reliability is also only partly inspectable: preview provenance exists, but we do not record a uniform extracted text/media count on the general hot path. The user request is broader than “fix Instagram again”; it asks for an architecture that is honest about what is local, what is remote, and how much source material the pipeline actually captured. It also explicitly asks for an “80% successful” standard, which only becomes meaningful if the denominator is a compressed source-text snapshot rather than raw HTML bytes.

## Goals / Non-Goals

**Goals:**

- Make browser local AI classification reusable by the server save/enrichment pipeline.
- Wire the dedicated Gemini Embedding 2 key already present in local configuration into the embedding provider.
- Replace hard-coded local-model naming with a configurable Gemma-family runtime contract.
- Persist platform-agnostic extraction metrics in the shared scrape merge path, including captured source-payload bytes when available.
- Target at least `0.8` coverage of a compressed source-text snapshot on the general website path, using a slower recovery branch when static HTML extraction is weak.
- Replace weak generic titles with source-aware titles and keep title-selection diagnostics.
- Preserve native high-frequency shortcuts so `Cmd/Ctrl+A`, `Cmd/Ctrl+Enter`, and `Escape` behave intentionally in add/search flows.

**Non-Goals:**

- Build a fully offline third-party web scraper that bypasses CORS, login walls, or residential-IP restrictions.
- Replace pgvector storage with a second local vector backend in this change.
- Implement exact raw-source byte matching across every extractor today.
- Commit the product to a specific Gemma 4 ONNX package before a verified Transformers.js-compatible package is selected.

## Decisions

### Decision: Treat browser classification as a durable seed, not transient decoration

The save path will normalize browser local AI output into metadata that the enrichment pipeline can trust. If the local result is structurally valid, the system will reuse it before falling back to remote classification.

Alternative considered: Keep local AI as a UI-only hint and always reclassify remotely.
Why rejected: That defeats the local-first objective and still leaves local development unusable when remote AI is unavailable.

### Decision: Preserve the existing pgvector contract and improve Gemini provider discovery first

This change keeps the vector storage dimension at `1536` and improves the current Gemini embedding provider detection by recognizing `GEMINI_EMBEDDING_2_API_KEY` alongside the older Google key aliases.

Alternative considered: Introduce a second embedding backend for smaller local embedding models immediately.
Why rejected: The current schema and SQL functions are fixed to `vector(1536)`, so mixing dimensions would turn this into a database and retrieval migration instead of a focused reliability change.

### Decision: Make the browser runtime configurable by model metadata

The worker and UI will read local model identifiers and labels from one shared runtime configuration contract. The default can remain the currently verified model, while the code path becomes ready for Gemma-family swaps without scattered string edits.

Alternative considered: Hard-code a Gemma 4 string now.
Why rejected: A hard-coded label without a verified runtime package creates false operator confidence and makes diagnostics less trustworthy.

### Decision: Record extraction metrics in `buildScrapedCardUpdate`

The general merge layer already sees the final scraped text, media, and preview provenance. That makes it the right place to compute extracted text byte counts, deduplicated text coverage, and image counts once, rather than duplicating that logic across each scraper strategy. The scraper boundary will attach both raw source-payload bytes and compressed source-text bytes when it has direct access to raw HTML or API payloads.

Alternative considered: Emit metrics independently from each scraper implementation.
Why rejected: That would fragment the contract and leave generic website scrapes behind, which is the opposite of the requested architecture.

### Decision: Define the 80% target against compressed source text, not raw HTML bytes

The “80% successful” requirement is implemented as coverage of a compressed source-text snapshot that preserves the meaningful textual content of the source. Raw HTML bytes remain useful for diagnostics, but they are not an honest success denominator because markup, scripts, and chrome dominate many pages.

Alternative considered: Use raw payload bytes as the coverage denominator.
Why rejected: That would make even good extractions look artificially weak and would reward simplistic pages over richer pages.

### Decision: Recover weak static HTML with a slower rendered-browser path

When static HTML extraction is weak or blocked, the scraper will attempt a slower Playwright-backed rendered-page recovery path and prefer that result if it materially improves the text snapshot or title quality. This is the “cost of time” tradeoff requested by the user.

Alternative considered: Keep the current static fetch only and merely log weak coverage.
Why rejected: Observability alone does not improve success on JS-heavy or partially blocked pages.

### Decision: Rank titles instead of trusting the first non-empty string

The enrichment pipeline will assemble title candidates from scraped metadata, browser local AI, remote classification, DSPy title extraction, and heuristics, then rank them so weak placeholders lose to stronger descriptive titles. The selected source and top candidates will be persisted for operator diagnostics.

Alternative considered: Keep the current “classification title wins” rule and only patch obvious `Untitled` cases.
Why rejected: That still hides why a title was chosen and does not systematically preserve the strongest source-derived language.

### Decision: Do not hijack native select-all for modal shortcuts

The add flow keeps a global open shortcut, but it must avoid `Cmd/Ctrl+A` because that key is native editing behavior. The global opener moves to a non-conflicting shortcut and editable surfaces explicitly handle submit/close flows.

Alternative considered: Keep `Cmd/Ctrl+A` as a global opener and special-case individual fields.
Why rejected: Native selection behavior should remain reliable everywhere, not only in a handful of components.

## Risks / Trade-offs

- [Browser local classification may be less rich than remote GLM/DSPy output] → Mitigation: reuse it as a reliable fallback and seed, not as a permanent ban on later server-side refinement.
- [Operators may read extraction byte counts as full source-fidelity guarantees] → Mitigation: name the fields as extracted metrics, not fidelity scores, and document the non-goal explicitly.
- [Rendered recovery increases scrape latency and operational cost] → Mitigation: only trigger it when static extraction is weak or blocked, and persist recovery provenance.
- [Changing initial card fill rules can surface different titles or tags immediately after save] → Mitigation: only use local AI to fill missing fields and preserve explicit user input.
- [Title ranking can choose a different title than earlier saves] → Mitigation: skip title rewrites after manual edits and persist `titleDiagnostics` so the choice is inspectable.
- [Future Gemma-family model swaps may still need prompt/runtime tuning] → Mitigation: centralize model configuration and runtime metadata now so future changes are isolated.

## Migration Plan

1. Add OpenSpec artifacts and implement the local-first/runtime changes behind existing save and enrichment flows.
2. Verify that Gemini embedding detection works with `GEMINI_EMBEDDING_2_API_KEY` alone.
3. Add extraction metrics in the shared merge path and update tests/diagnostics.
4. Add the slower rendered recovery branch for weak static scrapes.
5. Add source-aware title selection and shortcut fixes.
6. Validate the browser local-AI UI labels, local fallback behavior, shortcut behavior, and live source-text metrics.
7. Deploy normally; rollback is a code revert because no schema migration is required.

## Open Questions

- Whether a separate local embedding backend should be introduced later for true offline semantic search, given the current `vector(1536)` schema contract.
- Which verified Gemma-family ONNX package should become the default once Gemma 4 browser support is concretely validated for this stack.
- Whether extraction metrics should later expand into raw-source checksums or hard blocking policies once the repo has a uniform raw-response capture layer.
- Whether LangChain/LangSmith orchestration should be added later on top of the current DSPy-backed title pipeline once those dependencies are introduced intentionally rather than implicitly.
