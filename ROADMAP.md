# BYOA Roadmap

Development milestones for BYOA — Build Your Own Algorithm.

---

## Table of Contents

- [Completed](#completed)
  - [v0.1 — Foundation](#v01--foundation)
  - [v0.2 — Visual Identity](#v02--visual-identity)
  - [v0.3 — Mobile Native Feel](#v03--mobile-native-feel)
  - [v0.4 — Graph Intelligence](#v04--graph-intelligence)
  - [v0.5 — Image Resilience](#v05--image-resilience)
  - [v0.6 — Rendering Backends](#v06--rendering-backends)
- [In Progress](#in-progress)
  - [v0.7 — Dimensions & Clusters](#v07--dimensions--clusters)
- [Planned](#planned)
  - [v0.8 — Collaboration](#v08--collaboration)
  - [v0.9 — Advanced AI](#v09--advanced-ai)
  - [v1.0 — Platform](#v10--platform)
  - [v1.1 — Launch](#v11--launch)
- [Future Explorations](#future-explorations)

**Purpose** — Track the shape of BYOA over time. Each completed version is a known-good reference point. In-progress versions are the current surface area. Planned versions are commitments the team is willing to defend this quarter.

**How it works** — Versions are stable once they ship. New work lands under "In Progress" and moves to "Completed" only when it's live in `main` and verified. "Planned" is a soft queue — ordering can change, scope cannot grow without surfacing the change in this doc.

---

## Completed

### v0.1 — Foundation
> Core save-and-search loop

- [x] Card CRUD with Supabase + Prisma (PostgreSQL)
- [x] URL scraping with platform-specific extractors (Twitter/X, Instagram, YouTube, Reddit, generic)
- [x] AI classification pipeline (GLM + embeddings + DSPy)
- [x] Full-text + vector search (Prisma + Pinecone, 1536-dim pgvector)
- [x] Masonry grid feed with grid/list view modes
- [x] Supabase authentication (email/password)
- [x] Private routes with auth guards
- [x] Multi-save with parallel `promisePool` (concurrency 3)

### v0.2 — Visual Identity
> Theming, typography, and visual polish

- [x] Theme system with 9 skins (BYOA, Brutalist, Glassmorphism, Muji, NASA, Neubrutalism, Nord, Retro Terminal)
- [x] Typography picker — 3 font pairings (display + body) with self-hosted fonts
- [x] 3-role CSS custom property system (`--font-display`, `--font-body`, `--font-mono`)
- [x] Natural aspect-ratio card images (no cropping)
- [x] Accent color system — 8 colors with computed hover/surface variants
- [x] DaisyUI bridge for component theming
- [x] Dense list view as third view mode
- [x] Brand rebrand: Diamond icon, BYOA identity, `byoa_*` localStorage keys

### v0.3 — Mobile Native Feel
> Haptics, gestures, and touch-first interactions

- [x] Haptic feedback on all interactions (light/medium/heavy/selection via Web Haptics API)
- [x] Global shake-to-shuffle via `useShakeDetection` (DeviceMotionEvent + iOS permission handling)
- [x] 44px touch targets throughout the app
- [x] Bottom navigation + floating action button (FAB)
- [x] Shuffle modal with mobile-responsive progress bar
- [x] Swipe gestures via `useSwipe` hook

### v0.4 — Graph Intelligence
> Force-directed knowledge graph with performance optimization

- [x] Force-directed knowledge graph with type initials and color-coded nodes
- [x] Focus mode with detail panel showing card info + all connections
- [x] Graph list view with thumbnails, connection badges, and browsable metadata
- [x] Graph filter panel (filter by tag/type)
- [x] Viewport culling — hide off-screen nodes for rendering efficiency
- [x] Level of Detail — hide labels below zoom 1.0, initials below 0.5
- [x] Web Worker for D3 force simulation (off main thread)
- [x] Playwright performance benchmarks (FPS, TTI, view switch timing)

### v0.5 — Image Resilience
> Every card gets a visual, no matter what

- [x] 6-tier image fallback chain (primary -> meta images -> scraped -> Microlink screenshot -> note render -> gradient)
- [x] Silent `reExtractImage` mutation on gradient fallback (24-hour rate limit)
- [x] Instagram carousel composite via Sharp (multi-image grid)
- [x] Social URL screenshot support (removed platform blocks)
- [x] Platform-specific card renderers (Twitter, Instagram, YouTube, Movie, Reddit, Letterboxd, Goodreads, Amazon, StoryGraph)
- [x] Additional extractors: Letterboxd, IMDb, Goodreads, Amazon, Spotify, TikTok, GitHub, Wikipedia, Mastodon, StoryGraph

### v0.6 — Rendering Backends
> Pluggable graph renderer with three GPU-accelerated options

- [x] Renderer interface (`GraphRendererProps`) as a stable contract between `GraphClient` and any backend
- [x] WebGL backend — Pixi.js v8 GPU-batched sprite renderer with `d3-force` physics
- [x] Three.js backend — 3D graph with `d3-force-3d`, custom GLSL circle SDF shader, z-stratification by card type
- [x] Ortho-to-perspective tilt handle — one control, no orbit gizmo, no toolbar
- [x] Settings UI to pick between Canvas / WebGL / 3D, persisted via `UserPreferences.graphRenderer`
- [x] Lazy loading — each backend ships as its own chunk, fetched only when selected
- [x] Playwright E2E coverage for the picker + per-backend canvas smoke tests
- [x] Graph archive/delete mutations with in-place Apollo cache updates (no re-settle on mutation)
- [x] `setState`-in-render warning removed by moving `currentZoom` to a ref
- [x] `GraphFilterPanel` slider relabeled to "edges ≥ N" to end zoom-confusion

---

## In Progress

### v0.7 — Dimensions & Clusters
> Annotate and save groups of connected cards inside the 3D graph

- [ ] Long-press node → "select connected" flood-fill (N-hop neighborhood)
- [ ] Multi-select: tap more nodes to grow / shrink the selection, haptic per step
- [ ] Floating action: "Save as cluster" with name + note
- [ ] Cluster persistence — new `GraphCluster` entity (id, name, note, nodeIds, createdAt)
- [ ] Cluster list sheet — reopen any saved cluster, re-highlights its nodes in 3D
- [ ] In-graph annotations — anchor a short note to a node or a cluster, rendered as a billboard sprite in 3D
- [ ] Mobile-first interaction: radial menu on long-press, thumb-reach targets, 56px tap area
- [ ] Accessibility: keyboard equivalent (focus node → Space to add to selection → Enter to save)
- [ ] Image lazy loading with blur-hash placeholders
- [ ] Service Worker for offline card browsing
- [ ] Card swipe gestures (archive, delete, open)
- [ ] Core Web Vitals optimization (LCP, CLS, INP)

---

## Planned

### v0.8 — Collaboration
> Shared knowledge and public profiles

- [ ] Shared spaces with invite links
- [ ] Public card and space profiles
- [ ] Activity feed for shared spaces
- [ ] Collaborative tagging
- [ ] Shared clusters — invite others to curate a named subgraph

### v0.9 — Advanced AI
> Smarter search, auto-organization, and suggestions

- [ ] Smart collections (auto-grouped by visual similarity clustering)
- [ ] Auto-suggested clusters in 3D (Louvain / label propagation) rendered as ghosted hulls
- [ ] Content summarization on save
- [ ] Related card suggestions in detail view
- [ ] Natural language search ("show me all blue architecture photos from last month")
- [ ] Auto-generated space suggestions based on tag clusters

### v1.0 — Platform
> Extensions, imports, and ecosystem

- [ ] Browser extension for one-click save (Chrome, Firefox, Safari)
- [ ] iOS share sheet integration via PWA
- [ ] Import from Are.na, Raindrop, Pocket, Pinterest
- [ ] CSV/JSON export
- [ ] Public API for third-party integrations
- [ ] Webhook notifications on save

### v1.1 — Launch
> Production readiness and billing

- [ ] Onboarding flow with sample content
- [ ] Billing via Stripe (free tier + paid)
- [ ] Custom domains for public profiles
- [ ] Performance budget enforcement in CI
- [ ] Mobile Lighthouse > 90
- [ ] Comprehensive E2E test coverage
- [ ] Documentation site

---

## Future Explorations

Ideas under consideration, not yet scheduled:

- **Zig/WASM image processing** — Client-side color extraction and blur-hash generation at near-native speed
- **WebGPU graph rendering** — GPU-accelerated knowledge graph for 10,000+ node performance
- **Elixir enrichment service** — OTP-supervised pipeline for concurrent URL processing and real-time tag updates
- **Spatial audio** — Sonification of the knowledge graph for accessibility and ambient exploration
- **AR view** — View your knowledge graph in 3D space via WebXR
- **Time slider in 3D** — scrub backwards to see the graph as it grew
