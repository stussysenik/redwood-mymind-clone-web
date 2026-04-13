# Graph Renderer Backends — Design Spec

**Date:** 2026-04-13  
**Status:** Approved  
**Philosophy:** iA Writer restraint · Things precision · Notion composability

---

## Problem

The current graph view uses a Canvas 2D renderer (`react-force-graph-2d`). It works, but it cannot scale beyond ~1 000 visible nodes without stutter, offers no GPU acceleration, and gives us no path to a 3D spatial view. Users have no way to opt into a faster or richer rendering mode.

---

## Solution

Three renderer backends behind a DB-synced user preference. The preference lives in a new `user_preferences` table, is read at page load, and lazy-loads only the chosen engine. The Settings page exposes a single segmented control — nothing more.

---

## Architecture

```
UserPreferences (Postgres)
       ↕  GraphQL (query + mutation)
SettingsPage → GraphRendererPicker
       ↕  prop
GraphClient → lazy-imports CanvasRenderer | WebGLRenderer | ThreeRenderer
```

---

## Database

New `user_preferences` table, intentionally sparse — home for all future user preferences.

```prisma
model UserPreferences {
  userId        String   @id @map("user_id")
  graphRenderer String   @default("canvas") @map("graph_renderer")
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  @@map("user_preferences")
}
```

Row is upserted on first preference save. Default `"canvas"` means the table can be empty for existing users — they get the current behavior automatically.

---

## API

```graphql
type UserPreferences {
  userId: String!
  graphRenderer: String!
}

type Query {
  userPreferences: UserPreferences
}

type Mutation {
  updateUserPreferences(graphRenderer: String!): UserPreferences!
}
```

Service validates `graphRenderer` against the allowed set `['canvas', 'webgl', 'three']`. Returns the upserted row.

---

## Renderer Interface

```typescript
// src/lib/graph-renderer-types.ts
export type RendererBackend = 'canvas' | 'webgl' | 'three'

export interface GraphRendererProps {
  nodes: readonly GraphClientNode[]
  links: readonly GraphClientLink[]
  dimensions: { width: number; height: number }
  focusedNodeId: string | null
  minWeight: number
  darkMode: boolean
  onNodeClick: (id: string) => void
  onNodeHover: (node: GraphNode | null) => void
  onEngineStop: () => void
}
```

All three renderers implement `GraphRendererProps`. GraphClient lazy-imports the correct module — Three.js never ships to a Canvas user.

---

## Renderer Backends

### Canvas (default, stable)
- Current `react-force-graph-2d` code extracted into `CanvasGraphRenderer`
- Zero behavior change
- d3-force simulation, 2D canvas draw loop

### WebGL (beta)
- **Engine:** Pixi.js v8
- GPU-batched `Graphics` circles — handles 5 000+ nodes at 60 fps
- `BlurFilter` on hovered node for glow effect (no custom GLSL needed at this scale)
- Same d3-force simulation as Canvas — only the draw layer changes
- OrthographicCamera feel — flat, same layout as Canvas

### 3D (beta)
- **Engine:** Three.js r165
- Orthographic camera by default → identical layout feel to Canvas
- One rotation handle (bottom-right corner): drag to tilt to perspective, tap to reset
- Z-stratification by type: articles 0, notes +20, images −20, books +40
- Custom GLSL `ShaderMaterial` for nodes: circle SDF with signed-distance anti-aliasing + rim glow
- Line geometry for edges with depth-fading alpha in perspective mode
- No free-orbit by default — one affordance, one gesture (Things principle)

---

## Settings UI

`GraphRendererPicker` component mounted in `SettingsPage`:

```
Graph renderer
──────────────────────────────────
  [  Canvas  ·  WebGL  ·  3D  ]
     stable     beta     beta
```

- Segmented control, three segments
- Muted "stable" / "beta" sublabel per segment
- No descriptions, no marketing copy
- Saves on tap, optimistic update, rolls back on GraphQL error
- Persisted to DB — follows user across devices

---

## Interaction Constraints (3D mode)

The 3D renderer adds exactly **one** new affordance:

- A 32×32 circular handle, bottom-right corner of the graph canvas
- Drag → tilts graph into perspective (max 60° tilt)
- Tap → snaps back to orthographic (0° tilt, animated 300ms ease-out)
- No axis gizmo, no orbit control sphere, no camera reset button in toolbar

This is the Things principle applied to 3D: the affordance is discoverable, not instructed.

---

## Testing

- Chrome DevTools MCP: smoke test each backend — load, hover node, click node, no console errors
- Playwright E2E: settings toggle persists across navigation, each backend renders graph without errors

---

## Out of Scope

- Rust/WASM force simulation (future phase, when >5 000 nodes at 60 fps is required)
- WebGPU compute shaders (future phase)
- 3D → 2D synchronized camera animation (nice-to-have, deferred)
