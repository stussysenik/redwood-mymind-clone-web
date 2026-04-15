## Why

The focused-node detail panel in the 3D graph (`web/src/components/GraphDetailPanel/GraphDetailPanel.tsx`) has two usability defects that surface together when a user opens a card from the canvas:

1. **The focused node is not clickable in the panel.** The header at `GraphDetailPanel.tsx:164-219` is a static `<div>`, while connection rows below it are `<button>`s. Users who see the focused card at the top of the panel and try to interact with it — expecting it to behave like the rows — get no response. Screenshot-confirmed: a user reports "in this scenario I cannot click the first one" while the panel is open showing a single focused card.
2. **Connection rows gate opens behind a two-tap "select-then-open" pattern.** `handleConnectionClick` at lines `125-135` runs `selectedIdx === idx ? openCard(conn) : setSelectedIdx(idx)`. First click highlights the row and shows a "Tap again to open" hint (lines `319-326`); second click opens the card modal. This is a usability tax — it is non-obvious, it requires a persistent cursor, and it is specifically harmful for users with reduced fine motor control or unfamiliarity with the convention (seniors, touch-device users, keyboard-only users).

Underlying architectural split: the panel has two disconnected selection concepts — `focusedNodeId` owned by `GraphClient` at `GraphClient.tsx:334` (which node is the subject) and `selectedIdx` owned by the panel at `GraphDetailPanel.tsx:82` (which row is "selected" within the panel). They were never unified, so the focused node itself has no position in the `selectedIdx` space and no clickable surface in the panel.

Additionally, the canvas-side click handler at `GraphClient.tsx:911-935` carries a 400 ms double-tap detector (lines `914-918`) as a shortcut to open the focused card. This is now redundant — once every focused-node interaction opens on a single click, the double-tap branch is dead code.

The broader accessibility baseline of the panel also falls short of the project's stated `.impeccable.md` principle 4 ("Accessibility is non-negotiable. WCAG 2.1 AA minimum"): row titles use `text-[13px]`, chip labels use `text-[9px]`, the close X button hit area is ~28 px, and the slide-in animation at line `418` does not honor `prefers-reduced-motion`.

This change is the narrowest patch that (a) unifies the focused node and connection rows into a single one-click list, (b) removes the two-tap gate, (c) applies a senior-accessibility baseline (48 px touch targets, 15 px body / 16 px title, strong focus ring, ARIA list semantics, reduced-motion support), and (d) hardens navigation bounds so every click and key press is well-defined even in empty or out-of-range states.

## What Changes

### Changed — single-click open on every row

- `GraphDetailPanel.tsx:125-135` — `handleConnectionClick` loses the `selectedIdx === idx ? open : select` branch. A click always calls `openCard(items[idx])` AND sets `activeIdx = idx` as a visual side-effect. First click opens the card; there is no intermediate "selected" state that gates opening.
- The "Tap again to open" hint at lines `319-326` and the "Tap a connection to select" footer variant at line `360` are removed. Footer becomes a single, stable hint: `← → browse · Enter open · Esc close`.

### Changed — focused node as row 0 of a unified list

- The panel's internal list becomes `items = [headItem, ...connections]` where `headItem` is a `ConnectionItem`-shaped object built from the focused node's `title` / `type` / `color` / `tags` and a `weight` equal to the connection count. `sharedTags` on the head item is `[]`.
- The head item is passed from `GraphClient.tsx` as a new prop `headItem: ConnectionItem`; the panel does not duplicate the derivation logic.
- `panelHeader` at `GraphDetailPanel.tsx:164-219` is converted from a `<div>` into a real `<button role="listitem">` that occupies index 0 of the unified list, styled to match the connection row visual language (same padding, same active-state background, same weight indicator). The header's existing "color dot + title + type badge + tags" layout is preserved, just wrapped in a button.
- The "Connected to" section label moves below the head row and reads `Connected to · {n} node(s)` when `n > 0` and `No connections yet` when `n === 0`.

### Changed — `activeIdx` is a navigation cursor, not an open gate

- `selectedIdx` is renamed to `activeIdx`. It defaults to `0` (the focused-node row) when the panel opens and resets to `0` whenever the `nodeTitle` prop changes.
- `activeIdx` tracks keyboard focus position and the active visual state only. Clicks do not depend on its value; keyboard Enter/Space open `items[activeIdx]` guarded by an `items[activeIdx] != null` existence check.
- Arrow Up / Arrow Left decrement, Arrow Down / Arrow Right increment. Home / End jump to first / last. All mutations clamp to `[0, items.length - 1]`.

### Changed — canvas click mirrors panel single-click

- `GraphClient.tsx:911-935` — `handleNodeClick` is simplified. The `lastTapRef` / `isDoubleTap` branch at lines `914-918` is removed. Behavior becomes:
  - Clicking a node that is NOT the currently focused node: focus it (`setFocusedNodeId(node.id)`) and pan/zoom the camera; the detail panel updates to show the new subject. This is a single-click action.
  - Clicking a node that IS the currently focused node: open its card detail modal (`setSelectedCardId(node.id)`). This is also a single-click action — it's just a different single click, distinguished by the current focus state.
- Net effect: the canvas and the panel agree on "one click to open the focused card," and the dead double-tap detector is gone.

### Added — empty-connections state

- When `connections.length === 0`, `items = [headItem]` still renders (the focused node is always row 0). The `prev` / `next` chrome buttons at `GraphDetailPanel.tsx:226-248` are `disabled` with `aria-disabled="true"`. The section label reads "No connections yet". The focused-node row remains fully interactive — a one-click open path always exists when the panel is on screen.

### Added — senior accessibility baseline

- Every interactive element in the panel — list rows, the close X button, the prev/next chrome buttons, and the mobile drag handle — MUST be at least **48 × 48 CSS pixels** of touch target (up from ~44 px on rows and ~28 px on the close X at lines `211-217`).
- Body text in rows (connection titles at line `290`) bumps from `text-[13px]` to `text-[15px]`. Head row title bumps from `text-sm` (14 px) at line `178` to `text-base` (16 px). Subtitle `text-[11px]` at line `187` bumps to `text-[13px]`. Tag chips from `text-[9px]` at lines `197, 302` to `text-[11px]`.
- Every interactive element gains a visible `:focus-visible` outline: `outline: 2px solid var(--accent-primary); outline-offset: 2px`. The current hover-only feedback is insufficient for keyboard users.
- ARIA wiring: the scroll container that wraps `connectionList` gets `role="list"`; every row button gets `role="listitem"` and `aria-current="true"` when it is the `activeIdx` row. The panel root gets an `aria-live="polite"` region that announces `Showing {nodeTitle}. {n} connection(s).` on mount and on `nodeTitle` change.
- The slide-in animation at line `418` (`animate-slide-in-right` on desktop) and the `gdpSlideUp` keyframes on mobile at lines `400-407` are wrapped in `@media (prefers-reduced-motion: no-preference)`. Users who prefer reduced motion see the panel snap to its final position.

### Added — bounds hardening (indestructible navigation)

- All `setActiveIdx` call sites route through a `clampIdx(next) => Math.max(0, Math.min(items.length - 1, next))` helper.
- All `openCard(items[idx])` call sites are guarded by an existence check: `const target = items[idx]; if (!target) return;`. A mis-typed index can never throw, call `openCard(undefined)`, or leave the modal in a half-open state.
- `items.length >= 1` is an invariant as long as the panel is open (the focused node is always row 0).

## Capabilities

### Modified Capabilities

- **`graph-view-overhaul`** — extends the focused-node detail panel from a two-tap "select-then-open" interaction to a single-click open interaction with a unified list where the focused node is row 0, hardens keyboard navigation bounds, adds an empty-connections state, aligns canvas-side click semantics with panel-side click semantics, and establishes a senior-accessibility baseline (48 px touch targets, 15 px body / 16 px title, strong focus ring, ARIA list semantics, reduced-motion support).

### Not touched

- **`graph-clusters`** — unrelated. The cluster save / restore / list flow is owned by the in-flight `fix-3d-graph-and-complete-clusters` change.
- **`graph-annotations`** — the annotation layer has not been built; nothing to touch.

## Impact

- **Schema** — none.
- **API** — none.
- **Web** — approximately **80 LOC** in `web/src/components/GraphDetailPanel/GraphDetailPanel.tsx` (head-row conversion, one-click handler, ARIA wiring, a11y styling, bounds clamp) and **15 LOC** in `web/src/components/GraphClient/GraphClient.tsx` (remove `lastTapRef` double-tap detector, pass `headItem` prop to panel). No new files. No new hooks.
- **Tests** — one new Jest/RTL suite `GraphDetailPanel.test.tsx` covering: single-click open on every row, head-row click opens the focused card, keyboard navigation bounds, empty-connections state, `items[activeIdx]` guard, `aria-live` announcement. One new Playwright spec covering the end-to-end panel click flow on `/graph` with a seeded focused card. Axe-core assertion: zero WCAG 2.1 AA violations with the panel open.
- **Breaking changes** — none visible to API or schema. The "Tap again to open" affordance is removed, which is a UX change but not a contract change. No persisted state depends on the old two-tap model.

## Out of Scope

- Touch target audit for the graph filter panel, cluster button, and mode switcher. A broader accessibility sweep is a separate change.
- Text-to-speech narration of panel content beyond the `aria-live` announcement.
- Full keyboard spatial traversal of graph canvas nodes (arrow-key walk between nodes on the canvas itself). Tracked under Group 8 of the in-flight `3d-clusters-and-annotations` change.
- Replacement of `CardDetailModal` with an in-panel expansion. Orthogonal.
- Renaming or refactoring the `ConnectionItem` type beyond adding the notion of a "head item".
- Visual design of a cluster-level detail panel. Out of this change's scope.
