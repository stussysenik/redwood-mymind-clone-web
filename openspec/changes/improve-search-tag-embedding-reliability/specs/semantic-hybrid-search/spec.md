## ADDED Requirements

### Requirement: Search combines semantic, keyword, and tag signals
The system SHALL rank search results using a hybrid retrieval model that considers semantic similarity, keyword/text matching, and tag overlap.

#### Scenario: Exact text match still works
- **WHEN** a user searches for a title fragment or exact phrase
- **THEN** matching cards MUST be returned even if embeddings are missing or stale

#### Scenario: Semantic match surfaces related cards
- **WHEN** a user searches with conceptual language that does not exactly appear in the title
- **THEN** cards with compatible embeddings MUST be eligible for ranking

#### Scenario: Tag matches remain first-class retrieval signals
- **WHEN** a query overlaps with normalized card tags
- **THEN** tag overlap MUST contribute to ranking and filter behavior

### Requirement: Hybrid retrieval stays explainable
The system SHALL expose enough ranking evidence to understand why a result was selected.

#### Scenario: Result ordering is inspectable
- **WHEN** a result is returned by hybrid search
- **THEN** the system MUST be able to describe whether it was promoted by semantic, keyword, or tag signal

#### Scenario: Embedding absence does not fail the whole search
- **WHEN** a card has no embedding or cannot be compared semantically
- **THEN** keyword and tag signals MUST still allow the card to be discovered where appropriate
