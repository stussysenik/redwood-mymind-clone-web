# BYOA Tech Stack

## Frontend

| Technology | Purpose | Version |
|---|---|---|
| React | UI framework | 18.x |
| RedwoodJS | Full-stack framework | 8.9 |
| Vite | Build tool / dev server | via Redwood |
| Tailwind CSS | Utility-first styling | 3.x |
| TypeScript | Type safety | 5.x |
| Lucide React | Icon system | latest |
| react-force-graph-2d | Force-directed graph canvas | latest |
| D3.js (d3-force) | Physics simulation for graph | latest |
| Playwright | End-to-end testing | latest |

## Backend

| Technology | Purpose | Version |
|---|---|---|
| RedwoodJS API | GraphQL API layer | 8.9 |
| Prisma | ORM / database client | via Redwood |
| GraphQL | API protocol | via Redwood |
| Sharp | Image processing / compositing | latest |
| Supabase | PostgreSQL + Auth + Storage | hosted |

## Infrastructure

| Technology | Purpose |
|---|---|
| Supabase | Database (PostgreSQL), authentication, file storage (card-media bucket) |
| Pinecone | Vector embeddings for semantic search |
| Railway | Container deployment (Dockerfile + railway.toml) |
| Microlink | Screenshot fallback API for URL previews |

## AI / ML

| Technology | Purpose |
|---|---|
| GLM Client | AI classification pipeline for auto-tagging |
| Embedding pipeline | Vector generation for semantic search |
| Classification pipeline | Content type detection + visual style classification |

## Key Frontend Libraries

| Library | Purpose |
|---|---|
| `src/lib/haptics.ts` | Web Haptics API wrapper (light/medium/heavy/selection feedback) |
| `src/hooks/useShakeDetection.ts` | DeviceMotionEvent shake gesture detection |
| `src/hooks/usePersistedViewMode.ts` | localStorage-persisted graph/list view toggle |
| `src/lib/imageProxy.ts` | Image URL resolution + Microlink screenshot fallback |
| `src/lib/graph.ts` | Graph data structures + tag-based connection builder |
| `src/lib/graph-worker.ts` | Web Worker for D3 force simulation off main thread |

## Key Backend Services

| Service | Purpose |
|---|---|
| `api/src/services/cards/cards.ts` | Card CRUD, search, shuffle, image re-extraction |
| `api/src/lib/scraper/` | URL scrapers (Twitter, Instagram, YouTube, generic) |
| `api/src/lib/scraper/compositeImage.ts` | Sharp-based image grid compositing for carousels |
| `api/src/lib/ai/` | Classification pipeline, GLM client, vector store |

## Testing

| Tool | Scope |
|---|---|
| Playwright | E2E tests (mobile Safari/Chrome, desktop Safari/Chrome) |
| Playwright POM | Page Object Model for graph performance benchmarks |
| Vitest | Unit tests (via Redwood) |
