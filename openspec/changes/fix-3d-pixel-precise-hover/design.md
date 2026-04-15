# Design — fix-3d-pixel-precise-hover

## Context

`ThreeGraphRenderer` renders up to 3000 nodes as a single `THREE.Points` cloud with a custom `ShaderMaterial` (circle SDF + rim). Point size is set in the vertex shader as `gl_PointSize = uSize * (300.0 / -mvPos.z)` where `uSize = 20` at `ThreeGraphRenderer.tsx:295`. Under ortho, `-mvPos.z ≈ ORBIT_R = 600`, so the sprite side length is ~10 CSS pixels → radius ~5 CSS pixels. Under perspective, `-mvPos.z` varies per node with camera position, and sprites near the camera grow visibly.

The picker needs to answer: "given a cursor at `(cx, cy)` in CSS pixels, which node is visually closest, and is the cursor inside its sprite?"

## Options considered

### Option A — 2D projection hit test (chosen)

Per frame, project every node's world position to screen pixels via `activeCam.project(vec3)` → NDC → CSS pixels. Compute each node's visual radius from the same `uSize * 300 / -mvPosZ / 2` formula the shader uses. Store `{ id, sx, sy, r }[]` in a ref. On pointer events, walk the array and return the nearest entry with `dsq <= r * r`.

- **Pros:** zero GPU cost; matches the shader's own math so there is no divergence between "what you see" and "what you pick"; works identically under ortho and perspective; the hit-test logic is a pure function that can be unit-tested in Jest without a canvas or WebGL context; ~50 LOC total.
- **Cons:** O(N) per pick. At N = 3000 this is ~0.2 ms on M1 Pro — well under the 16 ms frame budget. A future spatial index (quadtree keyed on screen positions) would take it to O(log N) if we grow past 50k nodes.
- **Risk:** per-frame projection adds ~0.4 ms to `animate()` at N = 3000. Acceptable relative to the ~6 ms the shader itself takes.

### Option B — GPU picking buffer

Render nodes to an offscreen framebuffer colored by index, call `gl.readPixels` at the cursor on pointer events.

- **Pros:** pixel-perfect regardless of geometry, camera, or overlap. Scales to millions of nodes.
- **Cons:** ~80 LOC with extra framebuffer management; allocates a second render target (memory cost scales with viewport size); introduces a GPU→CPU readback stall on pointer events (~1–3 ms per pick on desktop, worse on mobile); harder to unit-test because it depends on a live WebGL context; overkill for the current node-count envelope.

### Option C — Keep the raycaster but fix the threshold

Shrink `raycaster.params.Points.threshold` from 12 to a camera-aware value recomputed on zoom/tilt change.

- **Pros:** tiny diff.
- **Cons:** does not solve the "first hit vs nearest hit" sort ambiguity (`Raycaster.intersectObject` returns camera-distance-sorted, not cursor-distance-sorted). Dense clusters still pick wrong. This is the approach we are on today; keeping it loses the precision win that motivates the change.

**Decision: Option A.** It is the smallest change that makes the picker correct under both cameras, it testable without a canvas, and it stays under the complexity budget for a bug-fix change.

## Math reference

### World → screen (inside `animate`)

```
const v = tmpVec3.set(sn.x, sn.y, sn.z)     // reuse a scratch Vector3
v.project(activeCam)                         // → NDC x, y in [-1, 1]
const sx = rect.left + ((v.x + 1) / 2) * rect.width
const sy = rect.top  + ((1 - v.y) / 2) * rect.height
```

`rect` comes from `canvasRef.current.getBoundingClientRect()` captured once per frame (outside the per-node loop).

### Visual radius per node

Under perspective, compute `-mvPosZ` per node by first transforming the world position by the view matrix:

```
const mv = tmpVec3.set(sn.x, sn.y, sn.z).applyMatrix4(activeCam.matrixWorldInverse)
const pointSize = 20 * 300 / -mv.z      // matches shader uSize * 300 / -mvPos.z
const r = pointSize / 2                  // sprite side → radius
```

Under ortho, `activeCam.matrixWorldInverse.elements[14]` folds into the shader's `-mvPos.z` the same way, so the same code works. We do not special-case ortho.

We clamp `r` to a minimum of 6 CSS pixels so unusually far-back nodes (which visually fall below 12 px side length) remain pickable. 6 px is the same clamp the existing raycaster effectively provides today.

### Hit test (inside `graphHitTest.ts`)

```
let bestId: string | null = null
let bestDsq = Infinity
for (const p of screenPositions) {
  const dx = clientX - p.sx
  const dy = clientY - p.sy
  const dsq = dx * dx + dy * dy
  if (dsq <= p.r * p.r && dsq <= bestDsq) {
    bestDsq = dsq
    bestId = p.id
  }
}
return bestId
```

On exact tie (`dsq === bestDsq`), `bestId` is the *later* candidate, because the `<=` lets the later entry overwrite the earlier. This matches the "picking what you see" invariant (later entries are drawn on top in the point cloud).

## Decisions

- **Projection buffer lives in a ref, not state.** The buffer is rebuilt every frame and consumed by event handlers. Putting it in state would trigger re-renders at 60 fps.
- **Hit test is a pure function in `src/lib/`.** This is the smallest change that makes picker correctness unit-testable. The alternative (inline inside `ThreeGraphRenderer`) means we can only test via a mounted Three.js canvas, which is heavyweight and flaky in JSDOM.
- **We reuse one scratch `Vector3`.** Allocating a fresh `Vector3` per node per frame is 3000 allocations per frame at N=3000; in a 60 fps session that's 180k allocations per second and measurable GC pressure. One `tmpVec3 = new THREE.Vector3()` at init, reused in the projection loop.
- **Minimum picker radius of 6 CSS pixels.** Below this, nodes become unreachable even though they're visible. 6 px is the tactile floor.
- **No pointer-area expansion.** The picker uses the visual sprite radius. An "ergonomic halo" (e.g., `r * 1.5`) is a separate tuning knob we can add later if users report undershoot. Shipping the honest picker first gives us a baseline.

## Risks

- **NDC-to-pixel math edge cases.** Devices with `devicePixelRatio != 1` could produce a mismatch between CSS pixels and the buffer-space coordinates used by the shader. Mitigation: `getBoundingClientRect()` returns CSS pixels, not buffer pixels, so the projection and the cursor event both live in CSS pixel space. Verified against the existing `rect.width` / `rect.height` usage at `ThreeGraphRenderer.tsx:453-455`.
- **Camera matrices not yet updated on the first projection.** `animate()` updates `orthoCam`/`perspCam` before `renderer.render` — the projection step must happen *after* the camera matrices are final, otherwise the first frame projects against stale matrices. Mitigation: run the projection step immediately before the `renderer.render(scene, activeCam)` call at `ThreeGraphRenderer.tsx:411`.
- **Node count growth.** O(N) picker stays under budget up to ~50k nodes on desktop, ~10k on mid-range mobile. We revisit with a quadtree when profiling shows it.

## Non-risks

- **Does not affect the long-press timer.** Long-press only needs the `nodeId`, which `pickNode` continues to return.
- **Does not affect zoom or pan.** Those use `cameraStateRef`, not the picker.
- **Does not affect the frame budget of the idle simulation.** The simulation runs in d3-force-3d on the main thread; the picker only runs on pointer events or per-frame projection, which is additive to the existing `posAttr.setXYZ` loop.
