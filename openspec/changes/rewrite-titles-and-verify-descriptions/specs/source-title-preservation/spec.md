## Capability: source-title-preservation

Extends the existing title-preservation capability to cover the ~82% of non-null titles that currently exceed five words, and gates every proposed write through a three-band confidence threshold so the pipeline can hand borderline cases to a human review surface instead of guessing.

## MODIFIED Requirements

### Requirement: Weak titles are replaced with the strongest source-aware candidate

The enrichment pipeline SHALL avoid persisting weak placeholders when the source material or derived analysis provides a stronger descriptive title. The definition of "weak" now includes any title whose word count exceeds five, in addition to null, `Untitled`, `Saved item`, and bare URLs.

#### Scenario: Untitled saves are upgraded during enrichment

Given a card reaches enrichment with a null title or a generic placeholder such as `Untitled`, `Saved item`, or a bare URL,
When the pipeline runs,
Then it MUST rank candidate titles from scraped content, DSPy generation, classification, and heuristics, and propose the strongest non-generic candidate for routing through the confidence gate, unless the user has already edited the title.

#### Scenario: Long titles are shortened during enrichment

Given a card has a title whose word count exceeds five words,
And the card has no `title_edited_at` tombstone,
When the pipeline runs,
Then it MUST generate a 3–5 word replacement via `TitleSignature` and route the proposal through the confidence gate before any write.

#### Scenario: User-edited titles are preserved absolutely

Given a card has a non-null `title_edited_at` tombstone,
When the pipeline runs over that card,
Then enrichment MUST skip the card entirely for title regeneration, regardless of the current title's word count, quality, or critic score.

## ADDED Requirements

### Requirement: Title proposals are routed through a three-band confidence gate

The pipeline SHALL gate every proposed title write behind a three-band confidence score produced by a chain-of-thought DSPy critic, rather than writing on generation alone. Thresholds are configurable via the `AUTO_APPLY_THRESHOLD` and `REVIEW_THRESHOLD` environment variables with defaults of 0.9 and 0.6.

#### Scenario: High-confidence proposals auto-apply

Given the critic returns a score at or above `AUTO_APPLY_THRESHOLD` (default 0.9) for a proposed title,
When the pipeline routes the decision,
Then the pipeline MUST write the proposed title to `cards.title` and persist the score to `cards.title_confidence` in the same transaction.

#### Scenario: Medium-confidence proposals queue for human review

Given the critic returns a score in the half-open interval `[REVIEW_THRESHOLD, AUTO_APPLY_THRESHOLD)` (default `[0.6, 0.9)`),
When the pipeline routes the decision,
Then the pipeline MUST insert a row into `EnrichmentReviewItem` with `kind='title'`, `proposedValue`, `currentValue`, `confidence`, and `critique`,
And the pipeline MUST NOT write to `cards.title`.

#### Scenario: Low-confidence proposals are dropped silently

Given the critic returns a score strictly below `REVIEW_THRESHOLD` (default 0.6),
When the pipeline routes the decision,
Then the pipeline MUST log the decision for diagnostics and take no further action on the card.

### Requirement: Title selection is inspectable end-to-end

The system SHALL persist enough diagnostics for operators and reviewers to understand why a title was chosen, queued, or dropped.

#### Scenario: Every decision is captured in batch logs

Given the pipeline evaluates a title on any card,
When the decision is routed,
Then the worker MUST emit a structured log line containing `card_id`, `word_count`, `proposed_title`, `score`, `gate_band`, and `action`.

#### Scenario: Auto-applied titles persist their confidence

Given a title auto-applies at `score >= AUTO_APPLY_THRESHOLD`,
When the write completes,
Then `cards.title_confidence` MUST equal the score that produced the write,
And subsequent sweeps MUST be able to sort the corpus by "least confident first" without re-invoking the critic.
