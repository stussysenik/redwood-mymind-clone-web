## Capability: graph-clusters

Closes the end-to-end gap between the shipped `graph-clusters` data layer (Prisma models, SDL, services, selection state machine) and a user-visible flow: long-press a node, name the cluster, save it, view the saved list, restore it, delete it. This delta is the minimum additional behavior that makes cluster creation *reachable* from the UI.

## ADDED Requirements

### Requirement: Migration applied to the live database

The `add_graph_clusters_and_annotations` Prisma migration MUST be applied to the production Supabase database before any cluster-related UI is exposed. Applying means: `yarn rw prisma migrate deploy` runs without error against `DATABASE_URL`, and both `graph_clusters` and `graph_annotations` tables exist.

#### Scenario: graphClusters query returns an empty array, not a table-missing error

Given the migration has been applied to Supabase,
When a logged-in user sends `query { graphClusters { id } }` to `/graphql`,
Then the response is `{ data: { graphClusters: [] } }` and is NOT `{ errors: [{ message: "The table public.graph_clusters does not exist..." }] }`.

#### Scenario: createGraphCluster persists successfully

Given the migration has been applied and a valid cluster input,
When `createGraphCluster` is called with a name, optional note, and a non-empty `nodeIds` array,
Then the mutation returns the created cluster with a valid `id`, and the row is visible in a subsequent `graphClusters` query.

### Requirement: Long-press on a 3D node opens the cluster sheet with a flood-filled selection

When `ThreeGraphRenderer` fires `onLongPressNode(nodeId)`, `GraphClient` MUST:

1. Run `floodFillFromAnchor(nodeId, 2)` (the existing pure helper) and set `selectedClusterNodeIds` to the resulting set.
2. Set `selectionAnchorId` to the pressed node id.
3. Open `ClusterSheet` with the name input focused and empty.

The sheet MUST NOT open if the flood-fill result is empty (defensive guard against unknown node ids).

#### Scenario: 2-hop flood-fill seeds the selection

Given node `A` has neighbors `B` and `C`, and `B` has neighbors `D` and `E`,
When the user long-presses node `A`,
Then `selectedClusterNodeIds` contains exactly `{A, B, C, D, E}` and the ClusterSheet opens with the name input focused.

#### Scenario: Cancelling via Esc preserves selection

Given the ClusterSheet is open after a long-press,
When the user presses `Esc`,
Then the sheet closes but `selectedClusterNodeIds` is unchanged (the user can re-open the sheet without re-selecting).

### Requirement: Cluster save mutation persists and updates the cache

`ClusterSheet`'s Save button MUST call `createGraphCluster` with `{ name, note, nodeIds: Array.from(selectedClusterNodeIds) }`. On success, the Apollo cache MUST be updated via `cache.modify` to prepend the new cluster onto the root `graphClusters` field — no refetch, no graph data invalidation, no simulation resettle.

On success: the sheet closes, the selection clears, and a toast with the message "Cluster saved" appears.

On failure: the sheet stays open, an inline error is shown, and the selection is preserved.

#### Scenario: Save creates a cluster and it appears immediately in the list

Given a selection of 4 nodes and a name "Ando books",
When the user taps Save in the ClusterSheet,
Then `createGraphCluster` is called with the 4 ids and the name, the sheet closes, the selection clears, and opening `ClusterListSheet` shows "Ando books" at the top of the list within the same render cycle (no refetch).

#### Scenario: Save failure preserves state

Given the save mutation returns a network error,
When the error is received by the mutation hook,
Then the ClusterSheet stays open with the inline error "Could not save cluster — try again.", and `selectedClusterNodeIds` is unchanged.

#### Scenario: Duplicate save is a no-op on cache

Given `createGraphCluster` returns a cluster with an id that already exists in the cache,
When the `cache.modify` handler runs,
Then the root `graphClusters` field is unchanged (the `readField('id', ref) === created.id` guard prevents duplicates).

### Requirement: `ClusterListSheet` lists, restores, and deletes saved clusters

`ClusterListSheet` MUST render a sheet (bottom-sheet on mobile, right-side slide-over on desktop) containing a list of the user's saved clusters via `useQuery(GRAPH_CLUSTERS_QUERY)`. Each row MUST display the cluster name (prominent), a 60-character truncation of the note (muted, single line), a pill showing the node count, and a relative timestamp (e.g. "3 days ago").

Tapping a row MUST:

1. Close the sheet.
2. Set `selectedClusterNodeIds` to `new Set(cluster.nodeIds)`.
3. If `graphDimension === '3d'`, compute the cluster's center of mass and bounding radius from the current simulation positions and call the renderer's `frameTo(center, radius)` method.

Long-pressing a row MUST open a `ConfirmDialog` ("Delete cluster?"). On confirm, `deleteGraphCluster` MUST be called, and the cache MUST be updated via `cache.modify` to filter the deleted cluster out of the root `graphClusters` field.

#### Scenario: List renders saved clusters

Given the user has saved 3 clusters,
When they open `ClusterListSheet`,
Then 3 rows appear with name, note preview, node count, and timestamp.

#### Scenario: Row tap restores selection and frames camera

Given the user is in 3D mode and taps a row for a 12-node cluster,
When the row tap is handled,
Then the sheet closes, `selectedClusterNodeIds` contains the 12 node ids, and the Three camera interpolates to frame the cluster's bounding sphere over 600 ms.

#### Scenario: Row tap in 2D restores selection without camera frame

Given the user is in 2D mode and taps a row,
When the row tap is handled,
Then `selectedClusterNodeIds` updates but no `frameTo` call is made (2D renderers do not expose that method).

#### Scenario: Long-press row + confirm delete removes the cluster from cache

Given the user long-presses a row and confirms the delete dialog,
When the delete mutation returns successfully,
Then the row disappears from the sheet without a refetch, and a subsequent `graphClusters` query returns the remaining clusters.

#### Scenario: Long-press row + cancel delete is a no-op

Given the user long-presses a row and cancels the delete dialog,
When the dialog closes,
Then the cluster remains in the list and no mutation is called.

### Requirement: `frameTo` imperative method on `ThreeGraphRenderer`

`ThreeGraphRenderer` MUST expose `frameTo(target: Vector3, radius: number): void` via `forwardRef` so parent components (specifically `GraphClient` on cluster restore) can programmatically frame a point in the scene.

The method MUST interpolate the perspective camera's position from its current value to a new position that places the target in view with `1.4 × radius` padding over 600 ms using ease-out cubic easing.

The method MUST be a no-op when `graphDimension === '2d'` is effectively active — either because the component is not mounted (expected) or as a defensive early return if called from a stale ref.

#### Scenario: frameTo moves the camera to the target

Given `frameTo({ x: 400, y: 300, z: 50 }, 120)` is called,
When 600 ms elapse,
Then the perspective camera's position has interpolated to a point that centers the target with room for a sphere of radius `120 * 1.4 = 168` units.

#### Scenario: frameTo is callable while tilt animation is active

Given the user is mid-drag on the tilt handle,
When `frameTo` is called,
Then the camera interpolation runs to completion without being interrupted by the tilt drag (the tilt update and the frame interpolation use separate state slots).
