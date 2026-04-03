## ADDED Requirements

### Requirement: Weak titles are replaced with the strongest source-aware candidate

The enrichment pipeline SHALL avoid persisting weak placeholders when the source material or derived analysis provides a stronger descriptive title.

#### Scenario: Untitled saves are upgraded during enrichment
- **WHEN** a card reaches enrichment with a weak or generic title such as `Untitled`, `Saved item`, or a bare URL
- **THEN** the pipeline MUST rank candidate titles from scraped content, local AI, DSPy, classification, and heuristics, and persist the strongest non-generic candidate unless the user already edited the title

#### Scenario: Explicit titles are preserved when already strong
- **WHEN** a platform already has a strong explicit title or the user manually edited the title
- **THEN** enrichment MUST avoid overwriting that title with a weaker inferred alternative

### Requirement: Title selection is inspectable

The system SHALL persist enough diagnostics for operators to understand why a title was chosen.

#### Scenario: Title diagnostics capture the winning candidate
- **WHEN** enrichment evaluates multiple candidate titles
- **THEN** metadata MUST record the selected title source and a ranked subset of the considered candidates
