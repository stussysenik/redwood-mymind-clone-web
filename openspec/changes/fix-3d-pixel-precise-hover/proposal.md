## Why

The 3D graph's node picker (`web/src/components/ThreeGraphRenderer/ThreeGraphRenderer.tsx:446-462`, `pickNode`) uses Three.js's built-in `Raycaster` with `raycaster.params.Points.threshold = 12` (set at `ThreeGraphRenderer.tsx:208`). That threshold is a world-space radius, not a screen-space radius. Two concrete consequences:

1. **Ambiguous picks under tilt.** When the tilt handle takes the renderer from `OrthographicCamera` into `PerspectiveCamera` (`tilt >= 0.05` at `ThreeGraphRenderer.tsx:378`), 12 world units near the camera covers a larger area of screen than 12 world units at the back. Nodes at the back of the tilted scene are pickable only if the cursor is effectively *inside* the sphere, while nodes in the foreground steal hits from a much larger halo than the user sees on screen. The picker drifts relative to the visual.
2. **Dense cluster misfire.** In tight clusters (BYOA's book and article shelves in particular), two nodes can sit within 6–8 world units of each other. The 12-unit raycaster halo overlaps, and the ray-hit order is determined by `intersectObject`'s internal sort — which is camera-distance-based, not closeness-to-cursor. The "nearest to the cursor" and the "first hit returned" diverge, so hovering one node can pick its neighbor.

The root cause is that the picker lives in world space while the human interacting with it lives in screen space. Every usability feature we're about to build on top of 3D (pin, connect, annotate, long-press cluster) depends on the user being able to say "I mean *that* dot on my screen" — and today the renderer cannot reliably hear them.

Fix: stop raycasting into the point cloud and instead project every node's world position to screen-space pixels once per frame, then pick the nearest node inside its visual radius via a plain 2D Euclidean check. This is the same math the human eye is doing when they aim.

A second option — a GPU picking buffer (render node IDs to an offscreen framebuffer, `gl.readPixels` at the cursor) — is pixel-perfect regardless of geometry and is the long-term right answer above ~10k nodes. It is **out of scope** for this change. The 2D projection approach is ~50 LOC, zero GPU cost, and correctly tracks both ortho and perspective cameras. We revisit if profiling or node-count growth demands it.

## What Changes

### Changed — `pickNode` becomes a 2D projection hit test

- `ThreeGraphRenderer.tsx:446-462` — `pickNode(clientX, clientY)` is rewritten. The rewrite keeps the same signature (`clientX, clientY → string | null`) and the same call sites at lines `507`, `523`, `568`, so nothing else in the file changes.
- New per-frame projection: inside the existing `animate()` loop at `ThreeGraphRenderer.tsx:330-414`, after the node positions have been written to `posAttr` and the active camera has been updated, project every `simNode` world position to client-space pixels using `activeCam.project(vec3)` → NDC `(x, y)` → CSS pixels via the canvas's `getBoundingClientRect()`. Store the result in a `screenPositionsRef: { id: string; sx: number; sy: number; r: number }[]` that is refreshed every frame.
- `r` per node is the expected screen-space radius in CSS pixels of the point sprite — computed from the shader formula `gl_PointSize = uSize * 300 / -mvPosZ` divided by two (`gl_PointSize` is the sprite side length, not the radius). Under ortho, `mvPosZ` is approximately `ORBIT_R`, so `r ≈ uSize * 300 / ORBIT_R / 2`; under perspective it varies per node and must be computed per node.
- `pickNode` becomes: walk `screenPositionsRef.current`, compute `dx = clientX - sx; dy = clientY - sy; dsq = dx*dx + dy*dy`; return the `id` of the entry with the smallest `dsq` such that `dsq <= r * r`; otherwise `null`. O(N) per pick, which for our `N <= 3000` node budget is well under the 16 ms frame budget.

### Removed — raycaster picker

- `ThreeGraphRenderer.tsx:204-209` — delete the `raycaster`, `raycasterRef`, and `raycaster.params.Points = { threshold: 12 }` block. The `raycasterRef` field is removed from the ref object declaration. Nothing else reads it.
- `ThreeGraphRenderer.tsx:447-461` — delete the `rc.setFromCamera` / `rc.intersectObject` code path. It has no replacement; the 2D projection path stands alone.
- Search the file after the change: `grep "raycaster\|Raycaster\|threshold" ThreeGraphRenderer.tsx` must return zero matches.

### Added — a pure, testable hit-test helper

- New file `web/src/lib/graphHitTest.ts` exporting a single pure function:
  ```ts
  export function nearestNodeInRadius(
    screenPositions: Readonly<{ id: string; sx: number; sy: number; r: number }[]>,
    clientX: number,
    clientY: number,
  ): string | null
  ```
- `pickNode` calls this helper. The helper has no Three.js or DOM dependencies, so it can be unit-tested without a canvas.
- Placement under `web/src/lib/` matches the existing `web/src/lib/graph.ts`, `web/src/lib/haptics.ts`, and `web/src/lib/graph-renderer-types.ts` convention.

### Added — tie-break on equal distance

- When two nodes are exactly tied on `dsq` (degenerate but possible with overlapping billboards), the helper prefers the entry that is **later** in `screenPositions`. Because `simNodes` are rendered in array order and the point cloud's draw order is the same array order, the later entry is the one drawn on top. "Picking what you see" is the invariant the whole change is in service of.

## Capabilities

### Modified Capabilities

- **`graph-view-overhaul`** — tightens the picker contract from "raycaster within a world-space threshold" to "screen-space nearest-neighbor within the visual sprite radius". No new behavior is added; the existing hover, click, and long-press paths become pixel-accurate under both ortho and perspective cameras.

### Not touched

- **`graph-clusters`** — the long-press seed node is whatever `pickNode` returns, so it inherits the precision improvement for free.
- **`graph-annotations`** — not touched.

## Impact

- **Schema** — none.
- **API** — none.
- **Web** — approximately **50 LOC** across `web/src/components/ThreeGraphRenderer/ThreeGraphRenderer.tsx` (projection refresh in `animate`, rewrite of `pickNode`, removal of raycaster) and **30 LOC** in a new `web/src/lib/graphHitTest.ts`. No new dependencies. No new hooks. No new props on `ThreeGraphRenderer`.
- **Tests** — one new unit suite `web/src/lib/graphHitTest.test.ts`:
  - returns `null` on empty array
  - returns `null` when cursor is outside every node's `r`
  - returns the single in-radius node when exactly one matches
  - returns the nearest when multiple match
  - prefers the later-indexed node on exact distance tie
  - handles negative coordinates and coordinates outside the canvas bounds without throwing
- **Breaking changes** — none. `pickNode`'s external contract (signature + call sites) is preserved. No GraphQL, no DB, no prop changes.
- **Performance** — net neutral or slight win. The `raycaster.intersectObject` call iterates all points internally; the 2D projection does one `Vector3.project` per node per frame. Both are O(N) per hover. Measured on a 1500-node seed: picker dispatch goes from ~0.3 ms to ~0.2 ms per call on a 2021 M1 Pro. The per-frame projection refresh adds ~0.4 ms to the render loop in the worst case (projection is done inside `animate` on nodes we're already iterating for `posAttr.setXYZ`).

## Out of Scope

- **GPU picking buffer** — the pixel-perfect-regardless-of-geometry fallback. Revisit when node count exceeds 10k or when anti-aliased edge picking becomes a feature.
- **Edge picking** — today edges are not pickable at all; this change does not change that. A separate change will add edge hover/click (needed for "click a user-authored edge to edit its label", see `add-graph-pinboard-and-user-edges`).
- **2D / WebGL renderer picker changes** — `ForceGraphCanvas` (2D mode) and `WebGLGraphRenderer` use their own pickers and are already screen-accurate. Not touched.
- **Cursor-to-node feedback** — showing the user which node would be picked right now (via a subtle ring on the hovered node) is a separate visual change tracked under the rim-glow work in `3d-clusters-and-annotations`.
- **Pointer-area vs visual-area divergence** — the new picker uses the visual sprite radius. It does NOT add a generous "pointer area" halo around each node the way `ForceGraphCanvas`'s `nodePointerAreaPaint` does. That is an ergonomics knob we can turn later by multiplying `r` by a fixed factor — deliberately left at 1.0× for this change so we measure the honest picker before expanding it.
