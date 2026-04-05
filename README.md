# BYOA — Build Your Own Algorithm

A visual knowledge engine for saving, organizing, and rediscovering everything that inspires you. Paste any URL, image, or text — BYOA auto-extracts metadata, generates AI tags, pulls dominant colors, and connects your content through a force-directed knowledge graph.

Built for creative professionals who think in images and need to rediscover things months later.

**Stack:** [RedwoodJS](https://redwoodjs.com) | React | GraphQL | Prisma | Supabase | Pinecone | Tailwind CSS

---

## Features

### Core

- **Smart Save** — Paste any URL and BYOA extracts the title, images, dominant colors, and metadata. Native extractors for Twitter/X, Instagram (with carousel compositing), YouTube, Reddit, Letterboxd, IMDb, Goodreads, Amazon, Spotify, TikTok, GitHub, Wikipedia, Mastodon, and StoryGraph.
- **AI Classification** — Every card is auto-tagged and classified into one of 10 types (article, image, note, product, book, video, audio, social, movie, website) via a GLM + DSPy + embeddings pipeline.
- **Semantic Search** — Hybrid search combining full-text keyword matching with Pinecone vector embeddings (1536-dim pgvector). Find content by meaning, not just words.
- **Card Lifecycle** — Default, Archive, Trash states with soft-delete timestamps. Bulk restore and permanent delete. Search works across all states.

### Visualization

- **Visual Feed** — Masonry grid preserving original aspect ratios. Three view modes: grid, list, and dense.
- **Knowledge Graph** — Force-directed graph reveals connections between cards through shared tags. Features focus mode, detail panel, list view with thumbnails and connection badges, viewport culling, Level of Detail rendering, and Web Worker physics simulation for smooth performance at 1000+ nodes.
- **Serendipity** — Shake-to-shuffle gesture (DeviceMotionEvent with iOS permission handling) for rediscovering forgotten content.

### Design System

- **9 Theme Skins** — BYOA (default), Brutalist, Glassmorphism, Muji, NASA, Neubrutalism, Nord, Retro Terminal, and more.
- **Typography Picker** — 3 font pairings (display + body) with self-hosted font files and CSS custom property system.
- **8 Accent Colors** — Riso Orange, Ocean Blue, Emerald, Violet, Pink, Amber, Sky, and Black with computed hover/surface variants.

### Mobile

- **Haptic Feedback** — Light, medium, heavy, and selection haptics on all interactions via Web Haptics API.
- **Native Gestures** — Shake-to-shuffle, swipe navigation, 44px touch targets throughout.
- **Bottom Navigation + FAB** — Mobile-first layout with floating add button and responsive modals.

### Resilience

- **6-Tier Image Fallback** — Primary image -> metadata images -> scraped image -> Microlink screenshot -> note rendering -> gradient placeholder with silent re-extraction trigger.
- **Zero Noise** — No error banners, no flashing loading states. Infrastructure is invisible — users only see their content.

---

## Architecture

```
byoa/
├── api/                        # GraphQL API (Node.js + Prisma)
│   ├── src/
│   │   ├── services/           # Card CRUD, search, enrichment, spaces
│   │   ├── graphql/            # SDL schema definitions
│   │   └── lib/
│   │       ├── ai/             # Classification, embeddings, DSPy, color extraction
│   │       ├── scraper/        # Platform-specific URL extractors + carousel compositing
│   │       ├── pinecone.ts     # Vector database integration
│   │       ├── semantic.ts     # Tag normalization
│   │       └── auth.ts         # Supabase auth adapter
│   └── db/
│       └── schema.prisma       # Card + Space models with pgvector
│
├── web/                        # React Frontend (Vite + Tailwind)
│   ├── src/
│   │   ├── pages/              # 13 route pages
│   │   ├── components/         # 50+ components (Cards, Cells, Graph, Modals)
│   │   ├── layouts/            # AppLayout (nav + FAB) and AuthLayout
│   │   ├── lib/
│   │   │   ├── theme/          # Theme provider + 9 skin definitions
│   │   │   ├── themes/         # Theme pack definitions + DaisyUI bridge
│   │   │   ├── local-ai/       # Hugging Face client-side inference
│   │   │   ├── haptics.ts      # Web Haptics API wrapper
│   │   │   ├── graph-worker.ts # Web Worker for D3 force simulation
│   │   │   ├── imageProxy.ts   # Image resolution + fallback chain
│   │   │   └── typography.ts   # Font pairing system
│   │   └── hooks/              # useShakeDetection, usePersistedViewMode, useSwipe
│   └── public/                 # Static assets + self-hosted fonts
│
└── mymind_enrichment/          # Elixir/Phoenix enrichment service (OTP-supervised)
```

### Data Flow

```
User interaction -> React component -> GraphQL mutation/query
  -> RedwoodJS resolver -> Service logic -> Prisma ORM
  -> PostgreSQL (Supabase) -> Response -> UI update
```

### Key Patterns

- **RedwoodJS Cells** — Loading, Empty, Error, and Success states co-located with GraphQL queries
- **Optimistic mutations** — `makeOptimisticCardAction` helper for instant UI feedback
- **Platform-specific renderers** — Lazy-loaded card components for each content type
- **Search broker** — Intelligent routing between full-text and semantic search based on query analysis

---

## Getting Started

### Prerequisites

- Node.js 20.x
- Yarn 4.6.0
- PostgreSQL (via [Supabase](https://supabase.com))
- Pinecone account (for vector search)

### Setup

```bash
# Clone
git clone https://github.com/stussysenik/redwood-mymind-clone-web.git
cd redwood-mymind-clone-web

# Install dependencies
yarn install

# Environment variables
cp .env.example .env
# Fill in Supabase, Pinecone, Sentry, PostHog credentials

# Generate Prisma client
yarn rw prisma generate

# Run database migrations
yarn rw prisma migrate dev

# Start development server
yarn rw dev
```

Web: `http://localhost:8913` | API: `http://localhost:8912`

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection (pooled) |
| `DIRECT_DATABASE_URL` | Yes | Supabase PostgreSQL direct connection |
| `REDWOOD_ENV_SUPABASE_URL` | Yes | Supabase project URL |
| `REDWOOD_ENV_SUPABASE_ANON_KEY` | Yes | Supabase public key |
| `PINECONE_API_KEY` | Yes | Pinecone vector DB key |
| `REDWOOD_ENV_SENTRY_DSN` | No | Sentry error tracking |
| `REDWOOD_ENV_POSTHOG_KEY` | No | PostHog analytics |

---

## Development

```bash
yarn rw dev              # Start dev server (web + api)
yarn rw build            # Production build
yarn rw type-check       # TypeScript verification
yarn rw test             # Unit tests (Vitest)
yarn rw storybook        # Component playground
yarn rw generate cell X  # Scaffold a new Cell
yarn rw generate page X  # Scaffold a new Page
yarn rw prisma studio    # Database browser
```

---

## Database

Two core models in PostgreSQL with pgvector extension:

**Card** — UUID, type (10 variants), title, content, URL, imageUrl, 1536-dim vector embedding, JSON metadata, string[] tags, createdAt, updatedAt, deletedAt, archivedAt. GIN indexes on tags and metadata.

**Space** — UUID, name, optional query filter, isSmart boolean for auto-collections.

---

## Deployment

BYOA deploys to [Railway](https://railway.app) via a multi-stage Docker build:

```bash
# Railway auto-deploys on push to main
git push origin main
```

The Dockerfile uses Node 22-slim, builds both API and Web with `yarn rw build`, and serves via `rw-server`. Railway health checks hit `/` with auto-restart on failure (max 3 retries).

See [`Dockerfile`](Dockerfile) and [`railway.toml`](railway.toml) for configuration.

---

## Testing

```bash
yarn rw test                    # Unit tests (Vitest)
npx playwright test             # E2E tests
npx playwright test --project mobile-safari  # Mobile-specific
```

Playwright E2E covers mobile Safari/Chrome and desktop Safari/Chrome with graph performance benchmarks (FPS, TTI, view switching).

---

## Documentation

| Document | Description |
|---|---|
| [VISION.md](VISION.md) | Design philosophy, pillars, target user, and north star metrics |
| [TECHSTACK.md](TECHSTACK.md) | Complete technology inventory with versions and architecture decisions |
| [ROADMAP.md](ROADMAP.md) | Completed milestones (v0.1-v0.5) and planned features through v1.0 |

---

## License

Private project. All rights reserved.
