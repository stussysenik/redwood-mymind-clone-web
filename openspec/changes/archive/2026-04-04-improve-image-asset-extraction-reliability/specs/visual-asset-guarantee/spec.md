## ADDED Requirements

### Requirement: Scraped links persist a usable visual asset

The system SHALL persist a usable visual asset for scraped links whenever the source URL is remotely fetchable, preferring first-party media and falling back to a screenshot preview when direct media extraction fails.

#### Scenario: First-party image wins over screenshot fallback

- **WHEN** scraping returns a valid source image or media preview
- **THEN** the persisted card MUST keep that source asset and MUST NOT replace it with a screenshot fallback

#### Scenario: Missing source image promotes screenshot fallback

- **WHEN** scraping yields no direct image asset and the card also has no existing image
- **THEN** the persisted card MUST store a fallback preview asset instead of remaining visually empty

#### Scenario: Screenshot fallback waits for meaningful content

- **WHEN** the system generates a Microlink screenshot fallback for persistence or operator diagnostics
- **THEN** the generated fallback URL MUST request capture after page content has had time to load instead of snapshotting the earliest loading state

#### Scenario: Playwright fallback waits for meaningful content

- **WHEN** the system captures a screenshot fallback through Playwright
- **THEN** the capture flow MUST wait for visible text or media content before screenshotting, while still timing out safely if the page never becomes meaningful

### Requirement: Visual fallback provenance is preserved

The system SHALL record the provenance of persisted preview assets so operators and the UI can distinguish source media from screenshot fallbacks.

#### Scenario: Fallback preview is stored with provenance

- **WHEN** a screenshot fallback is promoted as the saved preview
- **THEN** the card metadata MUST record the preview source and MUST preserve existing source-media metadata if present

#### Scenario: Existing image is retained during enrichment

- **WHEN** a card already has a primary image and a new scrape only supplies a screenshot fallback
- **THEN** the system MUST keep the existing image as primary while still allowing the fallback to be used for analysis only if explicitly selected
