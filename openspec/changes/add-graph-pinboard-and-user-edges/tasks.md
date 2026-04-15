# Tasks — add-graph-pinboard-and-user-edges

Ordered list of small, verifiable work items. Groups 2–4 are API/schema (land first so the client has something to talk to). Groups 5–10 are client-side (land incrementally behind a feature check). Groups 11–12 are the renderer integration and verification.

## 1. Spec approval & validation

- [ ] 1.1 Run `openspec validate add-graph-pinboard-and-user-edges --strict --no-interactive`; resolve every issue before sharing.
- [ ] 1.2 User review of `proposal.md`, `design.md`, and all three spec deltas (`graph-pinboard`, `graph-user-edges`, `graph-view-overhaul`). Sign-off required before any code is written.

## 2. Schema + migration

- [ ] 2.1 Add `pinnedAt DateTime? @map("pinned_at") @db.Timestamptz` to the `Card` model in `api/db/schema.prisma`.
- [ ] 2.2 Add `@@index([userId, pinnedAt(sort: Desc)], map: "idx_cards_user_pinned")` to the `Card` model.
- [ ] 2.3 Add the `GraphLink` model exactly as specified in `proposal.md` (`id`, `userId`, `sourceCardId`, `targetCardId`, `label` VarChar 60, `note` VarChar 280, `createdAt`, `updatedAt`, unique constraint, three indexes, `@@map("graph_links")`).
- [ ] 2.4 Generate migration: `yarn rw prisma migrate dev --name add_pinboard_and_user_edges --create-only`. Review the SQL before applying.
- [ ] 2.5 Verify migration is additive only (no drops, no alter-column-not-null). Apply: `yarn rw prisma migrate dev`.
- [ ] 2.6 `yarn rw prisma generate` — regenerate Prisma client.

## 3. API — pin/unpin mutations + graphPinnedCards query

Depends on: 2.6.

- [ ] 3.1 Extend `api/src/graphql/cards.sdl.ts` with:
  - `type Query { graphPinnedCards: [Card!]! @requireAuth }`
  - `type Mutation { pinCard(id: String!): Card! @requireAuth; unpinCard(id: String!): Card! @requireAuth }`
  - Add `pinnedAt: DateTime` to the `Card` type.
- [ ] 3.2 In `api/src/services/cards/cards.ts`, add `graphPinnedCards`, `pinCard`, `unpinCard` service functions. All three scope strictly by `context.currentUser.id`; pin / unpin throw `ForbiddenError` if the Card does not belong to the caller.
- [ ] 3.3 `graphPinnedCards` returns `db.card.findMany({ where: { userId, pinnedAt: { not: null }, deletedAt: null }, orderBy: { pinnedAt: 'desc' }, take: 100 })`.
- [ ] 3.4 Unit test (`api/src/services/cards/cards.test.ts` extended): pin a card, read graphPinnedCards, assert it comes back; unpin, assert it goes away; pin another user's card → ForbiddenError; order is `pinnedAt DESC`.

## 4. API — graphLinks CRUD

Depends on: 2.6, 3.1.

- [ ] 4.1 Create `api/src/graphql/graphLinks.sdl.ts` with the `GraphLink` type + `CreateGraphLinkInput` + `UpdateGraphLinkInput` + four resolvers (`graphLinks` query, `createGraphLink`, `updateGraphLink`, `deleteGraphLink` mutations), all `@requireAuth`.
- [ ] 4.2 Create `api/src/services/graphLinks/graphLinks.ts`. Implement:
  - `graphLinks(): GraphLink[]` → `db.graphLink.findMany({ where: { userId: currentUser.id }, orderBy: { createdAt: 'desc' }, take: 5000 })`.
  - `createGraphLink(input)`:
    1. Require `currentUser`.
    2. Reject self-loop: `input.sourceCardId === input.targetCardId` → `UserInputError('Cannot connect a card to itself')`.
    3. Verify source Card and target Card both belong to `currentUser` — parallel `db.card.findFirst` calls, throw `ForbiddenError` if either is missing.
    4. Try `db.graphLink.create({ data: { userId, ...input } })`.
    5. Catch Prisma P2002: throw `UserInputError('This connection already exists', { extensions: { code: 'GRAPH_LINK_DUPLICATE' } })`.
  - `updateGraphLink(id, input)`:
    1. Fetch the existing link; throw `ForbiddenError` if `userId !== currentUser.id`.
    2. Update only `label` and `note`. Source and target are immutable at the service level — any attempt to change them is silently ignored (input type omits them).
  - `deleteGraphLink(id)`:
    1. Fetch the existing link; throw `ForbiddenError` if `userId !== currentUser.id`.
    2. Delete it. Return the deleted row.
- [ ] 4.3 Service unit tests (`api/src/services/graphLinks/graphLinks.test.ts`):
  - Create a link → returns it; `createdAt` is set.
  - Create a link where source and target are the same Card → `UserInputError`.
  - Create a link where the source is another user's Card → `ForbiddenError`.
  - Create a duplicate `(userId, sourceCardId, targetCardId, label)` → `UserInputError` with code `GRAPH_LINK_DUPLICATE`.
  - Create two links with the same pair but different labels → both succeed.
  - Read: only the caller's links come back; another user's links do not.
  - Update label on a caller's link → success; update label on another user's link → `ForbiddenError`.
  - Delete: caller's link deletes; another user's link → `ForbiddenError`.
- [ ] 4.4 `yarn rw test api graphLinks` — suite passes.

## 5. Client — queries and cache shape

Depends on: 3.1, 4.1.

- [ ] 5.1 Create `web/src/components/GraphClient/graphPinsFragments.ts` with the `GRAPH_PINNED_CARDS_QUERY` (returns `{ id, title, type, color, pinnedAt, tags }` for each pinned card).
- [ ] 5.2 Create `web/src/components/GraphClient/graphLinksFragments.ts` with `GRAPH_LINKS_QUERY`, `PIN_CARD_MUTATION`, `UNPIN_CARD_MUTATION`, `CREATE_GRAPH_LINK_MUTATION`, `DELETE_GRAPH_LINK_MUTATION`.
- [ ] 5.3 In `GraphClient.tsx`, call `useQuery(GRAPH_PINNED_CARDS_QUERY)` and `useQuery(GRAPH_LINKS_QUERY)` alongside the existing Cards query. Extract `pinnedCards: Card[]` and `userLinks: GraphLink[]`.
- [ ] 5.4 Build `pinnedCardIds = new Set(pinnedCards.map(c => c.id))` as a `useMemo`.
- [ ] 5.5 Extend the existing `graphData` memoization so `graphData.links` is `[...tagEdges, ...userLinks.map(l => ({ source: l.sourceCardId, target: l.targetCardId, weight: Infinity, userAuthored: true, id: l.id, label: l.label }))]`.
- [ ] 5.6 Unit test: with seed `userLinks = [...]`, assert `graphData.links` contains those edges tagged `userAuthored: true` and they always pass the `minWeight` filter.

## 6. Client — pin toggle in `GraphDetailPanel`

Depends on: 5.3.

- [ ] 6.1 Add `isPinned: boolean` and `onTogglePin: () => void` props to `GraphDetailPanel`.
- [ ] 6.2 Render a pin toggle button next to the close X (sibling, not nested inside the head row button). 48 × 48 hit area; `aria-pressed={isPinned}`; `aria-label={isPinned ? "Unpin {title}" : "Pin {title}"}`.
- [ ] 6.3 Visual state: filled pin icon + `var(--surface-accent)` background when `isPinned`; outline icon + transparent background otherwise. Both states get the same `:focus-visible` outline baseline.
- [ ] 6.4 Wire in `GraphClient.tsx`: `isPinned={pinnedCardIds.has(focusedNodeId ?? '')}`; `onTogglePin` calls `pinCardMutation` or `unpinCardMutation` with optimistic cache update.
- [ ] 6.5 RTL test: render panel with `isPinned=false`, click the pin button, assert `onTogglePin` fires; re-render with `isPinned=true`, assert `aria-pressed="true"` and filled visual state.

## 7. Client — `GraphPinboard` component

Depends on: 5.3.

- [ ] 7.1 Create `web/src/components/GraphPinboard/GraphPinboard.tsx`. Props: `pinnedCards: Card[]`, `selection: Set<string>`, `onToggleSelect(cardId)`, `onUnpin(cardId)`, `onConnect(sourceId, targetId)`.
- [ ] 7.2 Render a horizontal flex strip, docked top-left of the 3D canvas at `position: absolute; top: 64px; left: 16px`. Hidden entirely when `pinnedCards.length === 0`.
- [ ] 7.3 Each pinned card renders as a chip: color dot + truncated title (28 char max) + an X to unpin. 48 px tall; min 120 px wide; max 220 px wide; horizontally scrollable container with 24-chip visual cap before scroll.
- [ ] 7.4 Selection state: chips in `selection` get `aria-pressed="true"` and a 2 px accent ring. Tapping a chip that is NOT in selection adds it; tapping a selected chip removes it from selection. When selection size would exceed 2, evict the oldest-added id (FIFO capacity 2).
- [ ] 7.5 Render a `Connect` button at the right edge of the strip. Disabled when `selection.size !== 2`. Enabled → accent color, 48 × 48 minimum. `aria-disabled` mirrors `disabled`.
- [ ] 7.6 On `Connect` click, call `onConnect(firstSelectedId, secondSelectedId)` using the insertion order preserved in a `Set`.
- [ ] 7.7 Keyboard: the strip is a `role="toolbar"`; arrow keys move focus between chips; Space toggles selection; Enter activates Connect when enabled; Escape clears selection.
- [ ] 7.8 RTL tests (`GraphPinboard.test.tsx`):
  - Renders nothing when `pinnedCards` is empty.
  - Renders N chips for N pinned cards.
  - Tapping a chip calls `onToggleSelect` with that id.
  - `Connect` button is disabled with 0 or 1 in selection, enabled with exactly 2.
  - FIFO eviction: with A, B already in selection, tapping C makes selection {B, C}.
  - Tapping a selected chip removes it from selection.
- [ ] 7.9 Storybook story (`GraphPinboard.stories.tsx`) covering empty, one pin, two-pin-ready-to-connect, and 24-pin-scrolling states.

## 8. Client — `ConnectLinkSheet` component

Depends on: 7.5.

- [ ] 8.1 Create `web/src/components/ConnectLinkSheet/ConnectLinkSheet.tsx`. Mirrors the visual language of `ClusterSheet`. Props: `isOpen`, `sourceCard: Card | null`, `targetCard: Card | null`, `onSave(label: string, note: string)`, `onClose`, `isSaving`, `error`.
- [ ] 8.2 Header: `Connect {sourceCard.title} → {targetCard.title}` (HTML-decoded titles).
- [ ] 8.3 Label input: optional, `maxLength={60}`, placeholder `"connects to"`, live character count `N / 60`.
- [ ] 8.4 Note textarea: optional, `maxLength={280}`, placeholder `"add a note (optional)"`, live character count `N / 280`.
- [ ] 8.5 Footer: `Cancel` + `Save`. Save is always enabled (empty label is allowed); Save shows a spinner when `isSaving`.
- [ ] 8.6 Error: if `error` is non-null, render a non-intrusive inline message above the footer with the text; do NOT use a banner (honors `feedback_no_error_banners` memory).
- [ ] 8.7 Dialog semantics: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` points at the header, focus is trapped while open, Esc calls `onClose`.
- [ ] 8.8 Reduced motion: slide-up animation wrapped in `@media (prefers-reduced-motion: no-preference)`.
- [ ] 8.9 RTL tests (`ConnectLinkSheet.test.tsx`):
  - Does not render when `isOpen === false`.
  - Label input respects `maxLength=60`; pasting 120 chars truncates to 60 and updates the live count.
  - Clicking Save calls `onSave(label, note)`.
  - Clicking Cancel calls `onClose`.
  - Error prop renders inline; no banner class is present.

## 9. Client — wiring pinboard + connect flow in `GraphClient`

Depends on: 7.1, 8.1.

- [ ] 9.1 Add state: `pinboardSelection: Set<string>` (local `useState`); `connectSheetOpen: boolean`; `connectPair: { source: Card, target: Card } | null`; `createLinkError: string | null`.
- [ ] 9.2 `onConnect(sourceId, targetId)` handler: look up both cards from `pinnedCards`, set `connectPair`, open `connectSheetOpen`.
- [ ] 9.3 `onSaveGraphLink(label, note)` handler: call `createGraphLinkMutation({ variables: { input: { sourceCardId, targetCardId, label: label || null, note: note || null } }, update: ... })`. On success: clear selection, close the sheet. On error: set `createLinkError` to the error message.
- [ ] 9.4 Apollo cache update: on successful `createGraphLink`, prepend the new link to `GRAPH_LINKS_QUERY` cache so the renderer sees it without a refetch.
- [ ] 9.5 Apollo cache update: on successful `pinCard` / `unpinCard`, update the cached `GRAPH_PINNED_CARDS_QUERY` and the cached Card directly.
- [ ] 9.6 Render `<GraphPinboard>` and `<ConnectLinkSheet>` as siblings to the existing `<GraphDetailPanel>` in the `viewMode === 'graph'` branch of `GraphClient.tsx:1419-1427`.
- [ ] 9.7 RTL integration test (`GraphClient.test.tsx`): seed two pinned cards; tap both chips in the pinboard; tap Connect; enter label "references"; Save; assert the create mutation was called with the right variables and the new edge is present in the merged `graphData.links`.

## 10. Client — `ManualLinksSheet` + filter panel entry

Depends on: 5.3.

- [ ] 10.1 Create `web/src/components/ManualLinksSheet/ManualLinksSheet.tsx`. Props: `isOpen`, `userLinks: GraphLink[]` (with embedded source + target Card snippets), `onDelete(linkId)`, `onClose`.
- [ ] 10.2 Render as a `role="dialog"` sheet. Each link is a row: `{sourceTitle} · {label || "—"} · {targetTitle}` with a 48 × 48 delete button on the right.
- [ ] 10.3 Delete confirms inline (tap delete → button converts to "Confirm?" for 3 seconds → second tap actually deletes). No modal confirmation.
- [ ] 10.4 Empty state: "You haven't connected any cards yet. Pin two cards and tap Connect to create your first."
- [ ] 10.5 Add a `Connections` button to `GraphFilterPanel` that opens `ManualLinksSheet`. Icon: `Link` from lucide-react. 48 × 48 touch target.
- [ ] 10.6 RTL tests (`ManualLinksSheet.test.tsx`):
  - Renders N rows for N user links.
  - Delete button's first tap does NOT call `onDelete`; it renames the button to "Confirm?".
  - Second tap on "Confirm?" calls `onDelete` with the link id.
  - Empty state renders when `userLinks.length === 0`.

## 11. Client — renderer integration (visual distinction for user-edges)

Depends on: 5.5.

- [ ] 11.1 Add shared constants to `web/src/lib/graph.ts`:
  ```ts
  export const USER_EDGE_STYLE = {
    color: '#F97316',             // accent orange (matches var(--accent-primary))
    widthMultiplier: 1.4,
    dashOn: 6,
    dashOff: 3,
  } as const
  ```
- [ ] 11.2 2D `linkCanvasObject` in `GraphClient.tsx:~1070-1180` (find the existing link draw callback): branch on `link.userAuthored`; set stroke color, line width, and `setLineDash([6, 3])` when true.
- [ ] 11.3 `ThreeGraphRenderer.tsx`: split the existing single `LineSegments` edge object into two — one for tag-edges (existing code path), one for user-edges (new `LineSegments` with `LineDashedMaterial` referencing `USER_EDGE_STYLE`). `linePositions` and `userLinePositions` buffers are rebuilt whenever `links` prop changes. Both update their positions each frame from the simulation.
- [ ] 11.4 `WebGLGraphRenderer.tsx` (find the existing line rendering path): add a second draw call or an attribute-keyed branch that colors and thickens user-edges using `USER_EDGE_STYLE`. A feature-parity TODO comment is acceptable if the renderer is not actively used — confirm it is the active renderer for any user before shipping.
- [ ] 11.5 Visual QA: in dev, create a user edge between two seeded cards; switch 2D ↔ 3D ↔ WebGL; assert the edge is visually distinct in all three.

## 12. Verification

- [ ] 12.1 `yarn rw type-check` — clean.
- [ ] 12.2 `yarn rw lint` — clean.
- [ ] 12.3 `yarn rw test web` — all new suites pass (`GraphPinboard`, `ConnectLinkSheet`, `ManualLinksSheet`, `GraphDetailPanel` pin tests).
- [ ] 12.4 `yarn rw test api` — `graphLinks` and `cards` service suites pass.
- [ ] 12.5 Manual pass (`yarn rw dev`) against Supabase dev seed:
  - Pin a card from the detail panel. Pinboard appears with one chip.
  - Pin a second card. Pinboard has two chips.
  - Tap both chips. Connect button enables.
  - Tap Connect. Sheet opens with the correct source → target header.
  - Enter label "references". Save. Sheet closes; edge appears in the 3D canvas with accent color + dashed pattern.
  - Reload. Both pins and the edge are still there.
  - Open `ManualLinksSheet` from the filter panel. The new link is in the list.
  - Delete it. It disappears from the canvas and the list.
  - Unpin both cards. Pinboard disappears.
- [ ] 12.6 Playwright end-to-end spec `pinboard-connect.spec.ts`: the full flow in 12.5 is driven headlessly. Axe-core asserts zero WCAG 2.1 AA violations at each step.
- [ ] 12.7 Lighthouse accessibility score on `/graph` with pinboard + detail panel + ManualLinksSheet all open ≥ 95.
- [ ] 12.8 Regression check: `unify-graph-focus-one-click` and `fix-3d-pixel-precise-hover` tests still pass (no coupling regressions).

## 13. Documentation & handoff

- [ ] 13.1 Update any in-app tooltips or onboarding text referencing the 3D graph to mention "pin and connect" as a supported action.
- [ ] 13.2 If a public changelog or release notes file exists in the repo, add a one-line entry: `Pin cards and connect them with user-authored edges — your personal knowledge graph overlays the automatic one.` If no such file exists, this task is a no-op.
- [ ] 13.3 When all tasks complete, archive this change via `openspec:archive` per repo conventions.
