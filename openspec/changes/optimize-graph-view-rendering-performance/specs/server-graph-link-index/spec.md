## Capability: server-graph-link-index

Replaces the O(n²) nested-loop link builder in the `graphData` resolver with an inverted tag index, and adds an in-process LRU cache keyed on `(userId, spaceId, tag, minWeight)`.

## ADDED Requirements

### Requirement: Inverted tag index for link computation

The `graphData` resolver MUST build graph links by constructing an inverted index (tag → card IDs) and enumerating pairs per tag bucket, rather than comparing every card pair.

Complexity MUST be O(n·k + E) where n = card count, k = average tags per card, E = link count.

#### Scenario: 1000 cards, 5 avg tags — link computation under 10 ms

Given a user with 1000 active cards averaging 5 tags each,
When the `graphData` resolver is called with `minWeight: 1`,
Then link computation completes in under 10 ms (measured via `performance.now()` in the resolver).

#### Scenario: 2000 cards — link computation under 25 ms

Given a user with 2000 active cards averaging 5 tags each,
When the `graphData` resolver is called with `minWeight: 1`,
Then link computation completes in under 25 ms.

#### Scenario: Shared tag correctness preserved

Given cards A (tags: ["ai", "design"]), B (tags: ["ai", "ux"]), C (tags: ["design", "ux"]),
When `graphData` is resolved,
Then:
- Link A–B exists with sharedTags ["ai"] and weight 1
- Link A–C exists with sharedTags ["design"] and weight 1
- Link B–C exists with sharedTags ["ux"] and weight 1
- No duplicate links exist

### Requirement: In-process LRU cache for graphData results

The resolver MUST cache the fully-resolved `GraphData` result (nodes + links) per cache key `${userId}:${spaceId ?? ''}:${tag ?? ''}:${minWeight}` with:
- Maximum 50 entries
- TTL of 120 seconds
- Eviction of LRU entry when at capacity

#### Scenario: Repeated request within TTL returns cached result

Given the graphData resolver has been called once for a user,
When the same user calls graphData with identical parameters within 120 seconds,
Then the cached result is returned without re-querying the database or recomputing links.

#### Scenario: Cache miss after TTL

Given the graphData resolver cached a result 121 seconds ago,
When the same user calls graphData with identical parameters,
Then the resolver re-fetches from the database and recomputes links.

#### Scenario: Cache invalidated on card mutation

Given a user has a cached graphData result,
When a card is created, updated, or deleted for that user,
Then the cache entries for that userId are cleared.

#### Scenario: Cache size stays bounded

Given the cache has 50 entries (at capacity),
When a 51st unique cache key is resolved,
Then the least-recently-used entry is evicted and the new result is stored.
