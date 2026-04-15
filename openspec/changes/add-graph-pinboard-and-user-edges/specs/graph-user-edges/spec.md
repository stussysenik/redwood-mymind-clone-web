## Capability: graph-user-edges

Persistent user-authored directed edges between two Cards. Supports create (from the pinboard Connect flow), read (surfaced in the graph canvas and in a manual-links list sheet), update (label and note only), and delete. Rendered in all three graph renderers visually distinct from auto-computed tag edges.

## ADDED Requirements

### Requirement: GraphLink entity represents a user-authored directed edge

A `GraphLink` entity MUST exist with the following shape:

- `id: string` (primary key, cuid)
- `userId: string` (foreign key to the authenticated user)
- `sourceCardId: string`
- `targetCardId: string`
- `label: string | null` (max 60 characters)
- `note: string | null` (max 280 characters)
- `createdAt: DateTime`
- `updatedAt: DateTime`

`GraphLink` MUST be directed: `sourceCardId` and `targetCardId` are ordered, and swapping them represents a different edge. A unique constraint on `(userId, sourceCardId, targetCardId, label)` MUST prevent duplicate edges with the same label on the same directed pair; two edges with the same pair but different labels are allowed. A `GraphLink` where `sourceCardId === targetCardId` (a self-loop) MUST NOT be creatable — the service layer rejects it with a user-facing error.

`GraphLink` MUST be scoped strictly by `userId`. A user MUST NOT be able to read, update, or delete a `GraphLink` whose `userId !== context.currentUser.id`; any attempt MUST throw `ForbiddenError`.

#### Scenario: Directed edge uniqueness

- **GIVEN** a GraphLink `(userId=u1, source=A, target=B, label="references")` exists,
- **WHEN** User u1 attempts to create another GraphLink `(userId=u1, source=A, target=B, label="references")`,
- **THEN** the mutation throws `UserInputError` with extension code `GRAPH_LINK_DUPLICATE`.
- **WHEN** User u1 attempts to create `(userId=u1, source=A, target=B, label="contradicts")`,
- **THEN** the mutation succeeds — different label, same pair is allowed.
- **WHEN** User u1 attempts to create `(userId=u1, source=B, target=A, label="references")`,
- **THEN** the mutation succeeds — swapped source/target is a different edge.

#### Scenario: Self-loop is rejected

- **GIVEN** a Card A belonging to the current user,
- **WHEN** the user calls `Mutation.createGraphLink({ sourceCardId: A, targetCardId: A })`,
- **THEN** the mutation throws `UserInputError` with message mentioning "connect a card to itself",
- **AND** no row is inserted.

#### Scenario: Cross-tenant source or target is rejected

- **GIVEN** a Card A belonging to User u1 and a Card B belonging to User u2,
- **WHEN** User u1 calls `Mutation.createGraphLink({ sourceCardId: A, targetCardId: B })`,
- **THEN** the mutation throws `ForbiddenError`,
- **AND** no row is inserted.

#### Scenario: Read is tenant-scoped

- **GIVEN** User u1 has 2 GraphLinks and User u2 has 5 GraphLinks,
- **WHEN** User u1 calls `Query.graphLinks`,
- **THEN** the result contains only u1's 2 links,
- **AND** u2's links are not present.

#### Scenario: Update only changes label and note

- **GIVEN** a GraphLink belonging to the current user with `label="references"`, `note=null`,
- **WHEN** the user calls `Mutation.updateGraphLink(id, { label: "inspired by", note: "a longer explanation" })`,
- **THEN** `label` becomes `"inspired by"` and `note` becomes `"a longer explanation"`,
- **AND** `sourceCardId` and `targetCardId` are unchanged.
- **AND** `updatedAt` is updated to the current time.

#### Scenario: Delete is tenant-scoped

- **GIVEN** a GraphLink belonging to User u2,
- **WHEN** User u1 calls `Mutation.deleteGraphLink(id)`,
- **THEN** the mutation throws `ForbiddenError`,
- **AND** the row is not deleted.

### Requirement: User-edges render distinctively in every graph renderer

User-authored edges MUST be visible in all three graph renderers (`ForceGraphCanvas` 2D, `ThreeGraphRenderer`, `WebGLGraphRenderer`). Each renderer MUST distinguish a user-authored edge from an auto-computed tag edge by visual treatment: a shared accent color, a thickness multiplier of 1.4×, and a short dashed stroke pattern (6 CSS pixels on, 3 CSS pixels off). The visual style MUST be defined as a single shared constant in `web/src/lib/graph.ts` (`USER_EDGE_STYLE`) and imported by all three renderers. No renderer MAY hard-code its own style values.

User-authored edges MUST always render regardless of the `minWeight` slider setting. A user edge is effectively weight `Infinity` for the purpose of the weight filter — the user explicitly created it, so hiding it behind a weight threshold would be wrong.

When the current space filter excludes one endpoint of a user-authored edge (because that Card does not match the filter), the edge MUST NOT render. Both endpoints visible is a precondition for drawing the edge.

#### Scenario: User edge renders in 2D canvas

- **GIVEN** a user-authored edge between Cards A and B with the 2D ForceGraphCanvas renderer active,
- **WHEN** the graph renders,
- **THEN** the edge is drawn with stroke color matching `USER_EDGE_STYLE.color`,
- **AND** line width multiplied by `USER_EDGE_STYLE.widthMultiplier` relative to tag-edges,
- **AND** a dashed pattern of `[6, 3]`.

#### Scenario: User edge renders in Three.js canvas

- **GIVEN** a user-authored edge between Cards A and B with `ThreeGraphRenderer` active,
- **WHEN** the graph renders,
- **THEN** the edge is drawn in a separate `LineSegments` object using `LineDashedMaterial` with the accent color,
- **AND** the dash pattern is visually equivalent to the 2D path.

#### Scenario: User edge is not hidden by minWeight filter

- **GIVEN** a user-authored edge and `minWeight` set to 10,
- **WHEN** the graph renders,
- **THEN** the user-authored edge is still drawn,
- **AND** a tag edge with `weight === 1` is filtered out.

#### Scenario: User edge hides when an endpoint is filtered out

- **GIVEN** a user-authored edge between Cards A and B,
- **AND** the current space filter excludes Card B,
- **WHEN** the graph renders,
- **THEN** the user-authored edge is not drawn,
- **AND** Card B is not rendered as a node.

### Requirement: ConnectLinkSheet authors new user-edges

The `ConnectLinkSheet` component MUST provide the UI for creating a new `GraphLink`. It MUST be presented as a modal dialog (`role="dialog"`, `aria-modal="true"`) opened from the `GraphPinboard`'s Connect action. It MUST show a header of the form `Connect {sourceTitle} → {targetTitle}` using HTML-decoded titles, an optional label input capped at 60 characters with a live character counter, an optional note textarea capped at 280 characters with a live character counter, and Cancel / Save footer buttons.

Save MUST always be enabled; an empty label is allowed (the user can just "connect" without labeling). On Save, the component MUST call the `createGraphLink` mutation with `{ sourceCardId, targetCardId, label: label || null, note: note || null }`. On success the sheet MUST close and the pinboard selection MUST clear. On duplicate error (`GRAPH_LINK_DUPLICATE`), the sheet MUST display an inline error message "These cards are already connected with that label" without closing, so the user can edit the label and retry.

The slide-up animation MUST be wrapped in `@media (prefers-reduced-motion: no-preference)`. Escape MUST close the sheet without saving.

#### Scenario: Save with an empty label succeeds

- **GIVEN** ConnectLinkSheet open with `sourceCard = A, targetCard = B`,
- **WHEN** the user leaves the label empty and clicks Save,
- **THEN** `createGraphLink` is called with `{ sourceCardId: A.id, targetCardId: B.id, label: null, note: null }`,
- **AND** on success the sheet closes.

#### Scenario: Save with a 60-character label succeeds

- **GIVEN** ConnectLinkSheet open,
- **WHEN** the user types a 60-character label and clicks Save,
- **THEN** `createGraphLink` is called with the full label string,
- **AND** the character count shows `60 / 60`.

#### Scenario: Label longer than 60 characters is clamped on input

- **GIVEN** ConnectLinkSheet open,
- **WHEN** the user pastes a 120-character string into the label input,
- **THEN** the input accepts only the first 60 characters,
- **AND** the character count shows `60 / 60`.

#### Scenario: Duplicate error is shown inline

- **GIVEN** ConnectLinkSheet open with a label that already exists for this pair,
- **WHEN** the user clicks Save and the mutation returns `GRAPH_LINK_DUPLICATE`,
- **THEN** an inline error reading "These cards are already connected with that label" appears above the footer,
- **AND** the sheet does NOT close,
- **AND** the input retains the user's typed label.

#### Scenario: Escape closes without saving

- **GIVEN** ConnectLinkSheet open with a partially typed label,
- **WHEN** the user presses Escape,
- **THEN** the sheet closes,
- **AND** no mutation is fired.

### Requirement: ManualLinksSheet lists and deletes user-edges

The `ManualLinksSheet` component MUST present the authenticated user's `GraphLink` rows in a list, each showing `{sourceTitle} · {label ?? "—"} · {targetTitle}` and a delete button. The sheet MUST be reachable from a `Connections` button in the `GraphFilterPanel`. The list MUST be sorted by `createdAt DESC` (newest first).

Deletion MUST use an inline two-tap confirmation: the first tap renames the delete button to "Confirm?" for 3 seconds; the second tap within the window calls the delete mutation. Tapping elsewhere within the window reverts the button. No modal confirmation dialog MAY be used.

An empty state MUST render when `userLinks.length === 0` with the text "You haven't connected any cards yet. Pin two cards and tap Connect to create your first."

#### Scenario: List is sorted newest first

- **GIVEN** three GraphLinks created at times T1 < T2 < T3,
- **WHEN** ManualLinksSheet renders,
- **THEN** the visible order is `[T3-link, T2-link, T1-link]`.

#### Scenario: Two-tap delete

- **GIVEN** ManualLinksSheet open with a single link,
- **WHEN** the user clicks the delete button for that row once,
- **THEN** the delete button's label becomes "Confirm?",
- **AND** no `deleteGraphLink` mutation is fired.
- **WHEN** the user clicks the "Confirm?" button within 3 seconds,
- **THEN** `deleteGraphLink(id)` is called exactly once with the correct id.

#### Scenario: Delete confirm expires after 3 seconds

- **GIVEN** a delete button that has been tapped once and is currently showing "Confirm?",
- **WHEN** 3 seconds pass with no further interaction,
- **THEN** the button reverts to its original "Delete" label,
- **AND** a subsequent tap is again the first of a new two-tap flow.

#### Scenario: Empty state

- **GIVEN** the authenticated user has zero GraphLinks,
- **WHEN** ManualLinksSheet renders,
- **THEN** the list is not drawn,
- **AND** the empty-state text is visible.
