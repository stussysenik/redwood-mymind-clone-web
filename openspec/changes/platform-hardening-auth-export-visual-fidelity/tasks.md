## Implementation Tasks

### Feature 1: Typography + Visual Fidelity
- [ ] Download and self-host font files for all 3 pairings (Playfair Display, Inter, JetBrains Mono, IBM Plex Sans, Fraunces, Source Sans 3)
- [ ] Add CSS custom properties for `--font-display`, `--font-body`, `--font-ui` and `[data-typography]` selectors
- [ ] Add typography scale variables (`--text-xs` through `--text-2xl`, line-height, letter-spacing)
- [ ] Update ThemeProvider to manage `data-typography` attribute
- [ ] Build typography picker UI in Settings → Appearance
- [ ] Migrate `--font-serif` → `--font-display` and `--font-sans` → `--font-body` across all CSS/components
- [ ] Remove old `--font-serif` / `--font-sans` declarations
- [ ] Remove `aspect-[1.618/1]` from Card.tsx, `aspect-video` from TwitterCard/RedditCard, fixed aspects from InstagramCard
- [ ] Add `width: 100%; height: auto; aspect-ratio: auto` to card images
- [ ] Keep intentional aspect ratios: YouTubeCard (16:9), poster cards (2:3), VideoPlayer
- [ ] Test masonry layout with variable-height images across breakpoints
- [ ] Verify font loading (only active pairing loaded, preload display font)

### Feature 2: Fisher-Yates Shuffle
- [ ] Implement `fisherYatesShuffle.ts` — pure algorithm with swap event emitter
- [ ] Implement `useShuffleAnimation.ts` — position snapshots, swap queue, CSS transition orchestration
- [ ] Add `.shuffle-swap` CSS transition class and highlight glow keyframe
- [ ] Integrate into ShuffleModal, CardGridClient, and SerendipityClient (re-shuffle existing set)
- [ ] Add speed control pills (Fast / Normal / Slow)
- [ ] Handle `prefers-reduced-motion` and large array cap (>50 cards)
- [ ] Unit test: verify uniform distribution of Fisher-Yates output

### Feature 3: Data Export Builder
- [ ] Create `api/src/graphql/export.sdl.ts` with ExportOptions input and ExportResult type
- [ ] Implement `api/src/services/export/export.ts` — main orchestrator
- [ ] Implement format serializers: CSV (mymind-compatible), JSON, JSONL, Markdown
- [ ] Implement media downloader — fetch images server-side, bundle into zip
- [ ] Add `archiver` dependency and zip generation logic
- [ ] Build ExportBuilder component — category toggles, format selector, scope filters
- [ ] Replace disabled export button in SettingsPage with ExportBuilder
- [ ] Add progress indicator and download link
- [ ] Test: export 1,922 cards with media, verify zip structure matches mymind format

### Feature 4: Passkey Auth
- [ ] Decide challenge storage for current deploy scale (in-memory Map vs Supabase table)
- [ ] Add `Credential` model to Prisma schema and run migration
- [ ] Install `@simplewebauthn/server` and `@simplewebauthn/browser`
- [ ] Create `api/src/functions/passkey.ts` with 4 WebAuthn endpoints
- [ ] Implement registration flow (challenge generation, attestation verification, credential storage)
- [ ] Implement authentication flow (challenge generation, assertion verification, session minting)
- [ ] Update LoginPage — passkey-first CTA, "Use email instead" secondary
- [ ] Add Security section to SettingsPage — passkey list, add/delete
- [ ] Test on iPhone Safari with Face ID
- [ ] Test email/password fallback still works

### Feature 5: Graph View Overhaul
- [ ] Implement Louvain community detection in `graph-clustering.ts`
- [ ] Implement spatial indexing (quadtree/octree) in `graph-spatial.ts`
- [ ] Build force simulation Web Worker
- [ ] Implement GraphPlane component (pixi.js WebGL 2D rendering)
- [ ] Implement GraphGlobe component (Three.js 3D rendering)
- [ ] Rewrite GraphClient with view mode toggle and LOD system
- [ ] Implement multi-level navigation (Overview → Group → Atomic)
- [ ] Implement unified touch gesture handler
- [ ] Add fallback chain (WebGL → Canvas 2D → List)
- [ ] Performance test: 2,000 nodes at 60fps on mobile Safari
- [ ] Test all touch gestures on iPhone

## Branch Strategy

Each feature implemented on its own branch:
- `feat/typography-visual-fidelity`
- `feat/fisher-yates-shuffle`
- `feat/data-export-builder`
- `feat/passkey-auth`
- `feat/graph-view-overhaul`

No cross-branch dependencies. Each independently mergeable to `main`.
