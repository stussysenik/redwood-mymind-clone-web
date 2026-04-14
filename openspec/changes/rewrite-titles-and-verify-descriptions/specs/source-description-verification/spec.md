## Capability: source-description-verification

Extends DSPy enrichment to cover `metadata.summary` (the description field) with the same generate-and-score pattern used for titles, gated by the same three-band confidence threshold. Protects user-edited descriptions absolutely and refuses to hallucinate descriptions for empty-source cards.

## ADDED Requirements

### Requirement: Missing descriptions are generated from source material

The pipeline SHALL generate a 1–2 sentence neutral description via `DescriptionSignature` for any card with a null or empty `metadata.summary`, unless the card has no usable source material.

#### Scenario: A card with content but no summary gets a proposal

Given a card has `metadata.summary` null or empty,
And the card has non-empty `content` or a reachable URL,
When the pipeline runs,
Then it MUST call `DescriptionSignature` to generate a 1–2 sentence description,
And route the proposal through the three-band confidence gate.

#### Scenario: An empty-source card is skipped, not hallucinated

Given a card has empty or whitespace-only `content`,
And no `metadata.summary`,
And no reachable URL,
When the pipeline runs over that card,
Then the pipeline MUST NOT call the description generator,
And the card MUST be logged as `insufficient_source` and skipped.

### Requirement: Existing descriptions are re-scored during sweeps

The pipeline SHALL periodically re-evaluate non-null descriptions via `DescriptionQualitySignature` and propose replacements when the current description falls below the review threshold.

#### Scenario: Stale descriptions are re-scored

Given a card has a non-null `metadata.summary`,
And `description_confidence` is either null or older than 30 days,
And the card has no `description_edited_at` tombstone,
When the pipeline runs,
Then it MUST score the existing description via `DescriptionQualitySignature`,
And if the score is at or above `AUTO_APPLY_THRESHOLD`, persist the score to `cards.description_confidence` without rewriting the summary,
And if the score is below `REVIEW_THRESHOLD`, generate a replacement and route through the gate.

#### Scenario: Mid-band rescore queues a review item

Given a card's existing description scores in `[REVIEW_THRESHOLD, AUTO_APPLY_THRESHOLD)`,
When the pipeline routes the decision,
Then the pipeline MUST insert an `EnrichmentReviewItem` with `kind='description'`, preserving both the current and proposed values for the diff view.

### Requirement: User-edited descriptions are preserved absolutely

The pipeline SHALL never overwrite a description that a user has edited, regardless of the critic score on the current or proposed value.

#### Scenario: A tombstoned description is skipped

Given a card has a non-null `description_edited_at` tombstone,
When the pipeline runs over that card,
Then enrichment MUST skip the card entirely for description regeneration.

#### Scenario: Accepting a review proposal sets the tombstone

Given a user resolves a description review item with `resolution='edit'` or `resolution='accept'` via the review surface,
When the API writes the value,
Then `cards.description_edited_at` MUST be set to the current timestamp,
And future pipeline sweeps MUST treat the card as user-edited.

### Requirement: Description proposals respect source fidelity

The generator SHALL NOT fabricate entities, claims, or facts absent from the source material.

#### Scenario: Generator output is constrained to source content

Given a card's `content` describes topic A,
When `DescriptionSignature` generates a proposal,
Then the proposal MUST reference only topics, entities, and claims present in the source text,
And MUST NOT introduce details not grounded in the source.
