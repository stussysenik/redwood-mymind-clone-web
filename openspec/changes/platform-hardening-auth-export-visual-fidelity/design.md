## Context

BYOA is a visual research platform (Are.na philosophy, not bookmarks) built on RedwoodJS + Supabase + Prisma + pgvector. The user daily-drives it with ~1,922 cards. Current state:

- **Auth**: Supabase email/password only. Custom JWT decoder in `api/src/functions/graphql.ts`. No MFA, no passkeys.
- **Shuffle**: ShuffleModal and SerendipityClient exist with `randomCards` GraphQL query. Randomization happens server-side (`ORDER BY RANDOM()`). No client-side shuffle animation.
- **Export**: CSV import exists in AddModal (Papa Parse). No export functionality. Settings page has a disabled "Export All Data (Coming Soon)" button.
- **Typography**: Libre Baskerville (serif) + Inter (sans) loaded from Google Fonts. CSS vars `--font-serif` and `--font-sans`. No user-selectable font system. The new `--font-display`, `--font-body`, `--font-ui` variables will replace `--font-serif` and `--font-sans` — all existing usages of the old vars must be migrated.
- **Card rendering**: Fixed aspect ratios on images. CSS columns masonry. Not preserving original image dimensions.
- **Graph**: `react-force-graph-2d` (Canvas 2D, d3-force). Chokes on desktop with 1,922 nodes. Mobile interaction is unusable — dense blob, no cluster isolation.

## Goals / Non-Goals

**Goals:**
- Passkey-first auth that works with iCloud Keychain (Face ID sign-in).
- Fisher-Yates shuffle where each algorithmic swap is a visible card animation.
- Self-contained zip export with structured data + media assets, mymind-compatible format.
- Typography pairing system with settings toggle and original aspect ratio card rendering.
- Graph view that handles 2,000+ nodes with 3D/2D toggle and mobile touch navigation.

**Non-Goals:**
- Migrating away from Supabase (passkeys layer on top).
- Server-side rendering or SSR changes.
- Redesigning the card type system or enrichment pipeline.
- Real-time collaboration or sharing features.
- Building a custom WebGPU engine from scratch (use existing libraries that leverage GPU).

## Decisions

### Decision: SimpleWebAuthn over Supabase native passkeys
SimpleWebAuthn (`@simplewebauthn/server` + `@simplewebauthn/browser`) gives full control over the WebAuthn ceremony. Supabase's native passkey support is still beta with limited documentation.

Alternative considered: Clerk migration for built-in passkey support.
Why rejected: Rips out all existing auth, adds vendor lock-in, loses the Supabase RLS integration.

### Decision: CSS transforms for shuffle animation, not FLIP or Canvas
Each Fisher-Yates swap is animated by computing the (x, y) delta between two card positions and applying `transform: translate()` with the existing `--ease-spring` timing function.

Alternative considered: FLIP technique (First-Last-Invert-Play).
Why rejected: FLIP is better for layout transitions, not discrete swaps. CSS transforms are simpler and match the existing animation system.

### Decision: Server-side zip generation for export
The API generates the zip because it has direct access to image URLs (no CORS), can stream from S3/Supabase storage, and can handle large datasets without browser memory limits.

Alternative considered: Client-side JSZip.
Why rejected: CORS blocks many image sources. Browser memory limits at 1,900+ cards with media.

### Decision: CSS custom properties for typography, not Tailwind overrides
Three CSS variables (`--font-display`, `--font-body`, `--font-ui`) cascade through all components. Switching a pairing swaps three variables — zero component changes needed.

Alternative considered: Tailwind `font-*` class overrides per theme.
Why rejected: Requires touching every component's class list. CSS vars cascade automatically.

### Decision: react-three-fiber globe + pixi.js 2D plane with toggle
3D Globe uses `@react-three/fiber` (React bindings for Three.js) for spatial exploration. 2D Plane uses pixi.js v8 for WebGL-accelerated flat rendering with d3-force layout. User toggles between them.

Alternative considered: Single WebGPU custom renderer for both modes.
Why rejected: WebGPU browser support is still limited (no Firefox, Safari partial). Three.js + pixi.js cover all browsers and leverage GPU where available.

### Decision: Natural aspect ratio images via intrinsic sizing
Card images use `aspect-ratio: auto` with `width: 100%` and natural height. The masonry CSS columns layout already handles variable-height items via `break-inside: avoid`.

Alternative considered: Explicit aspect-ratio metadata from enrichment.
Why rejected: Adds complexity to the enrichment pipeline. The browser can determine intrinsic size from the image itself.

## Risks / Trade-offs

- **Passkeys**: Users without biometric devices can't use passkeys. Mitigation: email/password always available as fallback.
- **Shuffle animation**: With many cards visible, animating all swaps could feel slow. Mitigation: configurable speed, cap visible swaps, fast-forward option.
- **Export media bundling**: Large libraries (1,900+ images) produce large zips. Mitigation: progress indicator, chunked download, optional media exclusion via category toggle.
- **Typography fonts**: Google Fonts adds external requests. Mitigation: self-host font files in `/web/public/fonts/` for zero external dependencies.
- **Graph WebGL**: Three.js bundle size (~150KB gzipped). Mitigation: dynamic import, only loaded when graph page is visited. Canvas 2D fallback if WebGL unavailable.
- **Isolation risk**: Five features touching different parts of the codebase could create merge conflicts. Mitigation: each feature on its own branch, no shared code changes, explicit isolation guarantee in proposal.

## Migration Plan

1. Each feature gets its own git branch off `main`.
2. Implementation order: Typography → Shuffle → Export → Auth → Graph (recommended, not required).
3. Each branch is independently mergeable — CI must pass before merge.
4. No feature modifies another feature's files. Shared files (e.g., `index.css`, `SettingsPage`) use additive-only changes (new sections, new variables).
5. After all features merge, a single integration test pass confirms no cross-contamination.
