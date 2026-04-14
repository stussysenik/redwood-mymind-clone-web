# Tasks: fix-3d-graph-and-complete-clusters

Ordered by dependency. Items within a group are parallelizable. Verification lives inside each task so every completed checkbox is a proven state.

## Group 0 — Unblock the database (critical path, nothing compiles behavior without this)

- [x] **0.1** Run `yarn rw prisma migrate status` against the live `DATABASE_URL`. Capture the current state of applied vs pending migrations and save the output to the PR description.
- [x] **0.2** Run `yarn rw prisma migrate deploy` against the live `DATABASE_URL` to apply the existing (unapplied) `20260413055733_add_graph_clusters_and_annotations` migration. If it errors, abort and surface the Postgres error — do not continue until the tables exist.
- [x] **0.3** Verify live: `curl -X POST http://localhost:8912/graphql -H 'Content-Type: application/json' -d '{"query":"{ graphClusters { id } }"}'` returns an empty array (or auth error), never `The table public.graph_clusters does not exist`.
- [x] **0.4** Add `UserPreferences.graphDimension` column via `yarn rw prisma migrate dev --name add_graph_dimension_to_user_preferences`. Default `'2d'`, NOT NULL. Verify reversible.
- [x] **0.5** Apply the new migration to Supabase via `yarn rw prisma migrate deploy`. Verify via a SELECT on `information_schema.columns` that `user_preferences.graph_dimension` exists.

## Group 1 — Type correctness (can start in parallel with Group 0)

- [x] **1.1** `web/src/components/GraphClient/graphClustersFragments.ts:1` — remove `import { gql } from '@redwoodjs/web'`. `gql` is a Redwood global. Verify: file has no named imports from `@redwoodjs/web`.
- [x] **1.2** `api/src/services/graphClusters/graphClusters.ts:4` — remove `import { validate as validateUuid } from 'uuid'`. Add a module-local regex: `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; const isUuid = (s: string) => UUID_RE.test(s)`. Replace `validateUuid` call sites with `isUuid`.
- [x] **1.3** `api/src/services/graphAnnotations/graphAnnotations.ts:4` — same treatment as 1.2.
- [x] **1.4** `api/src/services/graphClusters/graphClusters.test.ts:65,97` — `await` the resolver return value before accessing `.name`, narrow the union via `expect(result).toHaveProperty('name', …)` or a type-narrowing `if`.
- [x] **1.5** `api/src/services/graphAnnotations/graphAnnotations.test.ts:71` — same treatment as 1.4 for `.text`.
- [x] **1.6** Verify: `yarn rw type-check` reports zero errors in all touched files.

## Group 2 — Dimensionality state (depends on Group 0)

- [x] **2.1** Update `api/src/services/userPreferences/userPreferences.ts` to read/write `graphDimension`. Add `graphDimension: '2d' | '3d'` to the type definition. Ignore unknown values (default to `'2d'`).
- [x] **2.2** Update `api/src/graphql/userPreferences.sdl.ts` to expose `graphDimension: String!` on `UserPreferences` type, and accept it in `UpdateUserPreferencesInput`.
- [x] **2.3** Update `web/src/components/GraphClient/GraphClient.tsx` — added `graphDimension?: GraphDimension` prop, local optimistic state, `SET_GRAPH_DIMENSION` mutation, `effectiveRenderer` derivation.
- [ ] **2.4** Service unit test (once `TEST_DATABASE_URL` is documented): `userPreferences.test.ts` — `updateUserPreferences` with `graphDimension: '3d'` persists, rejects `'4d'` as invalid.

## Group 3 — Three camera fix (depends on Group 0; parallel with Groups 1 & 2)

- [x] **3.1** `ThreeGraphRenderer.tsx` — replace the single `PerspectiveCamera(fov=1°)` with an `OrthographicCamera` + `PerspectiveCamera` pair. OrthoCam spans `[-w/2, w/2, -h/2, h/2]` at z=600. PerspCam (fov=45°) orbits at constant radius 600 so gl_PointSize stays consistent.
- [x] **3.2** In the render loop, pick `activeCam = tiltRef.current < 0.05 ? orthoCam : perspCam`. Orbit `perspCam.position` around `(cx, cy, 0)` using `sin(tilt·π/4)` for y-offset and `cos(tilt·π/4)·600` for z.
- [ ] **3.3** Verify via Chrome DevTools MCP: navigate to `/graph`, switch picker to Three, screenshot `/tmp/graph-three-fixed.png`. Assert at least 3 nodes are visible.
- [ ] **3.4** Playwright spec in `e2e/graph-three-render.spec.ts`: switch to Three backend, wait for canvas, verify `canvas.toDataURL()` contains non-empty pixel data.

## Group 4 — Three pointer wiring (depends on Group 3)

- [x] **4.1** Add `Raycaster`, `Vector2`, and `pickNodeAtPointer` helper to `ThreeGraphRenderer`. `raycaster.params.Points.threshold = 12`.
- [x] **4.2** Attach `pointermove` handler to the canvas: RAF-guard, call `pickNode`, invoke `onHoverRef.current`. Does not fire during tilt drag.
- [x] **4.3** Implement the long-press state machine: `pointerdown` records start, starts 300 ms timer, moves > 10 px cancel, timer fires → `haptic('medium')` + `onLongPressNode(nodeId)`. `pointerup < 250 ms & < 8 px` → tap: `onClickRef.current(nodeId)`.
- [x] **4.4** `onLongPressNode` and `neighborSetsByNode` added to `GraphRendererProps`. Canvas and WebGL backends accept as optional.
- [ ] **4.5** Jest test for the long-press state machine: simulate `pointerdown`, advance timers 300 ms, assert `onLongPressNode` called.
- [ ] **4.6** Playwright mobile-viewport spec: long-press a node in the 3D canvas, verify `ClusterSheet` opens.

## Group 5 — Dimensionality toggle UI (depends on Group 2 + Group 3)

- [x] **5.1** Created `web/src/components/GraphDimensionToggle/GraphDimensionToggle.tsx` — segmented control with `2D`/`3D`, 44 px touch targets, 200 ms de-bounce.
- [x] **5.2** Mounted `GraphDimensionToggle` in `GraphClient.tsx` top-right chrome. Reads `localDimension`, writes via `handleDimensionChange`.
- [x] **5.3** `effectiveRenderer = graphDimension === '3d' ? 'three' : (rendererBackend === 'three' ? 'canvas' : rendererBackend)` derived and used in renderer branches.
- [x] **5.4** `initialTilt={localDimension === '3d' ? 0.35 : 0}` passed to `ThreeGraphRenderer`. Renderer initializes `tiltRef.current` from that prop.
- [ ] **5.5** Fade transition: wrap renderer in 200 ms `opacity` transition.
- [ ] **5.6** Storybook story for `GraphDimensionToggle`.
- [ ] **5.7** Playwright spec: toggle 2D → 3D → 2D.

## Group 6 — Cluster save flow (depends on Group 4 + Group 5)

- [x] **6.1** In `GraphClient.tsx`, imported `CREATE_GRAPH_CLUSTER_MUTATION` from `graphClustersFragments.ts`, wired `useMutation` with `cache.modify` prepend pattern.
- [x] **6.2** `onLongPressNode` → `floodFillFromAnchor(nodeId, 2)` → `setSelectedClusterNodeIds` → `setClusterSheetOpen(true)`. Passed to ThreeGraphRenderer.
- [x] **6.3** `ClusterSheet.tsx` already had `onSave` prop; wired to `handleClusterSave` mutation call. On success: close + clear selection + toast. On error: keep open + inline error.
- [ ] **6.4** Playwright spec: long-press node → sheet opens → type name → tap save → verify toast + close.
- [ ] **6.5** Unit test `cache.modify` logic.

## Group 7 — Cluster list + restore + delete (depends on Group 6)

- [x] **7.1** Create `web/src/components/ClusterListSheet/ClusterListSheet.tsx`.
- [x] **7.2** Row layout per spec.
- [x] **7.3** Row tap → `onRestore(cluster)` → `restoreClusterSelection` (hook's `setSelectedNodeIds`).
- [x] **7.4** `frameTo` imperative method on `ThreeGraphRenderer` via `forwardRef` + `useImperativeHandle`.
- [x] **7.5** Row long-press → delete confirm dialog (300 ms + 10 px guard, `cache.modify` eviction).
- [x] **7.6** "Clusters" button in `GraphClient.tsx` chrome — bottom-left floating pill, 44 px touch target.
- [ ] **7.7** Playwright spec.

## Group 8 — WebGL focus dimming fix (parallel with Groups 5, 6, 7)

- [x] **8.1** Derived `neighborSetsByNode: Map<string, Set<string>>` from `neighborIndex.idx` via `useMemo` in `GraphClient.tsx`.
- [x] **8.2** Threaded `neighborSetsByNode` through `GraphRendererProps` to `WebGLGraphRenderer`.
- [x] **8.3** `WebGLGraphRenderer.tsx` — replaced `const isNeighbor = false` with `neighborSets?.get(focusedId)?.has(sn.id) ?? false`.
- [ ] **8.4** Verify via Chrome DevTools MCP: switch to WebGL backend, focus a node, assert neighbors at full opacity.
- [ ] **8.5** Playwright spec: focus a node on WebGL, assert dimming pattern.

## Group 9 — Playwright seed fixtures (parallel with everything)

- [x] **9.1** Add `seedGraphCards(testUser, count=8)` helper to `e2e/support/fixtures.ts` (diverse types, shared tags for edges).
- [x] **9.2** In `e2e/graph-renderer-picker.spec.ts`, "Graph page integration" `beforeEach` now calls `seedGraphCards(testUser)` after login.
- [ ] **9.3** Re-run `yarn playwright test e2e/graph-renderer-picker.spec.ts`.

## Group 10 — Renderer picker copy (trivial, parallel with everything)

- [x] **10.1** `GraphRendererPicker.tsx` relabeled: `"2D · Canvas (default)"`, `"2D · WebGL (GPU)"`, `"3D · Three.js (depth)"`.
- [x] **10.2** Settings subtitle updated to `"Advanced: when 2D is active, pick which 2D backend renders your graph."`.
- [ ] **10.3** Storybook story updated.

## Group 11 — Verification (gate for landing)

- [x] **11.1** `yarn rw type-check web` — zero new errors in touched files. Build succeeds.
- [x] **11.2** `yarn rw test web --testPathPattern="GraphClient"` — 11 tests pass (useClusterSelection suite).
- [ ] **11.3** `yarn rw test api` — requires `TEST_DATABASE_URL`.
- [ ] **11.4** `yarn playwright test` (Desktop Chrome).
- [ ] **11.5** Chrome DevTools MCP: full manual pass on `/graph` in 2D Canvas, 2D WebGL, and 3D Three.
- [ ] **11.6** Chrome DevTools MCP: cluster save flow.
- [ ] **11.7** Lighthouse audit on `/graph` in 3D mode.

## Group 12 — Ship

- [ ] **12.1** Update `TECHSTACK.md`.
- [ ] **12.2** Move prior change tasks to checked.
- [ ] **12.3** Changelog copy.
- [ ] **12.4** Merge.

## Dependencies

```
Group 0 (db) ──┬─► Group 2 (pref) ──┐
               ├─► Group 3 (camera) ─┼─► Group 5 (toggle UI) ──┐
               └─► Group 8 (webgl)   │                         │
                                     └─► Group 4 (pointer) ────┼─► Group 6 (save) ──► Group 7 (list)
Group 1 (types) ───────────────────────────────────────────────┘
Group 9 (seed) and Group 10 (copy) are parallel with everything.
Groups 5, 6, 7, 8 → Group 11 (verify) → Group 12 (ship).
```

- Group 0 is the critical path — no GraphQL calls work until the migration is deployed.
- Groups 1, 9, 10 are independent and can ship any time.
- Group 3 (camera) unblocks the visible 3D; Group 4 (pointer) unblocks interactions; Group 5 (toggle UI) unblocks discoverability.
- Group 11 (verify) is the last gate before Group 12 (ship).
