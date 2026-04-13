## Why

BYOA's 3D graph (`ThreeGraphRenderer`) is shipped and visually polished — flat by default, tilt on demand, z-stratified by card type — but today it is strictly read-only. You can look at the shape of your knowledge, but you can't *mark* anything. Users who already use the 3D view report a consistent pattern: they find a tight cluster of cards connected by shared tags, they want to remember it, they want to write a short note explaining *why* this cluster matters to them — and today they have nowhere to put that.

Three concrete gaps:

1. **No way to capture a cluster.** You can focus a single node (`focusedNodeId`), but a cluster is a *set* of connected nodes. The renderer has no multi-select concept.
2. **No way to name a cluster.** Spaces exist, but they're tag-based and coarse. Saying "the books-about-architecture-by-Tadao-Ando subgraph" is not a tag filter — it's a specific set of cards.
3. **No way to annotate in space.** Notes live inside a card's detail modal. There's no concept of a note attached to a *cluster*, or a note rendered in the 3D scene next to the thing it describes.

The user experience we want: long-press a node, feel a haptic tick, watch a flood-fill grow the selection to every card one or two hops away, and when the shape looks right, tap "save cluster" → name it → add a note → done. Tilting the graph later, the saved cluster reappears as a highlighted constellation with its note floating beside it.

This change is the smallest thing that makes the 3D graph *editable*. It is deliberately scoped to **manual** clustering — automatic community detection (Louvain, label propagation) is on the v0.9 roadmap and is a separate, larger workstream.

## What Changes

### New — Graph Clusters

- A `GraphCluster` entity: `{ id, userId, name, note, nodeIds[], createdAt, updatedAt }` stored in Postgres via Prisma.
- A GraphQL surface:
  - `Query.graphClusters(spaceId: String): [GraphCluster!]!`
  - `Mutation.createGraphCluster(input: CreateGraphClusterInput!): GraphCluster!`
  - `Mutation.updateGraphCluster(id: String!, input: UpdateGraphClusterInput!): GraphCluster!`
  - `Mutation.deleteGraphCluster(id: String!): GraphCluster!`
- A client-side selection model in `GraphClient`: `selectedClusterNodeIds: Set<string>` plus a flood-fill helper that grows the selection by N hops from a seed node.
- A long-press interaction on `ThreeGraphRenderer` (mobile-first, pointer-based) that:
  1. Fires `haptic('medium')` on press threshold (300 ms)
  2. Runs the flood-fill from the pressed node
  3. Shows a radial floating action with three items: `+ grow`, `− shrink`, `save cluster`
- A "save cluster" sheet: name input (required, 60 chars), note textarea (optional, 280 chars), `Save` / `Cancel`.
- A clusters list sheet (reachable from the filter panel) that lists saved clusters, each as a row with name + note preview + node count. Tapping a cluster re-enters 3D with the selection restored and the camera framed around the cluster's center of mass.

### New — Graph Annotations

- A `GraphAnnotation` entity: `{ id, userId, anchorType, anchorId, text, position, createdAt, updatedAt }` where `anchorType ∈ { 'node', 'cluster' }`, `anchorId` is the card ID or cluster ID, `text` is a 280-char note, `position` is an optional offset from the anchor in 3D space.
- `Query.graphAnnotations(spaceId: String): [GraphAnnotation!]!` + CRUD mutations.
- Rendered in 3D as billboard sprites (camera-facing quads) with the annotation text. Rendering uses a pre-baked canvas texture per annotation so there's no layout cost on tilt/pan. Zero geometry beyond a single quad per annotation.
- A simple creation flow: focus any node or cluster → tap "annotate" → write text → the annotation pins to the anchor and floats in space.

### Modified — `ThreeGraphRenderer`

- Add an optional `clusters: GraphCluster[]` prop. When present, cluster node IDs get a brighter rim glow (handled inside the existing fragment shader via a `uSelected` uniform).
- Add an optional `annotations: GraphAnnotation[]` prop. Render each as a billboard via a new `AnnotationLayer` module that shares the Three.js scene.
- Add a long-press + selection state machine driven by `pointerdown`/`pointermove`/`pointerup`. Touch-first. Mouse users get equivalent behavior via right-click → "select connected".

### Modified — `GraphClient`

- Host the cluster + annotation query results and pass them down to the renderer.
- Host the creation / edit sheet state.
- Pass a `onSaveCluster(nodeIds, name, note)` callback down to the renderer.
- Keyboard fallback: `/` focuses node search → `Enter` enters selection mode → `Space` adds focused node → `Enter` saves.

## Capabilities

### New Capabilities

- **`graph-clusters`** — A cluster is a named, persistent subgraph. Users can create, read, update, delete clusters. Clusters live alongside spaces but are not the same thing: a space is a tag-based view, a cluster is an explicit set of card IDs.
- **`graph-annotations`** — A text note anchored to a node or a cluster, rendered inline in the 3D graph and in the graph list view.

### Modified Capabilities

- **`graph-view-overhaul`** — Gains a multi-select interaction model and a persistent cluster/annotation layer. No breaking changes to the existing `GraphRendererProps` interface; new props are optional.

## Impact

- **Schema**
  - `prisma/schema.prisma`: two new models (`GraphCluster`, `GraphAnnotation`) with `userId` foreign keys and indexes on `(userId, createdAt)`.
  - One new migration.
- **API** (`api/src/graphql/graphCluster.sdl.ts`, `graphAnnotation.sdl.ts`, `services/graphClusters/`, `services/graphAnnotations/`)
  - New SDL files, new service files with strict `@requireAuth` + user scoping (never return a cluster/annotation the requesting user doesn't own).
- **Web** (`web/src/components/ThreeGraphRenderer/`, `GraphClient/`, new `ClusterSheet/`, new `AnnotationLayer/`)
  - `ThreeGraphRenderer` gains ~200 LOC for the selection state machine + annotation layer.
  - `GraphClient` gains mutation wiring + cache updates (same pattern as archive/delete we just landed).
  - New `ClusterSheet.tsx` and `AnnotationComposer.tsx` components.
- **Performance**
  - Annotation billboards are pre-baked to canvas textures. Target: 100 annotations onscreen at 60 fps.
  - Cluster selection runs a BFS bounded by N hops (N = 2 by default) — O(V + E) per flood-fill.
- **Accessibility**
  - Every 3D interaction has a keyboard equivalent.
  - Selection state is announced via `aria-live` regions.
  - Touch targets ≥ 44 px (56 px for the radial menu).
- **No breaking changes.** Existing graph users who never touch the new affordances see no UI change.

## Out of Scope

- Automatic cluster detection (Louvain / label propagation). That's v0.9.
- Collaborative clusters (sharing a cluster with another user). That's v0.8 Collaboration.
- Freeform drawing in the 3D scene. Annotations are text-only in this change.
- Clusters that span across spaces. A cluster belongs to a single space (or no space).
