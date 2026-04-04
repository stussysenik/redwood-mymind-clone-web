## ADDED Requirements

### Requirement: Tags are normalized before persistence
The system SHALL normalize tags using one canonical rule set before storing them on cards or using them in search filters.

#### Scenario: Hashtag prefixes are removed
- **WHEN** a tag enters the system with a leading `#`
- **THEN** the persisted value MUST be normalized without the prefix

#### Scenario: Duplicate and empty tags are dropped
- **WHEN** enrichment or user input produces duplicate or blank tags
- **THEN** only valid unique tags MUST be stored

### Requirement: Tags remain visible after enrichment
The system SHALL preserve valid tags through enrichment updates and MUST not clear them when unrelated metadata changes.

#### Scenario: Enrichment updates summary without clearing tags
- **WHEN** a card is enriched with new summary or embedding metadata
- **THEN** existing valid tags MUST remain attached to the card

#### Scenario: UI surfaces render the same tag set
- **WHEN** tags are shown in cards, detail views, or filters
- **THEN** the UI MUST reflect the persisted canonical tags rather than transient or partially normalized values
