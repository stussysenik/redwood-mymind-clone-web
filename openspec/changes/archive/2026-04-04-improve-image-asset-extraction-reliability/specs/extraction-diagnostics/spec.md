## ADDED Requirements

### Requirement: Extraction diagnostics capture resolution and strategy evidence
The system SHALL expose structured extraction diagnostics that include the normalized target, strategy outcomes, and the selected best result summary.

#### Scenario: Diagnostic output includes resolved Instagram target
- **WHEN** diagnostics are run for an Instagram URL
- **THEN** the output MUST include the original URL, resolved URL if different, target kind, shortcode, and slide hint if present

#### Scenario: Strategy failures remain inspectable
- **WHEN** one or more extraction strategies fail or return null
- **THEN** the diagnostic output MUST preserve per-strategy status, duration, and failure reason

### Requirement: Degraded results are visible in verification flows
The system SHALL make degraded extraction decisions inspectable so deploy verification can identify partial success instead of reporting empty cards as an unexplained failure.

#### Scenario: Partial best result is flagged
- **WHEN** the best available extraction result is still partial
- **THEN** diagnostics MUST indicate that the chosen result is partial and why it was accepted

#### Scenario: Verification can compare media completeness
- **WHEN** diagnostics finish for a URL
- **THEN** the output MUST summarize media count, video positions, and chosen preview source for the selected result
