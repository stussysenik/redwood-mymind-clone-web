# Platform Hardening: Auth, Export, Visual Fidelity, Shuffle, Graph

**Date**: 2026-04-04
**Status**: Proposed
**OpenSpec Change**: `openspec/changes/platform-hardening-auth-export-visual-fidelity/`

## Summary

Five independent features to harden BYOA from a daily-driven prototype into a production visual research platform:

1. **Passkey Auth** — WebAuthn passkey-first authentication with Face ID on iPhone, email/password as recovery. SimpleWebAuthn on top of existing Supabase auth.

2. **Fisher-Yates Shuffle** — True Fisher-Yates algorithm with per-swap visual card animation. Each algorithmic swap maps 1:1 to a CSS transform swap in the masonry grid. Speed control (50ms/150ms/300ms per swap).

3. **Data Export Builder** — Server-side zip generation with category toggles (Core/Content/Media/Metadata), multiple formats (CSV/JSON/JSONL/Markdown), and bundled media assets. mymind-compatible zip structure.

4. **Typography + Visual Fidelity** — 3 curated font pairings (Editorial/Technical/Warm) selectable in settings via CSS custom properties. Plus: original aspect ratio image rendering across all card types (Are.na philosophy — visual research platform, not bookmarks).

5. **Graph View Overhaul** — 3D Globe (Three.js) and 2D Plane (pixi.js WebGL) with toggle. Louvain cluster detection, multi-level navigation (Overview → Group → Atomic), Web Worker force simulation, mobile touch gestures. Target: 2,000+ nodes at 60fps.

## Architecture Principles

- **Isolation**: Each feature on its own git branch, no cross-dependencies, independently mergeable.
- **Additive only**: Shared files (index.css, SettingsPage) receive new sections/variables, never modify existing ones.
- **Mobile-first**: Every feature designed for iPhone Safari first, progressive enhancement for desktop.
- **No new backend frameworks**: All features layer on existing Supabase + Prisma + RedwoodJS.
- **Performance budgets**: Graph <3s desktop / <5s mobile. Export <10min for full library. Font loading <100ms TTFB.

## Implementation Order (Recommended)

1. Typography + Visual Fidelity (immediate visual impact, touches CSS only)
2. Fisher-Yates Shuffle (fun, self-contained, frontend only)
3. Data Export Builder (backend + frontend, uses existing card data)
4. Passkey Auth (security layer, new Prisma model + API endpoints)
5. Graph View Overhaul (biggest lift, new dependencies, most research)

## Detailed Specs

See `openspec/changes/platform-hardening-auth-export-visual-fidelity/specs/` for per-feature specifications:

- `passkey-auth/spec.md` — WebAuthn flows, Credential model, API endpoints
- `fisher-yates-shuffle/spec.md` — Algorithm, animation sequence, speed control
- `data-export-builder/spec.md` — Category toggles, format serializers, zip structure
- `typography-visual-fidelity/spec.md` — Font pairings, CSS variables, aspect ratio changes
- `graph-view-overhaul/spec.md` — 3D/2D toggle, clustering, LOD, performance strategy
