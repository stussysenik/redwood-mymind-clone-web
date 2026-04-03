## ADDED Requirements

### Requirement: Collection surfaces support persistent grid and list browsing

The system SHALL let users switch supported collection surfaces between grid and list views while preserving the same card dataset and selection behavior.

#### Scenario: Library and search surfaces expose a list alternative

- **WHEN** a user is browsing the main library or a search result set
- **THEN** the UI MUST provide both grid and list views for the same cards

#### Scenario: Space detail preserves a retraceable list mode

- **WHEN** a user opens a space detail page
- **THEN** the page MUST provide a list view optimized for scanning and retracing saved cards

### Requirement: Graph exploration has a non-canvas fallback/index

The system SHALL provide a graph-adjacent list/index view so graph exploration remains useful when canvas rendering fails or when graph structure is too sparse for the force view alone.

#### Scenario: Graph route remains explorable when renderer fails

- **WHEN** the force-directed renderer cannot load
- **THEN** the graph page MUST remain usable through a list/index view backed by the same graph data

#### Scenario: Sparse graph still exposes cards and relationships

- **WHEN** graph data includes nodes but few or no links
- **THEN** the graph page MUST still surface those cards instead of collapsing to a generic empty failure state
