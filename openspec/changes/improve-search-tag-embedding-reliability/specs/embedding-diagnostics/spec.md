## ADDED Requirements

### Requirement: Embedding provenance is recorded
The system SHALL record which provider, model, and vector dimension produced or was expected for each embedding operation.

#### Scenario: Embedding provenance is visible
- **WHEN** an embedding is generated or queried
- **THEN** the system MUST be able to report the provider, model, and dimension used

### Requirement: Embedding compatibility checks prevent silent mismatch
The system SHALL detect provider/model/dimension mismatches and report them as explicit diagnostics instead of silently producing unusable vectors.

#### Scenario: Vector dimension mismatch is reported
- **WHEN** the configured embedding dimension does not match the storage contract
- **THEN** the system MUST surface a compatibility failure reason

#### Scenario: Provider unavailable is explicit
- **WHEN** no embedding provider is configured or reachable
- **THEN** search and enrichment diagnostics MUST record the reason embeddings were skipped

### Requirement: Diagnostics support deployed verification
The system SHALL provide search and embedding diagnostics that can be used in deployed verification loops and exported to future observability tooling.

#### Scenario: Verification output includes skipped embedding reason
- **WHEN** a card is processed without embeddings
- **THEN** verification output MUST explain why embedding was skipped or failed

#### Scenario: Future orchestration can consume diagnostics
- **WHEN** diagnostics are emitted
- **THEN** they MUST be structured enough to feed future LangSmith, Elixir, or similar orchestration workflows without redesigning the retrieval contract
