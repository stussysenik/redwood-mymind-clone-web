## Why

The `3d-clusters-and-annotations` change shipped a data layer + API + UI shell (16/48 tasks) but stopped short of an end-to-end flow. A hands-on verification pass found four release blockers and five correctness/type gaps that together make the feature non-functional today:

1. **The 3D renderer is invisible.** `ThreeGraphRenderer.tsx:138-141` builds a `PerspectiveCamera` with `fov = 1°` at `z = 600`. The visible world window at z=0 is `2 · 600 · tan(0.5°) ≈ 10.5` world units, but d3-force-3d spreads nodes across ~800 world units centered at `(width/2, height/2)`. Every node sits outside the frustum. Screenshots at `/tmp/graph-three.png` confirm the canvas mounts with zero nodes drawn. Users switch the picker to "Three.js" and see a blank graph — there is no perceivable 2D → 3D transition.
2. **Three has no pointer wiring.** Lines 109-114 store `onClickRef` / `onHoverRef` but only `onEngineStopRef` is ever invoked. There is no `Raycaster`, no hit-test, no hover, no long-press detector. Cluster creation (the entire point of the prior change) is unreachable from the 3D backend.
3. **The cluster save flow dead-ends.** `ClusterSheet.tsx` exists but nothing in `GraphClient.tsx` calls `createGraphCluster`. Tapping "Save" is a no-op. Tasks 5.2–5.4 in the prior change are still unchecked.
4. **The migration is not applied to the shared Supabase project.** POSTing `graphClusters` or `graphAnnotations` at `http://localhost:8912/graphql` returns `The table public.graph_clusters does not exist in the current database`. The migration file exists at `api/db/migrations/20260413055733_add_graph_clusters_and_annotations/` but `yarn rw prisma migrate deploy` was never run against the Supabase URL.
5. **Type check is broken in five new files.** `graphClustersFragments.ts:1` imports `gql` from `@redwoodjs/web` (it is a Redwood global). `graphClusters.ts:4` and `graphAnnotations.ts:4` use `import { validate as validateUuid } from 'uuid'` which fails under `nodenext` resolution. `graphClusters.test.ts:65,97` and `graphAnnotations.test.ts:71` access `.name`/`.text` on a union-typed resolver return value without narrowing.
6. **API service tests never executed.** `yarn rw test api` fails at Jest `globalSetup` because `TEST_DATABASE_URL` is not set in `.env.defaults:10`. The 729 lines of service test marked `[x] 2.5` have never been run against a real database.
7. **Playwright graph-renderer-picker has 4 failing specs.** The "graph page integration" block logs in via `beforeEach` but the ephemeral test user has zero cards, so `GraphCell.tsx:77` short-circuits to `<Empty />`. 5 pass / 4 fail.
8. **WebGL focus mode dims neighbors.** `WebGLGraphRenderer.tsx:201` has `const isNeighbor = false // neighbour index not yet wired`. Focusing a node dims the whole graph including its neighbors, breaking the "focus on a node and see its connections" affordance.
9. **There is no visible 2D ↔ 3D affordance.** The renderer picker (canvas/webgl/three) is buried in Settings → Experimental. The user's expectation on first load is a prominent in-graph dimensionality toggle — 2D (flat) vs 3D (tilted perspective). Today the picker labels are technology names, not dimensionality, and the Three backend's 3D nature is invisible even when selected.

This change is the narrowest patch that (a) makes the 3D backend render with a clear 3D effect, (b) adds a prominent 2D ↔ 3D toggle in the graph chrome, (c) wires pointer events on the Three canvas so long-press → cluster save works end-to-end, and (d) fixes the type/test/migration blockers that prevent the prior change from being shippable. **Annotations (Group 7), full keyboard a11y (Group 8), perf benchmarks (Group 9), and the feature flag rollout (Group 10) are explicitly out of scope** and remain owned by the prior change.

## What Changes

### New — `2D | 3D` dimensionality toggle

- A two-state segmented control in the graph chrome (top-right, near the existing filter button): labels `2D` and `3D`, 44 px touch targets, same visual language as the existing mode switcher (graph/list).
- Selecting `2D` forces the effective renderer to the user's preferred 2D backend (`canvas` or `webgl`, whichever they chose in Settings → Experimental). Selecting `3D` forces the effective renderer to `three` and applies a non-zero default tilt (`0.35`, see §D2) so the depth is immediately visible.
- The advanced `graph_renderer` preference in Settings → Experimental keeps working — it now stores the *2D backend preference* when 2D is active, and is ignored when 3D is active.
- Persisted in `UserPreferences.graphRenderer` using a new schema: `'canvas'`, `'webgl'`, `'three'` stay valid (they imply 3D = the current non-three selection, 2D = whatever was last 2D). Added: a new `UserPreferences.graphDimension` column, `'2d' | '3d'`, default `'2d'`.

### New — visible 3D in Three backend

- **Fix the camera.** Replace the single `PerspectiveCamera(fov=1°)` with a pair: an `OrthographicCamera` sized to `{ left: -width/2, right: width/2, top: height/2, bottom: -height/2, near: -2000, far: 2000 }` at tilt 0, and interpolate into a `PerspectiveCamera(fov=45°)` at tilt 1. The two cameras share a target at `(width/2, height/2, 0)`. At every frame the currently active camera is selected by `tiltRef.current < 0.05`.
- **Default tilt on 3D entry.** When the user selects `3D` from the new toggle (or loads the page with `graphDimension === '3d'`), `tiltRef.current` initializes to `0.35` (a visible tilt, not flat). The existing tilt handle still lets the user drag to 0 (flat-ortho) or 1 (full perspective).
- **Z-stratified nodes stay z-stratified.** The existing `TYPE_Z` lookup continues to assign type-specific z offsets, which at tilt 0 (ortho top-down) shows as slight brightness differences but at tilt 0.35+ becomes clearly visible depth banding.

### New — Three pointer wiring (click / hover / long-press)

- Add a `Raycaster` + `Vector2` pair to the renderer. On `pointermove` over the canvas, cast against `pointCloud` (the `THREE.Points` object) using a screen-space threshold of 12 px, find the nearest node index, call `onHoverRef.current(nodeId | null)`. On `pointerdown` + matching `pointerup` within 8 px + 250 ms, call `onClickRef.current(nodeId)`.
- Add a long-press detector on the canvas: `pointerdown` starts a 300 ms timer, `pointermove` cancels if movement > 10 px, timer fires → emit `onLongPressNode(nodeId)` + `haptic('medium')`. This is the gesture Group 4 in the prior change was meant to build.
- Expose new optional props on `GraphRendererProps`: `onLongPressNode(nodeId: string)`, `onSelectionHop(direction: 'grow' | 'shrink')`. Canvas and WebGL backends accept the props as no-ops for API symmetry.

### New — end-to-end cluster save flow

- Wire `createGraphCluster` mutation into `GraphClient.tsx`. Use `cache.modify` on the root `graphClusters` field to prepend the new cluster, mirroring the archive/delete pattern from commit `864e718`.
- On `onLongPressNode`, run the existing `floodFillFromAnchor(nodeId, 2)` helper from `useClusterSelection.ts`, seed `selectedClusterNodeIds`, open the `ClusterSheet` with a prefilled empty name.
- On save success: close sheet, clear selection, show toast "Cluster saved". On error: keep sheet open, show inline error, keep selection intact.
- Wire `deleteGraphCluster` mutation with the same `cache.modify` filter pattern (this was referenced by the prior change's `ClusterListSheet` task 6.5 but never implemented).

### New — cluster list + restore

- Create `ClusterListSheet.tsx` — a bottom sheet on mobile, right-side slide-over on desktop, lists all user clusters via `graphClusters` query. Each row: name + note preview + node count + relative timestamp. Long-press row → delete confirm dialog → `deleteGraphCluster` mutation.
- Row tap: `setSelectedClusterNodeIds(new Set(cluster.nodeIds))`, compute the cluster's center of mass from current simulation positions, emit `onCameraFrame(center, radius)` to the renderer.
- Add an `onCameraFrame(target, radius)` imperative method on `ThreeGraphRenderer` (exposed via `forwardRef`). Interpolates the camera target + distance over 600 ms.
- Add a "Clusters" button to the graph chrome (next to the new 2D/3D toggle) that opens `ClusterListSheet`.

### Modified — schema, migration, cascade hook

- **Apply migration to Supabase.** Run `yarn rw prisma migrate deploy` against the live `DATABASE_URL`. Verify `graph_clusters` and `graph_annotations` tables exist by hitting `graphClusters` and `graphAnnotations` queries and asserting a non-error response.
- **Add `graphDimension` column to `UserPreferences`.** New migration that alters `user_preferences` to add `graph_dimension VARCHAR(2) DEFAULT '2d' NOT NULL`.
- **Verify cascade hook.** The prior change marked task 1.3 `[x]`. Re-verify that `deleteCard` cascades to `GraphAnnotation` where `anchorType = 'node'` and add a regression test that survives Prisma regen.

### Modified — type correctness

- `web/src/components/GraphClient/graphClustersFragments.ts:1`: drop `import { gql } from '@redwoodjs/web'` (it is a Redwood global).
- `api/src/services/graphClusters/graphClusters.ts:4` + `graphAnnotations.ts:4`: replace `import { validate as validateUuid } from 'uuid'` with a local regex or `import { validate } from 'uuid/dist/cjs'` fallback that resolves under `nodenext`. Chosen fix: drop `uuid` entirely and use a 36-char hex-dash regex — the input is already narrow-typed as `string`, and the Prisma query will fail-fast on a malformed id.
- `api/src/services/graphClusters/graphClusters.test.ts:65,97` + `graphAnnotations.test.ts:71`: `await` the resolver return value before accessing `.name` / `.text`, narrowing the union.

### Modified — test infrastructure

- `.env.defaults:10`: document `TEST_DATABASE_URL` with a pointer to a local Postgres. Leave commented for users who only run web tests; CI owners enable it in their env.
- `e2e/fixtures.ts` `graphPageUser` (or equivalent beforeEach in `graph-renderer-picker.spec.ts:116`): seed 8 cards across 4 types (`article`, `image`, `note`, `book`) via the existing `createCard` helper before entering the graph page. This fixes the 4 failing "graph page integration" specs.

### Modified — WebGL neighbor dimming

- `WebGLGraphRenderer.tsx:201`: replace `const isNeighbor = false` with a lookup into a `neighborSetsByNode: Map<string, Set<string>>` passed as a new prop. `GraphClient` already computes `neighborIndex` — extend the derived state to emit a per-node neighbor set and thread it through to the WebGL renderer. Canvas backend gets the same prop for API symmetry but ignores it (Canvas dimming already works).

### Modified — renderer picker copy

- `GraphRendererPicker.tsx` labels become dimensionality-first: `"2D · Canvas (default)"`, `"2D · WebGL (GPU)"`, `"3D · Three.js (depth)"`. The new in-graph `2D | 3D` toggle flips between the currently-selected 2D backend and Three.

## Capabilities

### Modified Capabilities

- **`graph-view-overhaul`** — adds a dimensionality toggle (`2d`/`3d`), a Three camera that renders at all tilt values, Three pointer wiring (click/hover/long-press), and WebGL neighbor-aware focus dimming. Extends the renderer selection UI from a three-way technology picker to a two-layer model: dimensionality first (primary, in-graph), then technology (advanced, in settings).
- **`graph-clusters`** — adds the end-to-end save/restore flow that makes cluster creation possible from the UI. Adds a cluster list sheet with restore-to-selection and delete. Closes the gap between "data layer + API exist" (shipped by prior change) and "a user can save and revisit a cluster."

### Not touched

- **`graph-annotations`** — deferred to a follow-up change. The tables exist; the UI is not built yet. Keeping annotations out of this change keeps the scope focused on making the existing cluster flow usable.

## Impact

- **Schema** — one new migration (`add_graph_dimension_to_user_preferences`), backfill existing rows to `'2d'`.
- **Migration ops** — one-time `yarn rw prisma migrate deploy` against Supabase for the prior (unapplied) migration + the new one.
- **API** — no new resolvers. One service fix (`graphClusters.ts`, `graphAnnotations.ts` uuid import). `userPreferences` service gains a `graphDimension` field.
- **Web** — ~350 LOC total across `ThreeGraphRenderer.tsx` (camera + pointer wiring, ~120 LOC), `GraphClient.tsx` (mutation wiring + 2D/3D toggle + `neighborSetsByNode`, ~100 LOC), new `ClusterListSheet.tsx` (~130 LOC), `WebGLGraphRenderer.tsx` (~20 LOC for neighbor lookup), `GraphRendererPicker.tsx` (copy, ~10 LOC).
- **Tests** — 4 Playwright seed fixes + new specs for: 2D/3D toggle, Three click/hover, cluster save end-to-end, cluster restore. Existing 16 Jest specs continue to pass.
- **No breaking changes.** Existing `canvas`/`webgl`/`three` preference values are preserved. Users who never touch the new toggle see the same graph they saw yesterday (except that Three now *renders*).

## Out of Scope

- Annotation layer rendering (`AnnotationLayer`, `AnnotationComposer`, billboard sprites). Staying owned by `3d-clusters-and-annotations` Group 7.
- Automatic cluster detection (Louvain / label propagation). v0.9 roadmap.
- Full arrow-key graph traversal for a11y. Group 8 of the prior change.
- 500-node / 60 fps perf benchmark gates. Group 9 of the prior change.
- `byoa_3d_clusters` feature flag. Group 10 of the prior change — we ship this change behind the existing renderer picker instead.
- Shipping iA Writer fonts. Typography change requires its own design decision and is orthogonal to the 3D flow bug.
- FK relations from `GraphCluster`/`GraphAnnotation` to a `User` model. There is no `User` model in `schema.prisma` (auth lives in Supabase). Adding one is a separate schema refactor.
- `TEST_DATABASE_URL` CI configuration. Documented in `.env.defaults` here but actual CI wiring is infra work.
