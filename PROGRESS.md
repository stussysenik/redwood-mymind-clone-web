# BYOA Progress Log

## 2026-04-05 — Shake Toggle, Haptics, Graph Performance, Image Re-extraction

**Streams delivered:** 6 parallel streams, 9 tasks

### Stream 1: Global Shake Detection
- Created `useShakeDetection` hook with DeviceMotionEvent + iOS permission handling
- Wired into AppLayout — shake toggles shuffle modal globally
- Removed duplicate shake logic from ShuffleModal

### Stream 2: Shuffle Modal Mobile Responsive
- Replaced dot indicators with tappable progress bar
- Prev/next buttons go icon-only on small screens (44px touch targets)
- Modal insets tightened for iPhone SE (375px)
- Quick-pick buttons now wrap-safe
- Counter redesigned as prominent `index/total` display

### Stream 3: Haptics Balance
- Slider: debounced `selection` haptic every 80ms during drag
- Quick-pick buttons: `selection` haptic
- Draw cards button: `medium` haptic
- Reshuffle button: `medium` haptic
- Graph node focus: `light` haptic
- Graph node open (double-tap): `medium` haptic

### Stream 4: Image Re-extraction
**Frontend (Card.tsx, InstagramCard.tsx):**
- Expanded to 6-tier image fallback chain:
  1. Primary `imageUrl`
  2. `metadata.images[0]`
  3. `metadata.scrapedImageUrl`
  4. Microlink screenshot (now includes social URLs)
  5. Note card special rendering
  6. Gradient placeholder + silent re-extract trigger
- Removed social URL block from `getFallbackScreenshotUrl`
- InstagramCard triggers re-extract when all carousel images fail

**Backend (reExtractImage mutation):**
- Added `reExtractImage(cardId)` GraphQL mutation with `@requireAuth`
- Strategy 1: Instagram carousel composite via Sharp (1-4 images → grid)
- Strategy 2: Microlink screenshot fallback
- 24-hour rate limit per card
- Uploads composites to Supabase Storage `card-media` bucket

### Stream 5: Graph List View Redesign
- Added `imageUrl` to `GraphListNode` interface
- Thumbnail images with fallback to colored type-initial circles
- Type badge only shown when multiple types present
- Connection count badge per card
- Up to 4 connections shown per card with shared tags and weight
- Removed all per-card orphan messages
- Header shows dynamic stats ("X connected, Y unconnected")
- 2-column grid at `sm:` breakpoint

### Stream 6: Graph Performance
**Viewport culling + LOD (GraphClient.tsx):**
- Zoom tracking via `onZoom` callback
- Node culling: skip rendering when screen position is outside canvas + 60px padding
- Link culling: skip when both endpoints are offscreen + 20px padding
- LOD: hide labels below zoom 1.0, hide initials below zoom 0.5

**Web Worker (graph-worker.ts):**
- D3 force simulation running off main thread
- Posts intermediate tick positions every 10 iterations
- Mobile-aware charge strength, decay rate, and tick count
- Foundation for future custom rendering pipeline

**Playwright POM + Performance Tests:**
- `GraphPage` Page Object Model with FPS measurement, TTI, view switch timing
- 4 performance benchmark tests across all browser configurations
- Targets: TTI < 5s, FPS > 25, view switch < 2s

### Files Changed
| Type | Count |
|---|---|
| New files | 6 |
| Modified files | 10 |
| Lines added | ~435 |
| Lines removed | ~194 |

---

## 2026-04-04 — Spec + Plan for Shake, Haptics, Graph, Images
- Wrote design spec and implementation plan
- Identified 6 independent streams for parallel execution

## 2026-04-03 — Shared Card Mutations, Graph Constants, Cleanup
- Extracted shared `cardMutations` module
- Named graph layout constants
- General codebase cleanup

## 2026-04-02 — Graph TDZ Fix, Layout Collision, Lighthouse
- Fixed `graphData` temporal dead zone crash on Graph page
- Fixed graph layout collision with other elements
- README rebrand to BYOA
- Lighthouse performance optimizations

## 2026-04-01 — BYOA Rebrand + Archive Search Fix
- Rebranded from mymind-clone to BYOA with Diamond icon
- Fixed archive search functionality

## 2026-03-31 — Mobile UX Overhaul
- Haptics system (`src/lib/haptics.ts`)
- Pagination for card feeds
- Accent color system
- Shake gesture for shuffle (initial implementation)

## 2026-03-30 — Typography System
- Typography picker in Settings
- `font-display` / `font-body` migration across all components
- Natural aspect-ratio card images restored
