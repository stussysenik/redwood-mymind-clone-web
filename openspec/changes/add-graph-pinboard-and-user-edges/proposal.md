## Why

BYOA's 3D graph is an *observation* tool. You can see the auto-computed shared-tag edges, focus a node, long-press to flood-fill a cluster — all read-only acts of looking. None of it lets you *author* the graph. You cannot say "these two cards belong together" unless they happen to share a tag. You cannot write the connection that lives in your head but not in the data.

Two concrete missing primitives:

1. **Pinning.** There is no way to say "I am thinking about this card right now." A long-press starts a cluster flow; a click opens the detail panel; neither survives a page reload or a focus shift to a different node. The user has no persistent scratchpad.
2. **User-authored edges.** Every edge in `graphData.links` comes from the tag-similarity index (`web/src/lib/graph.ts` computes them). There is no way to write an edge the user cares about but that isn't supported by tag overlap — the exact edges that are most meaningful, because they encode a connection the automated system would not have found.

The user experience we want is small and concrete:

1. Pin a card. A small "pinboard" palette appears docked to the top-left of the 3D canvas — a horizontal row of pinned card thumbnails, recency-sorted.
2. Pin a second card. The pinboard now has two chips.
3. Tap both chips so they enter the "selected to connect" state. A `Connect` button appears in the pinboard's right edge.
4. Tap Connect. A small sheet opens with an optional label input ("connects to" placeholder, 60 chars max) and an optional note textarea (280 chars max).
5. Save. The edge is persisted to Postgres and immediately rendered in the 3D canvas as a visually distinct line — accent color, thicker, slightly dashed. The pinboard clears its selection.
6. Refresh the page. The pinboard comes back with its pins. The edge comes back in the canvas.

The pinboard + user-edges overlay are the user's **personal** knowledge graph drawn on top of the automated shared-tag graph. The automated graph provides shape; the overlay provides meaning. Together they produce insight that neither layer could produce alone. This change is the smallest thing that delivers that.

## What Changes

### New — `Card.pinnedAt` timestamp column

- `prisma/schema.prisma` adds `pinnedAt DateTime? @map("pinned_at") @db.Timestamptz` to the `Card` model.
- `@@index([userId, pinnedAt(sort: Desc)], map: "idx_cards_user_pinned")` for fast "my pinboard, newest first" queries.
- One new migration.
- `pinnedAt === null` means not pinned. Not-null means pinned at that time; the pinboard sorts by this column descending.

**Why a timestamp column and not a separate `GraphPin` model:** pinning is a first-class property of a Card in this product (like `archivedAt`, which is already a column). A Card has at most one pin state, so a join table would add indirection with no payoff. A timestamp is strictly more information than a boolean (free recency sort). The existing `archivedAt`, `deletedAt`, `titleEditedAt` pattern in the schema makes this the idiomatic shape.

### New — `GraphLink` entity (user-authored edges)

- New Prisma model:
  ```prisma
  model GraphLink {
    id           String   @id @default(cuid())
    userId       String   @map("user_id")
    sourceCardId String   @map("source_card_id")
    targetCardId String   @map("target_card_id")
    label        String?  @db.VarChar(60)
    note         String?  @db.VarChar(280)
    createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
    updatedAt    DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

    @@unique([userId, sourceCardId, targetCardId, label], map: "uniq_graph_links_user_pair_label")
    @@index([userId, createdAt], map: "idx_graph_links_user_created")
    @@index([userId, sourceCardId], map: "idx_graph_links_user_source")
    @@index([userId, targetCardId], map: "idx_graph_links_user_target")
    @@map("graph_links")
  }
  ```
- Directed. `sourceCardId` and `targetCardId` are ordered; swapping them creates a different edge. This is the simplest contract — bidirectional semantics can be layered later as a UI-only concept without schema churn.
- Unique constraint on `(userId, sourceCardId, targetCardId, label)` so duplicating a label on the same pair is a no-op but labeling the same pair twice with different labels is allowed (e.g., "references" AND "contradicts").
- **Out of scope:** self-loops (`sourceCardId === targetCardId`) — validated away at the service layer.

### New — GraphQL surface

- `Query.graphPinnedCards: [Card!]!` — returns the caller's pinned cards sorted by `pinnedAt DESC`.
- `Query.graphLinks: [GraphLink!]!` — returns all user-authored edges for the caller.
- `Mutation.pinCard(id: String!): Card!` — sets `Card.pinnedAt = now()` scoped to caller's cards.
- `Mutation.unpinCard(id: String!): Card!` — sets `Card.pinnedAt = null`.
- `Mutation.createGraphLink(input: CreateGraphLinkInput!): GraphLink!` where `input = { sourceCardId, targetCardId, label?, note? }`. Rejects self-loops. Rejects if either card does not belong to the caller. Rejects duplicates on the unique index with a friendly error.
- `Mutation.updateGraphLink(id: String!, input: UpdateGraphLinkInput!): GraphLink!` — updates `label` and/or `note`; `sourceCardId` and `targetCardId` are immutable (delete + recreate instead).
- `Mutation.deleteGraphLink(id: String!): GraphLink!`.

All mutations and queries are `@requireAuth` + user-scoped. A user can never read or mutate a link whose `userId !== context.currentUser.id`.

### New — capability: `graph-pinboard`

The client-side primitive: a pinboard palette that shows the user's pinned cards, lets them toggle a two-way selection for connecting, and docks to the 3D graph canvas. See `specs/graph-pinboard/spec.md` for the full contract.

### New — capability: `graph-user-edges`

The client-side primitive: the `Connect` workflow (a `ConnectLinkSheet`), the persistent rendering of user-authored edges in all three renderers, and the manual-links list sheet for browsing/deleting. See `specs/graph-user-edges/spec.md` for the full contract.

### Modified — capability: `graph-view-overhaul`

- The `GraphDetailPanel` head row gains a **pin toggle** button sibling (next to the close X, same 48 × 48 hit target), wired to `pinCard` / `unpinCard`. Visual state: filled pin icon + accent background when `pinnedAt != null`; outline pin icon + neutral background otherwise. `aria-pressed` mirrors the state.
- The 3D canvas gains the **pinboard palette** — a horizontal strip of pinned card chips, rendered absolute-positioned at `top: 64px, left: 16px` (below the filter hint, above the clusters button on mobile). The palette is hidden when `pinnedCardIds.size === 0`.
- The **graphData links** threading: `GraphClient` merges `userLinks` (from the query) into the `graphData.links` array passed to every renderer. User-authored links carry an extra field `userAuthored: true`. Each renderer (`ForceGraphCanvas` 2D, `ThreeGraphRenderer`, `WebGLGraphRenderer`) draws `userAuthored` edges with the accent color, 1.4× base thickness, and a short dash pattern to distinguish them from tag-edges.

## Capabilities

### New Capabilities

- **`graph-pinboard`** — A persistent set of user-pinned cards rendered as a docked palette in the 3D canvas. Supports pin/unpin from the detail panel, tap-to-toggle selection within the palette for multi-select operations, and a `Connect` affordance that activates when exactly two pinned cards are selected.
- **`graph-user-edges`** — Persistent user-authored directed edges between two cards. Supports create (from pinboard Connect flow), read (surfaced in the graph canvas and in a manual-links list sheet), update (label and note only), and delete. Rendered in all three graph renderers visually distinct from auto-computed tag edges.

### Modified Capabilities

- **`graph-view-overhaul`** — extends the detail panel head row with a pin toggle, adds a pinboard palette to the 3D canvas chrome, and teaches every renderer to distinguish `userAuthored` edges from tag edges.

### Not touched

- **`graph-clusters`** — the cluster long-press flow and save sheet are untouched. Clusters and user-edges are complementary: a cluster is a named set of nodes, a user-edge is a named edge between two cards. They coexist in the canvas without interaction.
- **`graph-annotations`** — untouched.

## Impact

- **Schema**
  - `Card.pinnedAt` column + index (one migration).
  - `GraphLink` new model + three indexes + one unique constraint (same migration).
- **API** (`api/src/graphql/graphLink.sdl.ts`, `api/src/graphql/card.sdl.ts` extended, `api/src/services/graphLinks/`, `api/src/services/cards/` extended)
  - ~200 LOC of new service code (create, read, update, delete graphLinks; pinCard, unpinCard, graphPinnedCards, graphLinks resolvers).
  - Strict `@requireAuth` + user-scoping on every resolver. A user's `currentUser.id` is the tenant boundary; violating it is a `ForbiddenError`.
  - Self-loop validation in `createGraphLink` — throws `UserInputError` if `sourceCardId === targetCardId`.
  - Unique-constraint violation translated to a friendly `UserInputError` with code `GRAPH_LINK_DUPLICATE`.
- **Web**
  - New `web/src/components/GraphPinboard/GraphPinboard.tsx` (~180 LOC) — the palette, chip, selection state, `Connect` button.
  - New `web/src/components/ConnectLinkSheet/ConnectLinkSheet.tsx` (~120 LOC) — the label + note sheet, same visual language as `ClusterSheet`.
  - New `web/src/components/ManualLinksSheet/ManualLinksSheet.tsx` (~140 LOC) — the list sheet (source → label → target rows + delete).
  - `GraphClient.tsx` gains `usePinnedCards` and `useGraphLinks` Apollo queries (~40 LOC), merges `userLinks` into `graphData.links`, passes the pinboard props and the connect handler (~80 LOC).
  - `GraphDetailPanel.tsx` gains the pin toggle button next to the close X (~30 LOC); wires it to `onPinToggle` prop (passed from `GraphClient`).
  - `ThreeGraphRenderer.tsx`, `WebGLGraphRenderer.tsx`, and the 2D `linkCanvasObject` at `GraphClient.tsx` each gain a branch for `userAuthored` edges (~20 LOC each).
- **Tests**
  - Jest/RTL: `GraphPinboard.test.tsx` (render pins, toggle selection, Connect button enable/disable).
  - Jest/RTL: `ConnectLinkSheet.test.tsx` (label length cap, save flow, cancel flow).
  - Jest/RTL: `ManualLinksSheet.test.tsx` (delete confirmation, list sort by `createdAt DESC`).
  - Jest/RTL: `GraphDetailPanel.test.tsx` extends existing suite with pin toggle tests.
  - Service: `graphLinks.service.test.ts` (create/read/update/delete + authz + self-loop + duplicate).
  - Service: `cards.service.test.ts` (pinCard / unpinCard authz).
  - Playwright: end-to-end pinboard flow on `/graph` — pin two cards, select them, connect with label "references", reload, verify the edge persists and is rendered in 3D mode.
- **Performance**
  - User-edges are fetched once on `GraphClient` mount (single GraphQL query, indexed read). Typical user has 0–50 user-edges initially; we cap rendering at 5000 for safety.
  - The pinboard palette is constrained to 24 visible chips (horizontal scroll beyond that) so the DOM stays light.
  - No per-frame cost in the renderer beyond the extra `userLinks.length` lines, which are drawn in the same line segment pass as tag-edges for 2D/WebGL, and added to the same `LineSegments` buffer for Three.
- **Breaking changes** — none. `graphData.links` gains an optional `userAuthored?: boolean` field; existing readers that ignore it continue to work.

## Sequencing and relationship to other changes

- **Blocked by none.** This change can land independently of `unify-graph-focus-one-click`, `fix-3d-pixel-precise-hover`, and `3d-clusters-and-annotations`.
- **Benefits from `fix-3d-pixel-precise-hover`** — the picker precision fix makes pinning from the canvas (click the pin icon on a hovered node) reliable. If `fix-3d-pixel-precise-hover` has not landed, the pin flow still works through the detail panel head row.
- **Benefits from `unify-graph-focus-one-click`** — the detail panel head row is the natural home for the pin toggle; the one-click-open work establishes the head row as an interactive button region. If `unify-graph-focus-one-click` has not landed, the pin toggle can still dock next to the close X as a sibling.
- **Coexists with `3d-clusters-and-annotations`** — long-press creates a cluster, tap creates a focus, pin creates a pin. Three distinct persistent primitives at three distinct gestures.

## Out of Scope

- **Undirected edges.** MVP is directed. A future change can add a UI affordance to render a pair of reciprocal edges as a single line; the schema supports this without migration.
- **Editable source/target on an existing edge.** Today's `updateGraphLink` edits label and note only. Changing an edge's endpoints means delete + recreate. This is deliberately simple and avoids the "what happens to referenced notes and positions" ambiguity.
- **Rich edge types (taxonomy, colors per label).** Label is free text. A tag-style taxonomy can be layered later without schema churn.
- **Automatic connection suggestion.** No inference. The user authors every edge by hand. Inference is a separate, larger workstream.
- **Pinning clusters or annotations.** Pins only apply to Cards for now. Cluster- or annotation-level pins are a separate concept that does not belong in this change.
- **Pinboard persistence across devices.** Pins already persist via `Card.pinnedAt` (server-side state), so any signed-in device sees the same pinboard. No explicit "sync" layer is needed.
- **Drag-to-reorder the pinboard.** Pinboard order is `pinnedAt DESC`. Manual ordering is a separate UX question.
- **Edge labels rendered in the 3D canvas as text.** MVP distinguishes user edges visually (color + thickness + dash) but does NOT render the label text in 3D. Label visibility is handled by the `ManualLinksSheet` list and by hovering the edge in a future edge-picking change.
- **Deleting a pinned card.** If a user deletes a Card that is pinned or that participates in a `GraphLink`, the existing `Card.deletedAt` cascade naturally hides it from queries. Hard deletion of orphan `GraphLink` rows happens via a scheduled cleanup job — out of scope for this change; a follow-up change will handle the cleanup.
