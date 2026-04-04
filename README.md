# BYOA — Build Your Own Algorithm

A visual knowledge engine for saving, organizing, and rediscovering everything that inspires you. URLs, images, notes, tweets, videos — all searchable, all connected.

Built with [RedwoodJS](https://redwoodjs.com), Supabase, Prisma, and React.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Development](#development)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

## Features

- **Smart Save** — Paste any URL, image, or text. BYOA extracts metadata, screenshots, and dominant colors automatically.
- **AI Tagging** — Content is classified and tagged using an AI pipeline (GLM + embeddings).
- **Visual Feed** — Masonry grid with natural aspect-ratio images. Grid, list, and dense view modes.
- **Graph View** — Force-directed knowledge graph showing tag-based connections between cards.
- **Semantic Search** — Full-text + vector search powered by Pinecone and Prisma.
- **Spaces** — Organize cards into collections with smart filters.
- **Archive & Trash** — Soft-delete lifecycle with search across all states.
- **Theme System** — Multiple theme packs and skins with typography picker.
- **Mobile-First** — Haptic feedback, bottom navigation, swipe gestures, responsive everything.
- **Platform Extractors** — Native support for Twitter/X, Instagram, YouTube, and general web content.

## Architecture

```
web/          React frontend (Vite + Tailwind)
api/          RedwoodJS API (GraphQL + Prisma)
e2e/          Playwright end-to-end tests
```

**Data layer:** Supabase (PostgreSQL) + Prisma ORM
**Search:** Prisma full-text + Pinecone vector embeddings
**AI:** Classification pipeline with GLM client
**Deploy:** Railway (Dockerfile + railway.toml)

## Getting Started

**Prerequisites:** Node.js 20.x, Yarn

```bash
# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Fill in Supabase, Pinecone, and AI keys

# Run database migrations
yarn rw prisma migrate dev

# Start development server
yarn rw dev
```

App opens at [http://localhost:8910](http://localhost:8910).

## Development

```bash
# Dev server
yarn rw dev

# Type check
yarn rw type-check

# Build
yarn rw build

# Storybook
yarn rw storybook

# Tests
yarn rw test

# Generate new component/page/cell
yarn rw generate cell MyComponent
```

## Deployment

BYOA deploys to Railway via Docker:

```bash
yarn rw build
yarn rw deploy
```

See `Dockerfile` and `railway.toml` for configuration.

## Project Structure

```
web/src/
  components/     50+ React components
    Card/           Smart card router (URL, image, note, tweet, etc.)
    CardsCell/      Paginated card grid with archive/unarchive
    SearchCell/     Search results with mode-aware filtering
    GraphClient/    Force-directed graph visualization
    AddModal/       Smart input for saving content
  pages/          Route-level pages (Home, Archive, Trash, Graph, Spaces, Settings)
  layouts/        AppLayout (header, bottom nav, FAB)
  lib/            Theme system, local AI, utilities
  hooks/          Custom React hooks

api/src/
  services/       Business logic (cards, search, spaces, enrichment)
  lib/
    scraper/        URL/content scrapers (Twitter, Instagram, YouTube)
    ai/             Classification pipeline, GLM client, prompts
    pinecone.ts     Vector database integration
  graphql/        SDL schema definitions
  db/             Prisma schema
```
