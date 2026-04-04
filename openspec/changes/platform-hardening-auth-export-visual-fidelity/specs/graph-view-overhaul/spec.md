## Capability: graph-view-overhaul

3D Globe and 2D Plane graph views with toggle, GPU-accelerated rendering, mobile touch gestures, and multi-level cluster navigation from atomic nodes to abstract groups.

## Behavior

### View Modes (Toggle)

**3D Globe** — spatial exploration like a planet of knowledge:
- Nodes rendered on a sphere surface using `@react-three/fiber` with custom sphere geometry.
- Camera orbits around the globe via mouse drag / touch drag.
- Pinch-to-zoom on mobile.
- Clusters form visible continents — related cards group geographically.
- Click a node → zoom into region → detail panel slides in.
- Double-click → open card detail modal.

**2D Plane** — flat precision targeting:
- Nodes on a flat canvas with GPU-accelerated rendering (pixi.js or regl for WebGL, canvas 2D as fallback).
- D3-force simulation for layout (same physics as current, but optimized).
- Pinch/scroll zoom with smooth transitions.
- Click-drag to pan.
- Tap a node → focus + highlight connections.
- Clusters visually bounded by convex hulls or soft color regions.

**Toggle**: Pill toggle at top of graph view — "Globe" | "Plane" — persisted to `localStorage` (`byoa-graph-mode`).

### Multi-Level Navigation (Atomic → Abstract)

The graph supports three zoom levels that transition smoothly:

| Level | What You See | Interaction |
|-------|-------------|-------------|
| **Overview** | Clusters as colored blobs with label + card count | Tap cluster → zoom to Group |
| **Group** | Individual nodes within a cluster, connections visible | Tap node → focus + detail panel |
| **Atomic** | Single node focused, all connections highlighted | Double-tap → card detail modal |

**Cluster Detection**: Use Louvain community detection algorithm on the tag-sharing graph to identify clusters. Each cluster gets a label (most common tag) and a color (derived from the dominant card color in the cluster).

### Mobile-First Touch

| Gesture | Action |
|---------|--------|
| Single tap | Select node / cluster |
| Double tap | Open card detail |
| Drag | Pan (2D) / Orbit (3D) |
| Pinch | Zoom in/out |
| Two-finger rotate | Rotate globe (3D only) |
| Long press | Show tooltip with connections |

- Touch targets: minimum 44px hit area per node (inflate smaller nodes for touch).
- Inertia: drag/orbit continues with momentum after release.
- Snap-to-cluster: when zooming out past a threshold, snap to overview level.

### Performance Strategy

**Target**: 2,000+ nodes at 60fps on mobile Safari.

1. **Level-of-Detail (LOD)**: At overview zoom, render clusters as single circles (not individual nodes). Only render individual nodes when zoomed into a cluster.
2. **GPU Rendering**: Use WebGL via pixi.js (2D) or Three.js (3D). Canvas 2D as automatic fallback if WebGL unavailable.
3. **Spatial indexing**: Quadtree for 2D, octree for 3D — efficient hit testing and viewport culling.
4. **Dynamic import**: Both Three.js and pixi.js loaded only when graph page is visited.
5. **Web Workers**: Force simulation runs in a Web Worker to avoid blocking the main thread.
6. **Texture atlas**: Node images (if shown at atomic level) batched into a single texture atlas.
7. **Progressive rendering**: Show layout immediately with placeholder positions, then animate to final force-directed positions.

### Fallback Chain
1. WebGL 2.0 → Full GPU rendering (Three.js / pixi.js)
2. WebGL 1.0 → Reduced particle count, simpler shaders
3. Canvas 2D → Current react-force-graph-2d as fallback (improved with LOD)
4. List view → Dense sorted list (existing GraphListView)

### Data Flow

GraphQL query unchanged — same `graphData(spaceId, tag, minWeight)` returning nodes + links. All new rendering happens client-side.

Additional client-side processing:
1. Run Louvain community detection on link graph → assign `clusterId` to each node.
2. Compute cluster centroids and bounding regions.
3. Generate cluster labels (most frequent tag) and colors (dominant card color).
4. Build spatial index (quadtree/octree) for hit testing.

## Implementation Phases

This spec is the largest of the five features. Recommended sub-phases within the `feat/graph-view-overhaul` branch:

1. **Foundation** — Louvain clustering, spatial indexing, Web Worker force simulation. These are pure logic with unit tests.
2. **2D Plane** — pixi.js WebGL renderer replacing `react-force-graph-2d`. LOD system. This alone fixes the "Loading graph..." desktop issue.
3. **3D Globe** — Three.js sphere renderer with orbit controls. Toggle UI between Plane/Globe.
4. **Touch & Gestures** — Unified gesture handler, mobile pinch/zoom/tap, multi-level navigation.

Each phase is independently testable. Phase 2 alone is a massive improvement over current state.

## Files Changed

| File | Change |
|------|--------|
| `web/src/components/GraphClient/GraphClient.tsx` | Major rewrite — view mode toggle, LOD, cluster navigation |
| `web/src/components/GraphGlobe/GraphGlobe.tsx` | New — Three.js 3D globe renderer |
| `web/src/components/GraphPlane/GraphPlane.tsx` | New — WebGL 2D plane renderer |
| `web/src/lib/graph-clustering.ts` | New — Louvain community detection, cluster labeling |
| `web/src/lib/graph-spatial.ts` | New — Quadtree/octree spatial indexing |
| `web/src/workers/force-simulation.worker.ts` | New — Web Worker for d3-force |
| `web/src/hooks/useGraphGestures.ts` | New — unified touch/mouse gesture handler |
| `web/src/index.css` | Add graph-specific transition classes |
| `web/package.json` | Add three, @react-three/fiber, pixi.js |

## Dependencies

- `three@^0.170` (3D rendering)
- `@react-three/fiber@^8` (React bindings for Three.js)
- `@react-three/drei@^9` (Three.js helpers — OrbitControls, etc.)
- `pixi.js@^8` (WebGL 2D rendering for plane mode — note: v8 has a new API vs v7, use v8 `Application` and `Container` patterns)
- `comlink@^4` (Web Worker communication)

Note: Verify latest published versions at implementation time. Pin to whatever `npm info` returns as latest stable.

## Acceptance Criteria

- [ ] Graph loads within 3 seconds for 1,922 nodes on desktop.
- [ ] Graph loads within 5 seconds for 1,922 nodes on mobile Safari.
- [ ] 3D Globe renders with orbit controls and cluster grouping.
- [ ] 2D Plane renders with pinch-zoom and pan.
- [ ] Toggle between Globe/Plane preserves focused node and zoom level.
- [ ] Overview level shows clusters as labeled blobs.
- [ ] Tapping a cluster zooms into its nodes.
- [ ] Tapping a node shows detail panel with connections.
- [ ] Double-tap opens card detail modal.
- [ ] All touch gestures work on iPhone Safari.
- [ ] Force simulation runs in Web Worker (no main thread jank).
- [ ] Falls back to Canvas 2D if WebGL unavailable.
- [ ] Falls back to list view if canvas rendering fails.
- [ ] `prefers-reduced-motion`: disable animation transitions, instant snaps.
