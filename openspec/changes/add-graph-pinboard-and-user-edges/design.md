# Design — add-graph-pinboard-and-user-edges

## Context

Today `GraphClient.tsx` owns the graph data pipeline: a GraphQL query pulls Cards, `web/src/lib/graph.ts` computes a shared-tag similarity index, and the result becomes the `graphData: { nodes, links }` passed to whichever renderer is active (`ForceGraphCanvas`, `ThreeGraphRenderer`, `WebGLGraphRenderer`). The renderers are read-only: they can report hover and click back to `GraphClient`, but they never write.

This change makes `GraphClient` an author. Three new pieces of persistent state cross the client/server boundary:

1. **Pinned set** — which cards the user currently cares about. Sourced from a new `Card.pinnedAt` column.
2. **User-authored edges** — edges the user wrote by hand, stored in a new `GraphLink` table.
3. **Pinboard selection** — ephemeral, client-only: which pinned chips are currently selected for the Connect action.

The design challenge is making all three feel like one coherent gesture — "I'm thinking about this, and this, and they're connected like this" — without introducing a new mode the user has to learn.

## Guiding principles

1. **Pinning is a first-class Card state, not a graph overlay.** It goes on the Card model, not a separate table. This keeps the pinboard aligned with how the rest of the product treats Card state (archive, delete, tags all live on Card). The graph canvas reads it; the List view and the eventual mobile client will read it for free.
2. **User edges are a separate table because they are a relationship, not a property.** Relationships between two Cards cannot live on one Card without being lied to. `GraphLink` is its own entity.
3. **The pinboard is the single control surface for "what am I doing with these pinned cards?"** — pin, select, connect, unpin. We do NOT add a parallel control surface (context menu, palette command, etc.) that duplicates the same operations.
4. **User edges render in every renderer.** The MVP does not hide them in any renderer — a user who authored an edge in 3D should see it in 2D too. This is a stronger invariant than it sounds: every code path that iterates `graphData.links` must distinguish `userAuthored` from tag-edges.
5. **Undoable, reversible, non-destructive.** Pinning can be unpinned; an edge can be deleted. There is no "permanent" action in the pin/connect flow. This lowers the tax on experimentation.

## Data model decisions

### Why `Card.pinnedAt: DateTime?` instead of a `GraphPin` model

- Pinning is *exclusive per card*: one card → at most one pin state. A join table would carry zero extra structure.
- Four existing Card columns follow the same pattern: `archivedAt`, `deletedAt`, `titleEditedAt`, `descriptionEditedAt`. Extending the convention is idiomatic.
- A timestamp is strictly more useful than a boolean: the pinboard sorts by `pinnedAt DESC` (newest pins first) for free, without a separate sort column.
- A join table would require a cascading delete path when a Card is hard-deleted; the column approach inherits Card's existing delete semantics.

### Why `GraphLink` with a unique constraint on `(userId, sourceCardId, targetCardId, label)`

- **Directed**: swapping source and target creates a different edge. This is the simplest contract. A user who wants to express "these are bidirectional" can do so by creating two edges or, in a future visual change, by clicking a "reciprocal" toggle in the connect sheet that posts the reverse edge atomically.
- **Unique on the tuple, including label**: the same pair with the same label is a duplicate (noise); the same pair with different labels is meaningful ("references" AND "contradicts"). The unique constraint lives in the DB so the service can translate a PostgreSQL unique-violation into a friendly `GRAPH_LINK_DUPLICATE` error.
- **Directed self-loops are rejected at the service layer.** A card pointing at itself is meaningless and breaks the rendering assumption that every edge has two endpoints. Reject with `UserInputError`.
- **`label` is nullable.** A user can create an edge without a label ("I just want them connected"). Labels can be added later via `updateGraphLink`.
- **No `weight` column.** Edge weight is a concept used by the auto-computed tag graph (overlap count). User-authored edges have no such scalar. We store no weight; the renderer treats user edges as weight = ∞ (always drawn, never filtered by the `minWeight` slider).

### Why no `GraphLink.spaceId`

- The automated tag graph is scoped to the current space filter at render time, not at storage time. User edges follow the same contract: they belong to the user, and the client decides which space view they appear in. This avoids a combinatorial "one edge per space" duplication.
- If a user wants a space-specific edge view, the client filters `userLinks` down to only those where both endpoints' Cards match the space filter — the same filter the tag-edges already pass through.

## Client state topology

```
GraphClient.tsx
├── useGraphCards (existing query)
├── useGraphPinnedCards (NEW query)      → pinnedCards: Card[]
├── useGraphLinks (NEW query)            → userLinks: GraphLink[]
├── pinnedCardIds = new Set(pinnedCards.map(c => c.id))
├── graphData = useMemo(() => ({
│     nodes,
│     links: [...tagEdges, ...userLinks.map(l => ({ ...l, userAuthored: true }))],
│   }), [nodes, tagEdges, userLinks])
├── pinboardSelection: Set<string>       (local useState, ephemeral)
└── renders:
    ├── <ThreeGraphRenderer links={graphData.links} ... />
    ├── <GraphPinboard
    │     pinnedCards={pinnedCards}
    │     selection={pinboardSelection}
    │     onToggleSelect={...}
    │     onUnpin={unpinCardMutation}
    │     onConnect={openConnectSheet}
    │   />
    ├── <ConnectLinkSheet
    │     isOpen={connectSheetOpen}
    │     sourceCard={connectPair.source}
    │     targetCard={connectPair.target}
    │     onSave={(label, note) => createGraphLinkMutation(...)}
    │   />
    ├── <GraphDetailPanel
    │     headItem={...}
    │     isPinned={pinnedCardIds.has(focusedNodeId)}
    │     onTogglePin={(id) => pinCardMutation(id) or unpinCardMutation(id)}
    │   />
    └── <ManualLinksSheet
          userLinks={userLinks}
          onDelete={deleteGraphLinkMutation}
        />
```

The key invariants:
- `graphData.links` is always the union of tag-edges and user-edges. No renderer branches on "which kind" — they read `link.userAuthored` and style accordingly.
- `pinboardSelection` is the only piece of ephemeral state in the chain. Everything else is derived from the server.
- A single Apollo cache update after each mutation keeps the UI in sync without a full refetch.

## Connect-flow state machine

```
State: idle
  ↓ (user pins cards A, B)
State: has-pins {pinnedCardIds: Set<A, B>}
  ↓ (user taps chip A in pinboard)
State: one-selected {pinboardSelection: {A}}
  ↓ (user taps chip B in pinboard)
State: two-selected {pinboardSelection: {A, B}}         — Connect button enabled
  ↓ (user taps Connect)
State: connect-sheet-open {source: A, target: B}        — ConnectLinkSheet mounted
  ↓ (user enters label, taps Save)
State: saving {mutation: createGraphLink in flight}
  ↓ (mutation resolves)
State: has-pins {...}                                   — Selection cleared, sheet closed, new edge visible in canvas
```

- **Ordering**: the chip tapped first is `source`. Second tap is `target`. This is the simplest rule a user can learn ("tap the one you're starting from first") and it makes the Connect sheet's "A → B" header unambiguous.
- **Three-tap ambiguity**: if a user taps a third chip while two are already selected, the oldest selection is evicted (FIFO, capacity 2). The `Connect` button remains enabled. The rule is the same as every popular "compare two items" product UX.
- **Cancel**: tapping a selected chip deselects it. Tapping outside the pinboard does not deselect — selection is sticky until an explicit action.
- **Connect sheet dismissal without save**: selection is preserved (user changed their mind about label, not about connecting). This is the forgiving default.

## Renderer integration

Each renderer gains a branch:

- **`ThreeGraphRenderer`** — user-edges join the same `LineSegments` buffer used for tag-edges, but live in a *second* `LineSegments` object with its own material (accent color, thicker line width, transparent dashed pattern via `LineDashedMaterial`). The edge count stored in the second buffer is `userLinks.length`; updates happen when `links` prop changes.
- **`WebGLGraphRenderer`** — adds a uniform `uUserAuthored[]` array aligned to the link buffer; the fragment shader multiplies color and alpha based on whether the link's index is flagged user-authored. Capacity cap: 5000 user-edges per renderer instance (matches existing `MAX_LINKS`).
- **`ForceGraphCanvas` 2D path** — the `linkCanvasObject` callback (in `GraphClient.tsx`) branches on `link.userAuthored` and draws accent color + thicker stroke + short dash. No new material.

The three renderers agree on the visual language (accent color, 1.4× thickness, 6-px dash, 3-px gap) so switching 2D↔3D feels continuous.

## API authorization model

Every `graphLinks.*` service function is user-scoped:

```
createGraphLink(input, { context }):
  1. require context.currentUser
  2. source = db.card.findFirst({ where: { id: input.sourceCardId, userId: currentUser.id } })
  3. target = db.card.findFirst({ where: { id: input.targetCardId, userId: currentUser.id } })
  4. if (!source || !target) throw ForbiddenError
  5. if (input.sourceCardId === input.targetCardId) throw UserInputError('Cannot connect a card to itself')
  6. try db.graphLink.create(...)
     catch P2002 (unique violation) → throw UserInputError('This connection already exists', code: 'GRAPH_LINK_DUPLICATE')
```

This pattern is identical to the existing `GraphCluster` service. The tenancy boundary is `currentUser.id`; there is no other axis.

## Error handling and user feedback

- **Create edge: duplicate** — toast: "These cards are already connected with that label."
- **Create edge: self-loop** — client-side guard disables the Connect button when `source === target`; if somehow bypassed, toast: "A card can't connect to itself."
- **Create edge: permission denied** — toast: "Those cards aren't yours." (Effectively unreachable unless the client state is stale relative to the server.)
- **Pin / unpin failure** — optimistic update rolls back, toast: "Couldn't update pin." The pinboard chip flips back to its prior state.
- **Delete link: network failure** — retry silently once; if the second attempt fails, the row re-appears in `ManualLinksSheet` and a toast asks the user to retry.

All errors surface as toasts (consistent with the rest of the app) — per the memory "feedback_no_error_banners", we never show inline error banners for non-critical failures.

## Accessibility

- **Pinboard palette**: `role="toolbar"`; each chip is a `button` with `aria-pressed` reflecting selection state; `aria-label="Pinned: {title}. Selected for connect."` when selected. Keyboard navigation: arrow keys move focus within the toolbar, Space toggles selection, Enter activates the Connect button when two are selected.
- **Pin toggle in detail panel**: `<button aria-pressed={isPinned} aria-label={isPinned ? "Unpin {title}" : "Pin {title}"}>`.
- **ConnectLinkSheet**: `role="dialog"` with `aria-labelledby` pointing at the header "Connect {source} → {target}"; label input gets `maxLength=60` and a live character count; note textarea same at 280.
- **ManualLinksSheet**: `role="list"`, each row is a `listitem` with a visually distinct delete button (48 × 48 hit area).
- **Reduced motion**: the pinboard's enter animation, the ConnectLinkSheet's slide-up, and the user-edge's "just drawn" pulse are all wrapped in `@media (prefers-reduced-motion: no-preference)`.
- **48 px touch targets** on every interactive element, matching the `unify-graph-focus-one-click` baseline.

## Risks

- **Schema migration timing.** The `Card.pinnedAt` column + the `GraphLink` model both ship in one migration. If the migration fails mid-apply in production, the rollback must be scripted. Mitigation: `pinnedAt` is nullable and `GraphLink` is a brand new table — the migration is strictly additive. Down-migration drops both without touching existing data.
- **Duplicate edges racing the unique constraint.** Two browser tabs connecting the same pair of cards simultaneously will hit the unique index. Mitigation: catch PostgreSQL P2002 and surface the friendly `GRAPH_LINK_DUPLICATE` error; the second tab's UI refetches and shows the already-created edge.
- **Renderer divergence.** Three renderers must agree on the user-edge visual. Mitigation: a shared `USER_EDGE_STYLE` constant in `web/src/lib/graph.ts` (color, width multiplier, dash pattern), imported by all three paths. A renderer is not allowed to hardcode its own values.
- **Performance cliff at 5000+ user edges.** A power user who has manually connected thousands of cards will see the renderer allocate additional line buffers proportional to user-edge count. Mitigation: `MAX_USER_LINKS = 5000` cap at the service query level; the query returns the 5000 most recent. Users past that number see a "you have more than 5000 connections; some are hidden" hint in `ManualLinksSheet`. Unlikely to bite in v1.
- **Pinboard spatial collision with cluster button / filter panel.** The canvas already hosts several floating UI elements. Mitigation: the pinboard docks to `top: 64px, left: 16px`, which is unused space below the filter hint. When empty, it does not render at all. On mobile where horizontal space is tight, the pinboard chips horizontal-scroll inside a bounded container.
- **GraphLink orphaned by Card deletion.** Hard-deleting a Card leaves `GraphLink` rows pointing at a nonexistent id. Mitigation: the `graphLinks` query joins Card and filters rows where either endpoint is missing; a scheduled job cleans truly orphan rows weekly. The join-filter is the safety net; the cleanup job is hygiene.

## Non-risks

- **No changes to Card embedding or tag pipeline.** Pinning and user-edges live alongside the existing graph data, not inside it.
- **No changes to space filtering.** The space filter operates on Cards; user-edges filter client-side by "both endpoints visible".
- **No new auth logic.** `@requireAuth` + user-scoping is the same pattern as every other mutation in the codebase.

## Open questions

*None blocking.* All of the following are intentional MVP omissions documented in "Out of Scope":

1. Undirected edge rendering as a single line (v1.1).
2. Drag-to-reorder the pinboard (probably never — `pinnedAt DESC` is the right default).
3. Edge-picking in the 3D canvas (separate change; needed for "click an edge to edit its label").
4. Edge labels rendered as text in the 3D canvas (separate change, shares infra with `3d-clusters-and-annotations` billboards).
