## ADDED Requirements

### Requirement: Search behavior is verifiable with representative cases
The system SHALL define repeatable verification cases for exact, semantic, tag-only, and hybrid search behavior.

#### Scenario: Exact search case passes
- **WHEN** a representative exact query is tested
- **THEN** the expected card MUST be returned

#### Scenario: Semantic-only search case passes
- **WHEN** a representative conceptual query is tested
- **THEN** at least one semantically relevant card MUST be returned if embeddings are available

#### Scenario: Tag-only search case passes
- **WHEN** a query matches only normalized tags
- **THEN** the matching card MUST be returned and visible in the result set

### Requirement: Verification reports blind spots
The system SHALL record when search, tags, or embeddings are not fully verified so deploy regressions are visible rather than hidden.

#### Scenario: Missing embeddings are reported during validation
- **WHEN** verification runs on a card without embeddings
- **THEN** the report MUST call out the missing semantic path instead of treating the case as pass/fail ambiguity

#### Scenario: Residual gaps are surfaced
- **WHEN** verification completes
- **THEN** the report MUST note any residual blind spots or follow-up areas
