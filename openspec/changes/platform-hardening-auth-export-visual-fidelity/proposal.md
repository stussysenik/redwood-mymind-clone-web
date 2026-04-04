## Why

BYOA is daily-driven but still has the bones of a prototype: email/password auth with no phishing resistance, no data export, a bookmarks-app visual feel instead of a visual-research-platform feel, a graph view that chokes at scale, and a shuffle mode that hides the algorithm. These five changes harden the platform into something you'd trust with your creative corpus long-term — secure, portable, beautiful, and explorable.

## What Changes

- Replace email/password as the primary auth flow with WebAuthn passkeys (FIDO2), keeping email/password as a recovery path.
- Implement a true Fisher-Yates shuffle with a 1:1 visual swap animation so the user sees the algorithm working on their cards.
- Add a modular data export builder that produces a self-contained zip archive (structured data + media assets), matching the mymind export pattern.
- Introduce a typography system with 3 curated font pairings selectable in settings, and upgrade card rendering to preserve original aspect ratios (Are.na philosophy).
- Overhaul the graph view with a 3D Globe / 2D Plane toggle, WebGPU/WASM acceleration, and mobile-first touch navigation for cluster-level exploration.

## Capabilities

### New Capabilities
- `passkey-auth`: WebAuthn passkey registration, authentication, and credential management with email/password recovery fallback.
- `fisher-yates-shuffle`: True Fisher-Yates shuffle with per-swap card position animation in the masonry grid.
- `data-export-builder`: Server-side export endpoint with category toggles (Core, Content, Media, Metadata), multiple formats (CSV, JSON, JSONL, Markdown), and bundled media assets in a zip archive.
- `typography-visual-fidelity`: CSS custom property font system with 3 curated pairings, settings UI, and original-aspect-ratio card image rendering.
- `graph-view-overhaul`: 3D Globe and 2D Plane graph views with toggle, GPU-accelerated rendering, mobile touch gestures, and multi-level cluster navigation.

### Modified Capabilities
- None. Each feature is additive and isolated behind its own code paths.

## Impact

- **Auth**: New `credentials` Prisma model, new API function endpoints for WebAuthn ceremony, updated login/signup pages. Existing sessions remain valid.
- **Shuffle**: New animation logic in ShuffleModal/SerendipityClient. No backend changes.
- **Export**: New GraphQL mutation, new export service, new settings page section. No changes to existing card services.
- **Typography**: CSS variable additions, Google Fonts imports, settings page section. Card components updated for natural aspect ratio. No backend changes.
- **Graph**: GraphClient component rewrite with new rendering backend. GraphQL query unchanged. No backend changes.

## Isolation Guarantee

Each feature is implemented on its own git branch, behind its own code paths. No feature depends on another. Merging any subset produces a working application. The implementation order (Typography → Shuffle → Export → Auth → Graph) is a recommendation, not a dependency chain.
