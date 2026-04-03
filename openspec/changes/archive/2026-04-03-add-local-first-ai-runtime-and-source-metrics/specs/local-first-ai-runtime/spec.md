## ADDED Requirements

### Requirement: Browser local AI seeds new cards

The system SHALL accept valid browser-produced local AI classification as a first-class input during card creation and use it to improve the initial saved card state.

#### Scenario: Local classification fills missing initial fields
- **WHEN** the client submits a valid local AI classification with a new card save
- **THEN** the server MUST persist the classification metadata and use it to fill missing title, type, and tags without overwriting explicit user input

#### Scenario: Local classification remains usable without remote AI
- **WHEN** enrichment runs for a card that already has valid local AI classification and remote classification is unavailable
- **THEN** the enrichment pipeline MUST reuse the local classification result instead of failing the classification stage

### Requirement: Browser local AI runtime is model-configurable

The browser local AI runtime SHALL expose the configured Gemma-family model identity so the UI and diagnostics describe the runtime truthfully.

#### Scenario: Settings show configured model label
- **WHEN** local AI is available in the browser
- **THEN** the settings UI MUST display the configured local model label rather than a hard-coded, stale model name

#### Scenario: Worker reports configured runtime identity
- **WHEN** the local AI worker initializes
- **THEN** the runtime MUST keep stable metadata for the configured generation model so future Gemma-family upgrades can be applied without changing every caller

### Requirement: High-frequency shortcuts remain intentional

The app SHALL preserve native editing shortcuts while keeping add/save flows fast in the add and search surfaces.

#### Scenario: Editable fields keep native select-all
- **WHEN** a user presses `Cmd/Ctrl+A` inside an editable add/search control
- **THEN** the app MUST not hijack that shortcut for unrelated global actions and MUST allow the control to select its own content

#### Scenario: Add flow supports fast submit and close
- **WHEN** the add modal is open and focus is inside its textarea
- **THEN** `Cmd/Ctrl+Enter` MUST submit the save flow and `Escape` MUST close the modal
