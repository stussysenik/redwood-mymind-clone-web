# BYOA Roadmap

## Completed

### v0.1 — Foundation
- [x] Card CRUD with Supabase + Prisma
- [x] URL scraping (Twitter, Instagram, YouTube, generic)
- [x] AI classification pipeline
- [x] Full-text + vector search
- [x] Masonry grid feed with view modes

### v0.2 — Visual Identity
- [x] Theme system with multiple skins
- [x] Typography picker (display/body font pairs)
- [x] Natural aspect-ratio card images
- [x] Accent color system

### v0.3 — Mobile Native Feel
- [x] Haptics on all interactions (light/medium/heavy/selection)
- [x] Global shake-to-shuffle via `useShakeDetection`
- [x] 44px touch targets throughout
- [x] Bottom navigation + FAB
- [x] Shuffle modal with mobile-responsive progress bar

### v0.4 — Graph Intelligence
- [x] Force-directed knowledge graph with type initials
- [x] Focus mode with detail panel
- [x] Graph list view with thumbnails and connection metadata
- [x] Viewport culling + Level of Detail rendering
- [x] Web Worker for D3 force simulation
- [x] Playwright performance benchmarks (FPS, TTI, view switch)

### v0.5 — Image Resilience
- [x] 6-tier image fallback chain (primary → meta images → scraped → screenshot → note → gradient)
- [x] Silent `reExtractImage` mutation on gradient fallback
- [x] Instagram carousel composite via Sharp
- [x] Social URL screenshot support (removed Twitter/Instagram block)
- [x] 24-hour rate limit on re-extraction

## In Progress

### v0.6 — Performance + Polish
- [ ] Custom graph rendering pipeline (replace react-force-graph-2d with direct Canvas API)
- [ ] Image lazy loading with blur-hash placeholders
- [ ] Service Worker for offline card browsing
- [ ] Card swipe gestures (archive, delete, open)

## Planned

### v0.7 — Collaboration
- [ ] Shared spaces with invite links
- [ ] Public card/space profiles
- [ ] Activity feed for shared spaces

### v0.8 — Advanced AI
- [ ] Smart collections (auto-grouped by visual similarity)
- [ ] Content summarization on save
- [ ] Related card suggestions in detail view
- [ ] Natural language search ("show me all blue architecture photos from last month")

### v0.9 — Platform
- [ ] Browser extension for one-click save
- [ ] iOS share sheet integration (via PWA)
- [ ] Import from Are.na, Raindrop, Pocket, Pinterest
- [ ] API for third-party integrations

### v1.0 — Launch
- [ ] Onboarding flow
- [ ] Billing (Stripe)
- [ ] Custom domains for public profiles
- [ ] Performance budget enforcement in CI
