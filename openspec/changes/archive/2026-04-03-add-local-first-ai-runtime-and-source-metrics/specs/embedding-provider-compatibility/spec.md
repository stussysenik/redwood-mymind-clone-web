## ADDED Requirements

### Requirement: Gemini Embedding 2 configuration is recognized explicitly

The system SHALL recognize Gemini Embedding 2 configuration through the dedicated environment variables used by local and deployed operators, and SHALL surface that configuration through existing embedding diagnostics.

#### Scenario: Dedicated Gemini embedding key enables the provider
- **WHEN** `GEMINI_EMBEDDING_2_API_KEY` is configured and no legacy Google API key is present
- **THEN** the embedding provider MUST still report Gemini as configured and MUST allow embedding operations to proceed

#### Scenario: Embedding diagnostics reflect Gemini configuration
- **WHEN** embedding availability or compatibility is inspected
- **THEN** the diagnostics MUST report the effective Gemini provider, model, and dimension without requiring operators to infer that from fallback behavior
