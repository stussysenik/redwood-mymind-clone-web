## Context

The current retrieval experience is fragmented. Plain keyword search can work for exact terms, but it does not guarantee the fastest creative-brain experience. Embeddings exist, but they are not clearly surfaced as a robust primary search path with compatibility checks and provenance. Tags are also part of the retrieval contract, yet they are easy to lose during enrichment, which makes the UI feel inconsistent and undermines trust in search results.

This change is about retrieval reliability, not just relevance tuning. The system should answer three questions for every saved card: can I find it by words, can I find it by meaning, and can I trust the tags I see?

## Goals / Non-Goals

**Goals:**
- Make search hybrid by default, combining semantic, keyword, and tag signals.
- Keep tags normalized, persisted, and visible from enrichment through UI rendering.
- Add explicit embedding diagnostics for provider/model/dimension compatibility.
- Create a verification loop that can prove search quality in deployed environments.

**Non-Goals:**
- Rebuild the app around a new retrieval framework.
- Mandate LangChain, LangSmith, Elixir, or DSPy as hard dependencies for this change.
- Redesign the entire feed or graph UX as part of this spec.

## Decisions

### Decision: Hybrid retrieval is the default search model
Search should not require users to know whether the card is discoverable by title, body text, tag, or embedding. The retrieval layer should combine these signals and rank them together, while still allowing explicit tag filters.

Alternative considered: Keep keyword search primary and semantic retrieval only for "similar cards".
Why rejected: That leaves the product feeling brittle and slows discovery for non-exact queries.

### Decision: Tags are first-class persisted data, not decoration
Tags should be normalized once, stored once, and rendered consistently. Any enrichment stage that updates metadata must preserve or merge valid tags instead of silently dropping them.

Alternative considered: Recompute tags only on demand from the latest AI run.
Why rejected: It makes tags unstable and harder to verify after the fact.

### Decision: Embedding provenance must be observable
Every embedding operation should expose provider, model, dimension, and compatibility status. If the model changes or the vector store expects a different dimension, the failure should be explicit and searchable.

Alternative considered: Hide provider details behind a generic embedding service.
Why rejected: It makes failures harder to diagnose and prolongs deploy-only issues.

### Decision: Verification is part of the feature
The change should define a repeatable validation loop for search queries, tag visibility, and embedding health. Diagnostics should be usable by operators and automation, including future LangSmith or Elixir-based workflows, without requiring those systems today.

Alternative considered: Treat verification as an ad hoc operational concern.
Why rejected: That preserves the exact blind spot that has made search regressions hard to close.

## Risks / Trade-offs

- Hybrid ranking can hide bugs if the signal weights are opaque. Mitigation: log the contributing signals and keep the ranking explainable.
- Persisted tags can drift if normalization rules change. Mitigation: keep a single canonical normalization path and test it.
- Embedding compatibility checks may cause more “skipped” states in the short term. Mitigation: surface the skip reason instead of silently failing.
- Verification can become noisy if it is not tied to concrete user flows. Mitigation: limit the initial loop to representative queries and tag cases.

## Migration Plan

1. Add the OpenSpec change and define the retrieval/tag/embedding contract.
2. Implement the smallest code-path changes needed to make search hybrid and tags durable.
3. Add diagnostics for embedding provenance and compatibility.
4. Validate with representative live queries and tagged cards.
5. Expand observability hooks only after the core retrieval path is reliable.

Rollback strategy: revert the change if hybrid ranking or tag persistence creates regressions. The spec should remain backward compatible with keyword-only behavior while the implementation is tuned.
