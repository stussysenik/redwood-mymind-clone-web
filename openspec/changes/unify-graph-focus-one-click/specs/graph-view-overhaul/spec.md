## Capability: graph-view-overhaul

Extends the focused-node detail panel from a two-tap "select-then-open" interaction to a single-click open interaction with a unified list where the focused node is row 0 and its connections are rows 1..N. Hardens keyboard navigation bounds, adds an empty-connections state, aligns canvas-side click semantics with panel-side click semantics, and establishes a senior-accessibility baseline (48 px touch targets, 15 px body / 16 px title, strong focus ring, ARIA list semantics, reduced-motion support).

## ADDED Requirements

### Requirement: Focused-node detail panel opens every row on a single click

The detail panel MUST present the focused node and its connections as a single unified list where the focused node is row 0 and each connection is row 1..N. Every row MUST be a `<button>` element with equivalent click semantics: a single click on any row MUST call the `onCardClick` callback with that row's `id` and MUST NOT require a prior "selection" step. The panel MUST NOT implement a two-tap "select-then-open" gate.

The panel MUST maintain an `activeIdx` cursor in the range `[0, items.length - 1]` that tracks which row has keyboard focus and shows an active visual state, but `activeIdx` MUST NOT gate `onCardClick` — pointer clicks bypass the cursor and open the row directly. `activeIdx` defaults to `0` (the focused node) on panel mount and resets to `0` whenever the focused node identity changes.

No element in the rendered DOM MAY contain the text "Tap again to open", "Tap a connection to select", or any other string that implies a two-tap pattern is in effect.

#### Scenario: First click on any connection row opens its card

- **WHEN** the detail panel is rendered with a focused node and 3 connections,
- **AND** the user clicks the connection at row 2 one time,
- **THEN** `onCardClick` fires exactly once with that connection's `id`,
- **AND** the click is not blocked by any intermediate "selected" state.

#### Scenario: First click on the focused-node row opens the focused card

- **WHEN** the detail panel is rendered with a focused node and any number of connections,
- **AND** the user clicks row 0 (the focused-node row) one time,
- **THEN** `onCardClick` fires exactly once with the focused node's `id`.

#### Scenario: Clicking a row updates activeIdx as a visual side-effect

- **GIVEN** the panel has `activeIdx === 0`,
- **WHEN** the user clicks the connection at row 2,
- **THEN** `activeIdx` becomes `2`,
- **AND** `onCardClick` fires on the same click with `items[2].id` (no second click required).

#### Scenario: The "Tap again to open" affordance is absent

- **GIVEN** the detail panel is rendered with any number of connections,
- **WHEN** the rendered DOM is queried,
- **THEN** no element contains the text "Tap again to open" or any equivalent phrasing,
- **AND** no row's click handler depends on a prior `activeIdx === idx` condition.

### Requirement: Unified list keyboard navigation with bounds enforcement

The detail panel MUST support keyboard navigation over the unified list `items = [headItem, ...connections]`.

- ArrowUp and ArrowLeft MUST decrement `activeIdx` clamped to `[0, items.length - 1]`.
- ArrowDown and ArrowRight MUST increment `activeIdx` clamped to `[0, items.length - 1]`.
- Home MUST set `activeIdx = 0`.
- End MUST set `activeIdx = items.length - 1`.
- Enter and Space MUST call `onCardClick(items[activeIdx].id)`, guarded by an existence check; if `items[activeIdx]` is `null` or `undefined`, the handler MUST be a no-op.
- Escape MUST call `onClose`.

The panel MUST route every `activeIdx` mutation — from keyboard handlers, pointer clicks, and the prev/next chrome buttons — through a single `clampIdx` helper so that no state path can produce an out-of-range value.

#### Scenario: ArrowDown clamps at the last row

- **GIVEN** the panel has `items.length === 3` and `activeIdx === 0`,
- **WHEN** the user presses ArrowDown 10 times in succession,
- **THEN** `activeIdx` ends at `2`,
- **AND** no error is thrown,
- **AND** `onCardClick` is never called.

#### Scenario: Enter opens the currently active row

- **GIVEN** the panel has `activeIdx === 1` and `items.length === 3`,
- **WHEN** the user presses Enter,
- **THEN** `onCardClick` fires with `items[1].id`.

#### Scenario: Space opens the currently active row and prevents scroll

- **GIVEN** the panel has `activeIdx === 0`,
- **WHEN** the user presses Space,
- **THEN** `onCardClick` fires with `items[0].id`,
- **AND** the default Space behavior (page scroll) is prevented.

#### Scenario: Home and End jump to bounds

- **GIVEN** the panel has `items.length === 4` and `activeIdx === 2`,
- **WHEN** the user presses Home,
- **THEN** `activeIdx` becomes `0`.
- **WHEN** the user then presses End,
- **THEN** `activeIdx` becomes `3`.

#### Scenario: Keyboard actions on a single-item list are safe no-ops

- **GIVEN** the panel has `items.length === 1` (only the focused-node row, zero connections),
- **WHEN** the user presses ArrowDown, ArrowRight, or End,
- **THEN** `activeIdx` stays at `0`,
- **AND** no error is thrown,
- **AND** `onCardClick` is not called.

### Requirement: Empty connections state renders a non-crashing panel

When the focused node has zero connections, the detail panel MUST still render successfully with `items = [headItem]` as row 0. The focused-node row MUST remain fully interactive. The "Connected to" section label MUST be replaced with "No connections yet". The prev and next chrome buttons MUST be `disabled` and MUST have `aria-disabled="true"`.

#### Scenario: Zero-connection panel opens the focused card

- **GIVEN** a focused node with zero connections,
- **WHEN** the user clicks the focused-node row,
- **THEN** `onCardClick` fires with the focused node's `id`.

#### Scenario: Zero-connection panel shows the empty-state label

- **GIVEN** a focused node with zero connections,
- **WHEN** the panel renders,
- **THEN** the section that would say "Connected to" says "No connections yet",
- **AND** prev and next buttons have both `disabled` and `aria-disabled="true"`.

#### Scenario: Zero-connection panel keyboard nav does not crash

- **GIVEN** a focused node with zero connections,
- **WHEN** the user presses ArrowDown followed by Enter,
- **THEN** `activeIdx` stays at `0`,
- **AND** `onCardClick` fires once with the focused node's `id`.

### Requirement: Canvas click mirrors panel single-click

The graph canvas click handler in `GraphClient.tsx` MUST open the card detail modal on a single click when the user clicks the currently focused node's visual representation (2D dot, 3D sphere, or WebGL point). When the user clicks a node that is NOT currently focused, the handler MUST focus that node (updating `focusedNodeId` and the detail panel) and MUST NOT open the modal in the same gesture. Both behaviors are single-click actions distinguished by the current `focusedNodeId` state.

The prior `lastTapRef` double-tap detector and the 400 ms double-tap window MUST be removed. No state or behavior depends on detecting two clicks within a rolling window.

#### Scenario: Click on focused sphere opens card

- **GIVEN** `focusedNodeId === 'a'`,
- **WHEN** the user clicks the sphere for node `'a'`,
- **THEN** `setSelectedCardId('a')` is called exactly once,
- **AND** `CardDetailModal` mounts showing node `'a'`.

#### Scenario: Click on unfocused sphere focuses that node without opening a modal

- **GIVEN** `focusedNodeId === 'a'` and no modal is open,
- **WHEN** the user clicks the sphere for node `'b'`,
- **THEN** `focusedNodeId` becomes `'b'`,
- **AND** the detail panel updates to show `'b'`'s connections,
- **AND** `CardDetailModal` does NOT mount.

#### Scenario: lastTapRef is not read or written anywhere in GraphClient

- **WHEN** `GraphClient.tsx` is searched for `lastTapRef`,
- **THEN** zero references exist.

### Requirement: Senior accessibility baseline

The detail panel MUST meet an elevated accessibility baseline suitable for users with reduced visual acuity, reduced fine motor control, and keyboard-only or assistive-tech usage patterns. This baseline is a strict superset of WCAG 2.1 AA.

- Every interactive element in the panel (list rows, close button, prev/next chrome buttons, mobile drag handle) MUST have a computed hit area of at least **48 × 48 CSS pixels**.
- Body text in list rows MUST use a computed `font-size` of at least **15 px**; titles (head row) MUST use at least **16 px**; subtitles, chips, and captions MUST use at least **11 px**.
- Every interactive element MUST render a visible `:focus-visible` outline of at least **2 px** width with a **2 px** offset, using the theme's accent color.
- The scroll container that wraps the list rows MUST have `role="list"`.
- Every row button MUST have `role="listitem"` and an accessible name derived from its title.
- The row at `activeIdx` MUST have `aria-current="true"`; all other rows MUST NOT.
- The close control MUST have an `aria-label` of `"Close panel"` or an equivalent accessible name.
- The panel root MUST contain an `aria-live="polite"` region that announces `Showing {nodeTitle}. {n} connection(s).` when a new node is focused; the announcement MUST update within 500 ms of a `nodeTitle` prop change.
- The panel's slide-in animation (desktop `animate-slide-in-right` and mobile `gdpSlideUp`) MUST be wrapped in `@media (prefers-reduced-motion: no-preference)`. Under `prefers-reduced-motion: reduce`, the panel MUST render at its final position with no transform, opacity, or filter transition.
- Running axe-core against the panel in any valid state (focused with connections, focused without connections, keyboard-focused) MUST return zero WCAG 2.1 AA violations.

#### Scenario: Every interactive element meets the 48 px minimum

- **GIVEN** the detail panel is open,
- **WHEN** the computed bounding rectangle of each interactive element is measured,
- **THEN** every element has `width >= 48` CSS pixels AND `height >= 48` CSS pixels.

#### Scenario: Body text meets the 15 px minimum

- **GIVEN** the detail panel is rendered with at least one connection,
- **WHEN** the computed `font-size` of each text element in the list body is measured,
- **THEN** titles on the head row are at least `16px`,
- **AND** titles on connection rows are at least `15px`,
- **AND** subtitles and chip labels are at least `11px`.

#### Scenario: Focus-visible outline is visible on every interactive element

- **GIVEN** the detail panel is open,
- **WHEN** the user Tab-navigates into any interactive element,
- **THEN** that element shows an outline of at least `2px` solid `var(--accent-primary)` with `2px` offset.

#### Scenario: Screen reader announces the focused node on change

- **GIVEN** the panel is open with `nodeTitle === "Card A"`,
- **AND** the `aria-live="polite"` region currently reads `"Showing Card A. 3 connections."`,
- **WHEN** the user clicks a different graph node so `nodeTitle` becomes `"Card B"` with 1 connection,
- **THEN** the `aria-live` region content becomes `"Showing Card B. 1 connection."` within 500 ms.

#### Scenario: Reduced motion disables the slide-in

- **GIVEN** a user with `prefers-reduced-motion: reduce` at the OS level,
- **WHEN** the detail panel mounts,
- **THEN** no transform or opacity animation runs,
- **AND** the panel renders at its final position in the first paint frame.

#### Scenario: Axe-core passes with zero WCAG 2.1 AA violations

- **GIVEN** the detail panel is open on `/graph` with a focused node,
- **WHEN** axe-core runs a full WCAG 2.1 AA audit,
- **THEN** zero violations are reported.
