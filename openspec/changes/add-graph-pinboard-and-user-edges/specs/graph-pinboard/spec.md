## Capability: graph-pinboard

A persistent set of user-pinned cards rendered as a docked palette in the 3D graph canvas. Supports pin/unpin, tap-to-toggle selection, and a `Connect` affordance that activates when exactly two pinned cards are selected, handing off to the `graph-user-edges` capability to create a persistent directed edge.

## ADDED Requirements

### Requirement: Cards have a persistent pinned state

A Card MUST have an optional `pinnedAt` timestamp (`DateTime | null`) that represents "when the signed-in user marked this card as pinned". `pinnedAt === null` means the card is not pinned; a non-null `pinnedAt` means the card is pinned at that time. Pinned state is a property of the Card, not a separate join table.

The authenticated user MUST be able to read their own pinned cards via `Query.graphPinnedCards`, which returns Cards where `pinnedAt IS NOT NULL` for the current user, sorted by `pinnedAt DESC`, capped at 100 entries. The authenticated user MUST be able to flip a Card's pinned state via `Mutation.pinCard(id)` and `Mutation.unpinCard(id)`, both scoped to Cards they own. Attempting to pin or unpin a Card belonging to another user MUST return a `ForbiddenError`.

`pinnedAt` MUST survive page reloads, cross-device sessions, and server restarts (it is stored in PostgreSQL, not in `localStorage` or ephemeral state).

#### Scenario: Pinning a card persists across reload

- **GIVEN** an authenticated user with a Card they own whose `pinnedAt === null`,
- **WHEN** they call `Mutation.pinCard(id)`,
- **THEN** `Card.pinnedAt` is set to the current time,
- **AND** on a subsequent `Query.graphPinnedCards`, the Card appears in the result list.
- **WHEN** the user reloads the page and the `Query.graphPinnedCards` query runs again,
- **THEN** the Card is still in the result list.

#### Scenario: graphPinnedCards is sorted by pinnedAt descending

- **GIVEN** three Cards pinned at times T1 < T2 < T3,
- **WHEN** `Query.graphPinnedCards` runs,
- **THEN** the result list is `[T3-card, T2-card, T1-card]`.

#### Scenario: graphPinnedCards respects tenant boundary

- **GIVEN** User A has 2 pinned Cards and User B has 3 pinned Cards,
- **WHEN** User A runs `Query.graphPinnedCards`,
- **THEN** the result contains only User A's 2 pinned Cards,
- **AND** User B's Cards are not present.

#### Scenario: pinCard rejects another user's card

- **GIVEN** a Card that belongs to User B,
- **WHEN** User A calls `Mutation.pinCard(that-card-id)`,
- **THEN** the mutation throws `ForbiddenError`,
- **AND** the Card's `pinnedAt` is unchanged.

#### Scenario: Unpinning clears pinnedAt

- **GIVEN** a Card with `pinnedAt !== null`,
- **WHEN** the owning user calls `Mutation.unpinCard(id)`,
- **THEN** `Card.pinnedAt` becomes `null`,
- **AND** the Card no longer appears in `Query.graphPinnedCards`.

### Requirement: Pinboard palette renders in the 3D graph canvas

The `GraphClient` component MUST render a `GraphPinboard` palette docked to the top-left of the graph canvas when `pinnedCardIds.size > 0` and `viewMode === 'graph'`. When `pinnedCardIds.size === 0`, the palette MUST NOT be rendered (the DOM element is absent, not hidden).

The palette MUST show one chip per pinned Card. Each chip MUST display the Card's color dot, a truncated title (28 characters max), and an inline "unpin" affordance. Each chip MUST be at least 48 pixels tall, at least 120 pixels wide, and at most 220 pixels wide. The palette MUST horizontally scroll when there are more chips than visible space, with a visual cap of 24 chips before scrolling takes over.

The palette MUST be positioned at `top: 64px, left: 16px` by default so it does not collide with the filter hint at the top or the clusters button at the bottom. On narrow screens (< 480 px wide), the palette MUST remain horizontally scrollable within its container.

The palette MUST be a `role="toolbar"` with an accessible name "Pinned cards". Each chip MUST be a `<button>` with `aria-pressed` reflecting its selection state and an `aria-label` of the form `"Pinned: {title}"` (when unselected) or `"Pinned: {title}. Selected for connect."` (when selected).

#### Scenario: Empty pinboard does not render

- **GIVEN** `pinnedCards.length === 0`,
- **WHEN** the 3D graph renders,
- **THEN** no `GraphPinboard` element is present in the DOM.

#### Scenario: Palette shows one chip per pinned card

- **GIVEN** `pinnedCards = [A, B, C]`,
- **WHEN** the 3D graph renders,
- **THEN** the palette contains exactly 3 chips in the order A, B, C,
- **AND** each chip renders the corresponding Card's color dot, title, and unpin affordance.

#### Scenario: Palette scrolls beyond 24 chips

- **GIVEN** `pinnedCards.length === 40`,
- **WHEN** the palette renders at a viewport width of 1440 px,
- **THEN** the first 24 chips are visible and the remaining 16 are reachable via horizontal scroll,
- **AND** the container has `overflow-x: auto`.

### Requirement: Pinboard selection is a 2-capacity FIFO for the Connect action

The `GraphPinboard` component MUST maintain a local `selection: Set<string>` of pinned Card ids that are currently staged for the Connect action. Selection follows these rules:

- Tapping a chip that is NOT in `selection` adds it to `selection`.
- Tapping a chip that IS in `selection` removes it from `selection`.
- If tapping a chip would cause `selection.size` to exceed 2, the oldest-added id MUST be evicted first (FIFO, capacity 2). The newly-tapped id is then added.
- The Set MUST preserve insertion order so the first selected chip is the "source" and the second is the "target" of the subsequent Connect action.

The palette MUST render a `Connect` button at the right edge of the strip. The button MUST be disabled whenever `selection.size !== 2` and enabled exactly when `selection.size === 2`. Tapping the enabled Connect button MUST call `onConnect(firstSelectedId, secondSelectedId)` where the order reflects selection insertion order.

Closing the `ConnectLinkSheet` without saving MUST preserve `selection` — the user may have intended to change the label, not the connection. Saving the edge successfully MUST clear `selection`.

Escape MUST clear `selection` when the palette has keyboard focus.

#### Scenario: Connect button is disabled with zero or one selection

- **GIVEN** `selection.size` is 0 or 1,
- **WHEN** the palette renders,
- **THEN** the Connect button has `disabled` and `aria-disabled="true"`,
- **AND** a click on the Connect button does not call `onConnect`.

#### Scenario: Connect button is enabled with exactly two selections

- **GIVEN** two chips A and B are in `selection` (A added first, B second),
- **WHEN** the palette renders,
- **THEN** the Connect button has neither `disabled` nor `aria-disabled="true"`.
- **WHEN** the user clicks the Connect button,
- **THEN** `onConnect(A, B)` fires exactly once with that argument order.

#### Scenario: FIFO eviction when a third chip is tapped

- **GIVEN** `selection === {A, B}` with A added first,
- **WHEN** the user taps chip C,
- **THEN** `selection` becomes `{B, C}` (A evicted, insertion order preserved),
- **AND** the Connect button remains enabled.

#### Scenario: Tapping a selected chip deselects it

- **GIVEN** `selection === {A, B}`,
- **WHEN** the user taps chip B,
- **THEN** `selection` becomes `{A}`,
- **AND** the Connect button becomes disabled.

#### Scenario: Successful save clears selection

- **GIVEN** `selection === {A, B}` and the ConnectLinkSheet is open,
- **WHEN** the user saves a new edge and the `createGraphLink` mutation resolves successfully,
- **THEN** `selection` becomes the empty set,
- **AND** the Connect button becomes disabled.

#### Scenario: Cancelled save preserves selection

- **GIVEN** `selection === {A, B}` and the ConnectLinkSheet is open,
- **WHEN** the user closes the sheet without saving,
- **THEN** `selection` remains `{A, B}`,
- **AND** the Connect button remains enabled.

### Requirement: Pinboard keyboard accessibility

The `GraphPinboard` MUST support full keyboard operation for users who cannot use a pointer. It MUST be announced as `role="toolbar"` with an accessible name "Pinned cards". Tab MUST move focus into the toolbar as a single stop; inside the toolbar, ArrowLeft and ArrowRight MUST move focus between chips; Space or Enter MUST toggle the focused chip's selection; Escape MUST clear the selection; and when exactly two chips are selected, a second Enter on the Connect button MUST activate it.

Every interactive element in the pinboard MUST have a visible `:focus-visible` outline of at least 2 px width with 2 px offset, matching the panel's accessibility baseline established in `graph-view-overhaul`.

#### Scenario: Arrow keys navigate between chips

- **GIVEN** three chips A, B, C with focus on A,
- **WHEN** the user presses ArrowRight,
- **THEN** focus moves to B.
- **WHEN** the user presses ArrowRight again,
- **THEN** focus moves to C.
- **WHEN** the user presses ArrowRight again,
- **THEN** focus stays on C (clamped; no wrap-around).

#### Scenario: Space toggles the focused chip's selection

- **GIVEN** focus is on chip A and `selection` is empty,
- **WHEN** the user presses Space,
- **THEN** `selection` becomes `{A}`,
- **AND** default Space page-scroll behavior is prevented.

#### Scenario: Escape clears selection

- **GIVEN** `selection === {A, B}` and focus is inside the pinboard,
- **WHEN** the user presses Escape,
- **THEN** `selection` becomes empty,
- **AND** focus remains in the pinboard (does not leak to the document).
