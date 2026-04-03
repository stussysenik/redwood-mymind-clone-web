## 1. Browser Acquisition Bundle

- [x] 1.1 Capture rendered HTML, normalized browser-network text, and blocker signals from a single rendered recovery session.
- [x] 1.2 Merge browser-network evidence into the generic scraper snapshot and only prefer recovery when it materially improves the acquisition.

## 2. Shared Metrics And Diagnostics

- [x] 2.1 Persist acquisition evidence kinds, blocker signals, rendered-network counts/bytes, and aggressive retry provenance in the shared extraction metrics contract.
- [x] 2.2 Extend the visual extraction diagnostics script to surface the new acquisition bundle fields clearly.

## 3. Enrichment Escalation

- [x] 3.1 Add a one-shot aggressive browser acquisition escalation in `enrichCardPipeline` for low-coverage or blocker-heavy first scrapes.
- [x] 3.2 Keep the escalation bounded and only replace the first scrape when the aggressive pass is materially better.

## 4. Verification

- [x] 4.1 Add focused regression coverage for blocker detection, browser acquisition text normalization, and the new extraction metrics fields.
- [x] 4.2 Run targeted verification and document the remaining limits around anti-bot blocking, authenticated sessions, and browser-only failures.
