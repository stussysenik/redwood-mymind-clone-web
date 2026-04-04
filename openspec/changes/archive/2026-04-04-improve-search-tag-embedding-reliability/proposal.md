## Why

Search is still behaving like three separate systems instead of one reliable retrieval loop: keyword search finds some obvious matches, semantic search is not consistently surfaced as the primary path, and tag-driven discovery can look broken when cards lose or hide their tags after enrichment. We need a single reliability change that makes the creative brain search feel fast, explainable, and verifiable in production.

## What Changes

- Introduce a hybrid retrieval contract that combines semantic similarity with keyword and tag matching, rather than treating embeddings as a separate side channel.
- Make tag persistence and visibility reliable end to end so tags are stored, normalized, and rendered consistently after enrichment and during search filtering.
- Add embedding diagnostics and compatibility checks so the system can explain when a provider, model, or vector dimension is unavailable or mismatched.
- Define verification expectations for live search, tag presence, and semantic fallback behavior so regressions are caught with evidence instead of guesswork.

## Capabilities

### New Capabilities
- `semantic-hybrid-search`: Blend semantic similarity with keyword and tag ranking for retrieval.
- `tag-persistence-visibility`: Keep tags normalized, persisted, and visible across enrichment, search, and UI surfaces.
- `embedding-diagnostics`: Report embedding provider/model/dimension provenance and compatibility failures.
- `search-verification-loop`: Require repeatable verification for search, tags, and embedding behavior.

### Modified Capabilities
- None.

## Impact

- Affected code areas are expected to include search services, enrichment metadata handling, embedding utilities, and search UI cells.
- Affected product behavior includes home search, tag filtering, similar-card retrieval, and any future orchestration/observability layers that consume diagnostics.
- This change does not require a rewrite to LangChain, LangSmith, Elixir, or DSPy, but it should leave clear extension points for those systems if they are adopted later.
