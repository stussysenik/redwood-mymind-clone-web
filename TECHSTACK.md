# BYOA Tech Stack

Complete technology inventory for BYOA — Build Your Own Algorithm.

---

## Full-Stack Framework

| Technology | Version | Purpose |
|---|---|---|
| [RedwoodJS](https://redwoodjs.com) | 8.9.0 | Full-stack TypeScript framework (monorepo, routing, cells, codegen) |
| Node.js | 20.x (dev) / 22 (prod) | JavaScript runtime |
| Yarn | 4.6.0 | Package manager with workspaces |
| TypeScript | 5.x | Type safety across API and Web |

---

## Frontend

### Core

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI component framework |
| React DOM | 18.3.1 | DOM rendering |
| React Router DOM | 7.13.1 | Client-side routing (via RedwoodJS) |
| Vite | via RedwoodJS | Development server and production bundler |

### Styling

| Technology | Version | Purpose |
|---|---|---|
| Tailwind CSS | 3.4.17 | Utility-first CSS framework |
| DaisyUI | 5.5.19 | Tailwind component library with theme bridge |
| PostCSS | 8.5.8 | CSS processing pipeline |
| Autoprefixer | 10.4.27 | Vendor prefix automation |
| CSS Custom Properties | — | 3-role typography system + accent color engine |

### UI Components & Icons

| Technology | Version | Purpose |
|---|---|---|
| Lucide React | 0.577.0 | Primary icon system |
| Radix UI React Icons | 1.3.2 | Supplementary icon primitives |
| react-colorful | 5.6.1 | Color picker component |
| react-force-graph-2d | 1.29.1 | Force-directed graph canvas rendering |

### Graph & Visualization

| Technology | Version | Purpose |
|---|---|---|
| react-force-graph-2d | 1.29.1 | Canvas-based force graph rendering |
| D3.js (d3-force) | via graph-worker | Physics simulation engine |
| Web Worker | — | Off-main-thread D3 force simulation (`graph-worker.ts`) |
| Canvas API | — | Custom node rendering with type initials + LOD |

### Client-Side AI

| Technology | Version | Purpose |
|---|---|---|
| @huggingface/transformers | 4.0.0-next.7 | Local Gemma-4 inference for classification |

### Platform & Device

| Technology | Version | Purpose |
|---|---|---|
| web-haptics | 0.0.6 | Haptic feedback API (light/medium/heavy/selection) |
| DeviceMotionEvent | Web API | Shake-to-shuffle gesture detection |
| @supabase/supabase-js | 2.99.3 | Supabase Auth + Storage client |

### Analytics & Monitoring

| Technology | Version | Purpose |
|---|---|---|
| @sentry/react | 10.46.0 | Frontend error tracking and performance |
| posthog-js | 1.364.1 | Product analytics and event tracking |

### Data Processing

| Technology | Version | Purpose |
|---|---|---|
| PapaParse | 5.5.3 | CSV import/export parsing |

---

## Backend (API)

### Core

| Technology | Version | Purpose |
|---|---|---|
| @redwoodjs/api | 8.9.0 | API foundation and auth |
| @redwoodjs/graphql-server | 8.9.0 | GraphQL server with SDL-first schema |
| Prisma | via RedwoodJS | ORM and database client with type-safe queries |
| GraphQL | via RedwoodJS | API protocol between web and api sides |

### Database

| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | via Supabase | Primary database (managed) |
| pgvector | extension | 1536-dim vector embeddings for semantic search |
| GIN Indexes | PostgreSQL | Fast tag array and JSON metadata filtering |

### Search

| Technology | Version | Purpose |
|---|---|---|
| @pinecone-database/pinecone | 7.1.0 | Vector database for semantic search embeddings |
| Prisma full-text search | — | Keyword matching on titles and content |
| Search Broker | custom | Intelligent routing between keyword and semantic search |

### Content Extraction

| Technology | Version | Purpose |
|---|---|---|
| Cheerio | 1.2.0 | HTML parsing for URL scraping and metadata extraction |
| Sharp | via dependencies | Image processing, carousel compositing, resizing |

### AI Pipeline

| Technology | Purpose |
|---|---|
| GLM Client | External AI classification and tagging |
| DSPy Client | Title extraction, summarization, tag generation |
| Embeddings pipeline | 1536-dim vector generation for semantic indexing |
| Classification pipeline | Content type detection + visual style classification |
| Color Extraction | Dominant color palette from card images |

### Monitoring

| Technology | Version | Purpose |
|---|---|---|
| @sentry/node | 10.46.0 | Backend error tracking and performance monitoring |

---

## Infrastructure

| Service | Purpose |
|---|---|
| [Supabase](https://supabase.com) | PostgreSQL database, authentication (email/password), file storage (card-media bucket) |
| [Pinecone](https://pinecone.io) | Vector database for semantic search embeddings |
| [Railway](https://railway.app) | Container deployment (Dockerfile + railway.toml) |
| [Microlink](https://microlink.io) | Screenshot fallback API for URL previews |
| [Sentry](https://sentry.io) | Error tracking and performance monitoring (frontend + backend) |
| [PostHog](https://posthog.com) | Product analytics and user behavior tracking |

---

## Deployment

| Component | Detail |
|---|---|
| Container runtime | Docker (multi-stage, Node 22-slim) |
| Build command | `yarn rw build` (API + Web) |
| Serve command | `rw-server` via `docker-entrypoint.sh` |
| Health check | `GET /` |
| Restart policy | ON_FAILURE (max 3 retries) |
| Port | `${PORT:-8910}` (Railway-provided) |

---

## Testing

| Tool | Version | Scope |
|---|---|---|
| Playwright | 1.58.2 | E2E tests (mobile Safari/Chrome, desktop Safari/Chrome) |
| Playwright POM | — | Page Object Model for graph performance benchmarks |
| Vitest | via RedwoodJS | Unit tests |
| Storybook | 7.6.20 | Component documentation and visual testing |
| Chromatic | 16.0.0 | Visual regression testing |

---

## Development Tools

| Tool | Purpose |
|---|---|
| ESLint | Code linting (@redwoodjs/eslint-config) |
| Prettier | Code formatting with Tailwind CSS plugin |
| Redwood CLI | Scaffolding, migrations, code generation, dev server |
| Prisma CLI | Database migrations and studio |

---

## Custom Systems

### Theme Engine
9 theme skins with CSS variable bridge to DaisyUI. ThemeProvider wraps the app with dynamic class application. Computed accent colors with darkening and opacity variants.

### Typography System
3-role CSS custom property system (`--font-display`, `--font-body`, `--font-mono`) with 3 self-hosted font pairings. Typography picker in settings with localStorage persistence.

### Image Resilience
6-tier fallback chain: primary imageUrl -> metadata images -> scraped image URL -> Microlink screenshot -> note card rendering -> gradient placeholder with automatic silent re-extraction (24-hour rate limit).

### Graph Performance
Viewport culling hides off-screen nodes. Level of Detail: labels hidden below zoom 1.0, initials hidden below 0.5. D3 force simulation runs in a dedicated Web Worker off the main thread.

### Search Broker
Analyzes queries to route between full-text (keyword) and semantic (vector) search. Diagnostic tracking logs which search mode was used and why.

### Haptics System
Web Haptics API wrapper with four feedback levels mapped to interaction types: light (buttons), medium (card actions), heavy (destructive), selection (toggles).
