# source-extraction-metrics Specification

## Purpose
TBD - created by archiving change add-local-first-ai-runtime-and-source-metrics. Update Purpose after archive.
## Requirements
### Requirement: Scraped saves record hot-path extraction metrics

The system SHALL persist consistent extraction metrics for scraped saves so operators can inspect what the hot path actually captured, not only which scraper branch ran.

#### Scenario: Merged scrape records extracted text and media counts
- **WHEN** enrichment merges scraped data into a card
- **THEN** the card metadata MUST record extracted text byte count, deduplicated extracted text coverage, compressed source-text bytes, extracted image count, and the preview source used for the saved visual

#### Scenario: Screenshot fallback remains distinguishable from source media
- **WHEN** the saved visual comes from a fallback screenshot instead of first-party media
- **THEN** the recorded extraction metrics MUST preserve that fallback provenance instead of collapsing it into a generic success state

#### Scenario: Source payload bytes are preserved when the scraper can measure them
- **WHEN** a scraper has access to raw HTML or API payload bytes
- **THEN** the shared metrics contract MUST persist those source payload bytes and the payload kind so operators can compare extracted text to captured source size

#### Scenario: Coverage target is explicit
- **WHEN** extracted text and compressed source-text bytes are both available
- **THEN** the metrics contract MUST persist the configured coverage target and whether the current scrape met that target

#### Scenario: Browser acquisition diagnostics are persisted
- **WHEN** rendered-browser recovery captures additional evidence such as intercepted network text or blocker signals
- **THEN** the shared metrics contract MUST persist the evidence kinds, blocker signals, and rendered-network capture counts or bytes needed to inspect that acquisition

#### Scenario: Aggressive retry attempts remain inspectable
- **WHEN** enrichment runs an aggressive browser acquisition retry
- **THEN** the shared metrics contract MUST persist that the retry was attempted, why it ran, and whether the final saved scrape came from that escalation

### Requirement: Extraction metrics are centralized in the general merge path

The system SHALL compute extraction metrics in the shared scrape/enrichment merge path so the behavior applies to Instagram, Twitter/X, and generic website scraping instead of living in a single platform branch.

#### Scenario: Generic website scrape receives the same metrics contract
- **WHEN** a non-social website is scraped through the generic enrichment path
- **THEN** the resulting card metadata MUST use the same extraction metrics keys as platform-specific scrapes

#### Scenario: Weak static HTML triggers a slower recovery path
- **WHEN** static HTML scraping yields weak or blocked source text on a general website
- **THEN** the system MUST attempt a slower rendered-browser recovery path and prefer that result when it materially improves the extracted source text or title quality

#### Scenario: Aggressive enrichment recovery keeps the same metrics shape
- **WHEN** enrichment escalates a weak scrape into an aggressive browser acquisition pass
- **THEN** the resulting saved metrics MUST remain in the same shared extraction contract rather than using a separate debug-only structure
