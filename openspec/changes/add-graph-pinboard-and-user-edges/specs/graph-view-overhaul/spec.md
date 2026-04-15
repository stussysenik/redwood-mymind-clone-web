## Capability: graph-view-overhaul

Extends the focused-node detail panel with a pin toggle, adds the pinboard palette to the 3D graph canvas chrome, and teaches every renderer to merge user-authored edges from `graph-user-edges` into the standard `graphData.links` array so they render in-place alongside auto-computed tag edges.

## ADDED Requirements

### Requirement: Detail panel head row exposes a pin toggle

The `GraphDetailPanel` component MUST accept two new props — `isPinned: boolean` and `onTogglePin: () => void` — and render a pin toggle button as a sibling of the close X button in the panel's top-right region. The pin toggle MUST NOT be nested inside the head row `<button>` (a button cannot contain another button). It MUST be a standalone `<button>` with a 48 × 48 CSS-pixel minimum hit area.

The pin toggle MUST reflect the current pinned state through both visual styling and ARIA:
- When `isPinned === true`: filled pin icon, background `var(--surface-accent)`, `aria-pressed="true"`, `aria-label="Unpin {title}"`.
- When `isPinned === false`: outline pin icon, transparent background, `aria-pressed="false"`, `aria-label="Pin {title}"`.

The pin toggle MUST render a visible `:focus-visible` outline of at least 2 px width with 2 px offset matching the senior-accessibility baseline established by `unify-graph-focus-one-click`.

Clicking the pin toggle MUST call `onTogglePin` exactly once. It MUST NOT call `onCardClick` — pinning and opening are separate, non-overlapping actions.

#### Scenario: Unpinned state renders outline icon

- **GIVEN** `GraphDetailPanel` rendered with `isPinned={false}`,
- **WHEN** the DOM is inspected,
- **THEN** the pin toggle has `aria-pressed="false"`,
- **AND** the icon rendered inside it is the outline variant,
- **AND** its background color is not the surface-accent color.

#### Scenario: Pinned state renders filled icon

- **GIVEN** `GraphDetailPanel` rendered with `isPinned={true}` and `nodeTitle="Card A"`,
- **WHEN** the DOM is inspected,
- **THEN** the pin toggle has `aria-pressed="true"`,
- **AND** `aria-label="Unpin Card A"`,
- **AND** the icon rendered inside it is the filled variant.

#### Scenario: Click fires onTogglePin and not onCardClick

- **GIVEN** `GraphDetailPanel` rendered with `isPinned={false}`, `onTogglePin` and `onCardClick` as mock callbacks,
- **WHEN** the user clicks the pin toggle button,
- **THEN** `onTogglePin` is called exactly once,
- **AND** `onCardClick` is NOT called.

#### Scenario: Pin toggle has a 48 px hit area

- **GIVEN** `GraphDetailPanel` rendered in any state,
- **WHEN** the pin toggle's bounding rectangle is measured,
- **THEN** its width is at least 48 CSS pixels,
- **AND** its height is at least 48 CSS pixels.

### Requirement: GraphClient merges user-authored edges into graphData.links

The `GraphClient` component MUST read user-authored edges via `Query.graphLinks` and merge them into the `graphData.links` array passed down to every renderer. Each merged entry MUST carry an additional `userAuthored: true` flag and an optional `label: string | null` field. Merged entries MUST be present in `graphData.links` alongside the auto-computed tag edges without modifying the existing tag-edge shape.

A user-authored edge whose `sourceCardId` or `targetCardId` does not appear in the current `graphData.nodes` (because the space filter excluded it) MUST be omitted from the merged list. Both endpoints visible is a precondition for including the edge.

A user-authored edge MUST bypass the `minWeight` filter. The weight-filter logic MUST treat `userAuthored === true` entries as unconditionally retained.

#### Scenario: User-authored edge is merged into graphData.links

- **GIVEN** `graphLinksQuery` returns one link `{ sourceCardId: A, targetCardId: B, label: "references" }`,
- **AND** both Cards A and B are in `graphData.nodes`,
- **WHEN** `graphData` is computed,
- **THEN** `graphData.links` contains an entry with `source=A, target=B, userAuthored=true, label="references"`,
- **AND** the tag-edge entries are unchanged.

#### Scenario: User-authored edge with filtered endpoint is omitted

- **GIVEN** `graphLinksQuery` returns one link `{ sourceCardId: A, targetCardId: C }`,
- **AND** Card C is not in `graphData.nodes` (excluded by the current space filter),
- **WHEN** `graphData` is computed,
- **THEN** `graphData.links` does not contain any entry pointing at C.

#### Scenario: User-authored edge bypasses minWeight filter

- **GIVEN** `minWeight === 10`,
- **AND** `graphLinksQuery` returns one user-authored edge,
- **WHEN** `graphData.links` is computed,
- **THEN** the user-authored edge is retained,
- **AND** a tag-edge with `weight === 1` is filtered out.

### Requirement: Pinboard palette is rendered within the graph view

The `GraphClient` component MUST render a `GraphPinboard` component as a sibling of the `GraphDetailPanel` when `viewMode === 'graph'` and `pinnedCardIds.size > 0`. The pinboard MUST receive as props: the pinned Cards list (from `graphPinnedCardsQuery`), the current ephemeral `selection: Set<string>`, and callbacks for toggling selection, unpinning a card, and initiating the Connect flow.

When the pinboard's `onConnect(sourceId, targetId)` callback fires, `GraphClient` MUST open the `ConnectLinkSheet` with the corresponding source and target Cards resolved from the `pinnedCards` list. The sheet's save action MUST call the `createGraphLink` mutation and, on success, update the Apollo cache so the new edge appears in `graphData.links` without a full refetch.

`GraphClient` MUST also host a `Connections` button in the `GraphFilterPanel` region that opens the `ManualLinksSheet`. The sheet MUST reflect the `graphLinksQuery` result and route its delete actions through the `deleteGraphLink` mutation with corresponding Apollo cache updates.

#### Scenario: Pinboard appears when a card is pinned

- **GIVEN** `GraphClient` is rendering the 3D graph with zero pinned cards,
- **WHEN** the user clicks the pin toggle in the detail panel for a focused card,
- **AND** the `pinCard` mutation resolves,
- **THEN** the `GraphPinboard` component mounts with a single chip for that card,
- **AND** the pinboard is visible in the top-left of the canvas.

#### Scenario: Connect flow creates a user-authored edge

- **GIVEN** two pinned cards A and B selected in the pinboard,
- **WHEN** the user clicks Connect and saves the sheet with label "references",
- **THEN** the `createGraphLink` mutation is called with `{ sourceCardId: A.id, targetCardId: B.id, label: "references", note: null }`,
- **AND** on success the Apollo cache for `graphLinksQuery` is updated to include the new link,
- **AND** the new link appears in `graphData.links` with `userAuthored=true`,
- **AND** the renderer draws the edge in accent color with dashed stroke.

#### Scenario: ManualLinksSheet deletion removes the edge from the canvas

- **GIVEN** one user-authored edge visible in the 3D canvas,
- **AND** the `ManualLinksSheet` open,
- **WHEN** the user completes the two-tap delete flow on that row,
- **THEN** the `deleteGraphLink` mutation is called,
- **AND** on success the edge is removed from `graphData.links`,
- **AND** the renderer no longer draws that edge.
