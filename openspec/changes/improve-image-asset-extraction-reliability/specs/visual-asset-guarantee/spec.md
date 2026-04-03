## ADDED Requirements

### Requirement: Scraped links persist a usable visual asset
The system SHALL persist a usable visual asset for scraped links whenever the source URL is remotely fetchable, preferring first-party media and falling back to a screenshot preview when direct media extraction fails.

#### Scenario: First-party image wins over screenshot fallback
- **WHEN** scraping returns a valid source image or media preview
- **THEN** the persisted card MUST keep that source asset and MUST NOT replace it with a screenshot fallback

#### Scenario: Missing source image promotes screenshot fallback
- **WHEN** scraping yields no direct image asset and the card also has no existing image
- **THEN** the persisted card MUST store a fallback preview asset instead of remaining visually empty

### Requirement: Visual fallback provenance is preserved
The system SHALL record the provenance of persisted preview assets so operators and the UI can distinguish source media from screenshot fallbacks.

#### Scenario: Fallback preview is stored with provenance
- **WHEN** a screenshot fallback is promoted as the saved preview
- **THEN** the card metadata MUST record the preview source and MUST preserve existing source-media metadata if present

#### Scenario: Existing image is retained during enrichment
- **WHEN** a card already has a primary image and a new scrape only supplies a screenshot fallback
- **THEN** the system MUST keep the existing image as primary while still allowing the fallback to be used for analysis only if explicitly selected
