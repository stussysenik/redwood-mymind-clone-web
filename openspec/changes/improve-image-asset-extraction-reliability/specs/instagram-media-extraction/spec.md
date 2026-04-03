## ADDED Requirements

### Requirement: Instagram targets preserve media kind during extraction
The system SHALL normalize Instagram URLs from canonical, mobile, and supported share-link formats into a target that preserves both shortcode and media kind (`p`, `reel`, or `tv`) before running extraction strategies.

#### Scenario: Reel fallback uses reel canonical path
- **WHEN** an Instagram reel URL reaches fallback extraction after GraphQL fails
- **THEN** the system MUST probe reel-specific endpoints instead of rewriting the target as a photo post

#### Scenario: Share URL resolution preserves extractable target
- **WHEN** an Instagram share URL resolves to a canonical reel or post URL
- **THEN** the system MUST use the resolved canonical target for extraction and diagnostics

### Requirement: Instagram carousels return slide-level media metadata
The system SHALL return all extractable carousel slides and MUST include slide-level media type metadata so downstream consumers can distinguish image slides from video slides.

#### Scenario: Mixed carousel reports video positions
- **WHEN** an Instagram sidecar contains both image and video slides
- **THEN** the extracted result MUST include the full ordered preview list, `mediaTypes`, and `videoPositions`

#### Scenario: Video post preserves preview asset
- **WHEN** an Instagram reel or video post is extracted successfully
- **THEN** the result MUST include a displayable preview image and mark the media as video

### Requirement: Partial Instagram extraction is explicit
The system SHALL treat degraded Instagram results as partial and MUST record enough information to explain why extraction stopped at a partial result.

#### Scenario: Slide hint exceeds extracted media count
- **WHEN** the source URL includes an `img_index` that exceeds the extracted preview count
- **THEN** the result MUST be treated as partial and the diagnostic output MUST reflect the mismatch

#### Scenario: Known truncated provider result is not treated as complete
- **WHEN** a provider returns a suspiciously incomplete Instagram carousel result
- **THEN** the system MUST continue probing additional strategies before accepting the result as final
