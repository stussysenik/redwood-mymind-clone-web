## ADDED Requirements

### Requirement: Browser recovery captures a richer acquisition bundle

The system SHALL capture richer evidence during rendered recovery so client-rendered pages and partially blocked pages can contribute source text beyond the final DOM alone.

#### Scenario: Rendered recovery captures DOM and network text evidence
- **WHEN** the scraper enters rendered-browser recovery for a URL
- **THEN** the recovery bundle MUST capture the final rendered HTML and a normalized text snapshot derived from meaningful intercepted JSON or text responses from that browser session

#### Scenario: Blocker shells are surfaced explicitly
- **WHEN** the acquired page snapshot contains login-wall, signup-wall, consent-wall, JavaScript-shell, or app-interstitial signals
- **THEN** the recovery bundle MUST report those blocker signals instead of collapsing the acquisition into a generic successful HTML scrape

### Requirement: Enrichment escalates weak acquisitions once

The enrichment pipeline SHALL perform one aggressive browser acquisition retry when the first scrape still looks weak after the normal hot-path recovery logic.

#### Scenario: Low-quality first scrape triggers aggressive browser acquisition
- **WHEN** the first scrape for a URL still reports blocker signals, weak fallback title quality, or extraction metrics below the configured source-text coverage target
- **THEN** enrichment MUST run one aggressive browser acquisition pass before continuing classification

#### Scenario: Aggressive acquisition only replaces the first scrape when better
- **WHEN** the aggressive browser acquisition returns weaker or equivalent source evidence than the first scrape
- **THEN** enrichment MUST preserve the stronger earlier scrape instead of overwriting it blindly
