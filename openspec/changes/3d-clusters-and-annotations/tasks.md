# Tasks: 3d-clusters-and-annotations

Ordered by dependency. Items within a group are parallelizable.

## Group 1 — Data layer (unblocks everything)

- [x] **1.1** Add `GraphCluster` and `GraphAnnotation` models to `api/db/schema.prisma` with the fields from `design.md` §D6. Include `@@index([userId, createdAt])` on both, plus `@@index([userId, anchorType, anchorId])` on annotations.
- [x] **1.2** Run `yarn rw prisma migrate dev --name add_graph_clusters_and_annotations`. Verify the migration is reversible on a clean DB.
- [x] **1.3** Write a migration guard for `deleteCard` in `api/src/services/cards/cards.ts`: when a card is permanently deleted, cascade-delete any `GraphAnnotation` where `anchorType = 'node'` and `anchorId = cardId`. Do NOT touch clusters — a cluster's `nodeIds` list is allowed to drop orphan IDs silently on read.
- [x] **1.4** Unit test: create a cluster, delete a card in its `nodeIds`, verify the cluster still loads with the orphan ID gracefully filtered out on read.

## Group 2 — API surface (depends on Group 1)

- [x] **2.1** Create `api/src/graphql/graphCluster.sdl.ts` with `GraphCluster` type, `CreateGraphClusterInput`, `UpdateGraphClusterInput`, queries (`graphClusters`, `graphCluster`), mutations (`createGraphCluster`, `updateGraphCluster`, `deleteGraphCluster`). Every operation `@requireAuth`.
- [x] **2.2** Create `api/src/services/graphClusters/graphClusters.ts` with strict `userId` scoping — every query filters by `context.currentUser.id`, every mutation checks ownership before write/delete. Write cluster `nodeIds` after validating each ID against `Card.findMany({ where: { id: { in: nodeIds }, userId } })`.
- [x] **2.3** Create `api/src/graphql/graphAnnotation.sdl.ts` mirroring 2.1 for annotations.
- [x] **2.4** Create `api/src/services/graphAnnotations/graphAnnotations.ts` mirroring 2.2, with the additional validation that `anchorType = 'node'` anchors must reference a `Card` owned by the user, and `anchorType = 'cluster'` anchors must reference a `GraphCluster` owned by the user.
- [x] **2.5** Service unit tests: creation, user-scoping (can't read another user's cluster), validation errors, delete cascade from `Card` delete.
- [x] **2.6** Validate: `yarn rw check` clean.

## Group 3 — Client selection state machine (can start after Group 2 SDL exists)

- [x] **3.1** Add `selectedClusterNodeIds: Set<string>` and `selectionAnchorId: string | null` state to `GraphClient.tsx`.
- [x] **3.2** Add a `floodFillFromAnchor(anchorId, hops)` helper that BFS-walks `neighborIndex.idx` up to `hops` steps. Pure function, unit-testable. Returns a `Set<string>`.
- [x] **3.3** Add selection actions: `toggleInSelection(nodeId)`, `growSelection()`, `shrinkSelection()` (tracks a `currentHopBound` state 0..5), `clearSelection()`. All call `haptic()` per design.
- [ ] **3.4** Wire `onSelectionStart` / `onSelectionAdd` / `onSelectionRemove` callbacks through `GraphRendererProps`. All three backends must accept the new optional props; only the Three backend uses them for now.
- [x] **3.5** Unit tests for `floodFillFromAnchor` — empty graph, single node, 2-hop, 5-hop, disconnected components.

## Group 4 — ThreeGraphRenderer interaction (depends on Group 3)

- [ ] **4.1** Add a long-press detector to the canvas pointer events: `pointerdown` starts a 300 ms timer + tracks start position; `pointermove` cancels if movement > 10 px; `pointerup` cancels cleanly; timer fires → emit `onSelectionStart(nodeId)` and `haptic('medium')`. Use a WeakMap to handle multiple pointers cleanly.
- [ ] **4.2** Add the `aSelected` Float32 buffer attribute to the node cloud geometry. Initialize to 0, update via `simNodes.forEach(...)` each frame (just the handful of changed indices).
- [ ] **4.3** Update `NODE_VERT` and `NODE_FRAG` shaders per design §D3 to brighten the rim glow and add an outer glow when `vSelected > 0.5`.
- [ ] **4.4** Expose a raycast helper: given a screen-space pointer position, find the nearest node within a 40 px radius. Used by long-press hit testing.
- [ ] **4.5** Playwright mobile-viewport test: long-press a node → verify the selection state prop receives the node ID + a set of flood-filled neighbors.

## Group 5 — Cluster sheet + save flow (depends on Group 4)

- [x] **5.1** Create `web/src/components/ClusterSheet/ClusterSheet.tsx`: a bottom sheet on mobile, a right-side slide-over on desktop (same pattern as `GraphDetailPanel`). Fields: name (required, 60 chars), note (optional, 280 chars). Haptic on save. Keyboard shortcuts: Cmd/Ctrl+Enter to save, Esc to cancel.
- [ ] **5.2** Wire `createGraphCluster` mutation into `GraphClient` with `cache.modify` to prepend the new cluster onto the `graphClusters` root field. Mirror the archive/delete cache pattern from `864e718`.
- [ ] **5.3** Close the sheet on success + show toast "Cluster saved". Clear selection state.
- [ ] **5.4** Error path: if the mutation fails, keep the sheet open, show inline error, rollback nothing (selection survives).
- [x] **5.5** Storybook story for ClusterSheet: default, full note, empty state, disabled save button.

## Group 6 — Cluster list + restore (depends on Group 5)

- [ ] **6.1** Add a "Clusters" affordance to the `GraphFilterPanel` — a button that opens a `ClusterListSheet`.
- [ ] **6.2** Create `ClusterListSheet` — lists all user clusters via `graphClusters` query, each row = name + note preview + node count + timestamp.
- [ ] **6.3** Row tap → restore the selection (`setSelectedClusterNodeIds(new Set(cluster.nodeIds))`), compute center of mass, and call the renderer's camera-framing helper.
- [ ] **6.4** Add a camera-framing helper to ThreeGraphRenderer: given a target `{ x, y, z }` and a radius, interpolate the camera to frame it over 600 ms.
- [ ] **6.5** Row long-press → delete confirm dialog, `deleteGraphCluster` mutation, cache filter.

## Group 7 — Annotation layer (parallel with Groups 5 and 6)

- [ ] **7.1** Create `web/src/components/ThreeGraphRenderer/AnnotationLayer.ts`. Exports a class that takes a Three.js `Scene` and an annotation list, and manages sprite creation/disposal.
- [ ] **7.2** Implement `bakeAnnotationTexture(text: string, theme: 'light' | 'dark'): THREE.CanvasTexture` using a shared OffscreenCanvas. Use `var(--foreground)` / `var(--surface-floating)` values at bake time. Bake at `devicePixelRatio * 2` for retina sharpness.
- [ ] **7.3** Sprite positioning: anchor to node or cluster center-of-mass, apply optional `offsetX/Y/Z` from the entity.
- [ ] **7.4** Per-frame: update sprite world position from the simulation (anchors follow their nodes) and fade sprites below projected size of 8 px.
- [ ] **7.5** Create `AnnotationComposer.tsx` — a floating input that opens when the user picks "annotate" on a focused node or cluster. 280-char limit, shows live preview on the 3D canvas.
- [ ] **7.6** Wire `createGraphAnnotation` / `updateGraphAnnotation` / `deleteGraphAnnotation` mutations with cache updates.
- [ ] **7.7** Playwright test: create an annotation, verify it renders as a sprite, delete it, verify it disappears without a layout restart.

## Group 8 — Accessibility + keyboard (depends on Groups 3-7)

- [ ] **8.1** Add arrow-key traversal to ThreeGraphRenderer: focused node changes via `Arrow*` keys walking neighbors. Announce via `aria-live="polite"`.
- [ ] **8.2** Add `Space` to toggle in selection, `Enter` to open ClusterSheet, `Esc` to clear.
- [ ] **8.3** Add a screen-reader-only summary: "Graph with N cards, M clusters. 2 selected." Updates via `aria-live` on state change.
- [ ] **8.4** Axe audit: zero critical violations on the graph page with a saved cluster, an annotation, and mid-selection state.

## Group 9 — Performance validation (depends on Groups 4, 7)

- [ ] **9.1** Playwright performance benchmark: 500 nodes, 3 clusters (~100 nodes each), 50 annotations. Target: 60 fps sustained over 10 s of tilt + pan. Failure budget: < 5% dropped frames.
- [ ] **9.2** Memory benchmark: create 100 annotations, delete them, verify heap returns to baseline ±10%.
- [ ] **9.3** Lighthouse mobile: `/graph` page score ≥ 90 with clusters/annotations present.

## Group 10 — Ship

- [ ] **10.1** Feature flag `byoa_3d_clusters` in Settings → Experimental, off by default.
- [ ] **10.2** Update `TECHSTACK.md` Graph Renderer Architecture section with the annotation layer details.
- [ ] **10.3** Move v0.7 Dimensions & Clusters items from "In Progress" to "Completed" in `ROADMAP.md`.
- [ ] **10.4** Announcement copy + short Loom for the changelog.

## Dependencies

```
Group 1 ────► Group 2 ────► Group 3 ────► Group 4 ──┬──► Group 5 ──► Group 6
                                                     └──► Group 7
Groups 5,6,7 ──► Group 8 ──► Group 9 ──► Group 10
```

- Groups 1+2 (data + API) are the critical path — nothing else compiles without them.
- Groups 5 (cluster sheet), 6 (list), 7 (annotations) are parallelizable after Group 4 lands.
- Group 8 (a11y) and Group 9 (perf) are the last gates before ship.
