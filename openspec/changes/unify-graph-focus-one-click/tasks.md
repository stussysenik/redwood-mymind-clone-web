# Tasks — unify-graph-focus-one-click

Ordered list of small, verifiable work items. Every task leads to user-visible progress or a passing test. Dependencies are noted where they exist; all other tasks within a group may be parallelized.

## 1. Spec approval & validation

- [x] 1.1 Run `openspec validate unify-graph-focus-one-click --strict --no-interactive`; resolve every issue before sharing.
- [x] 1.2 User review of `proposal.md`, `design.md`, and the `graph-view-overhaul` spec delta. Sign-off required before any code is written.

## 2. Data model reshape (panel-local)

- [x] 2.1 In `GraphDetailPanel.tsx`, introduce a derived `items: ConnectionItem[]` from a new prop `headItem: ConnectionItem` and the existing `connections: ConnectionItem[]` prop: `const items = useMemo(() => [headItem, ...connections], [headItem, connections])`.
- [x] 2.2 In `GraphClient.tsx`, build `headItem` at the same site where `focusedNodeMeta` is computed (currently `GraphClient.tsx:1216-1222`): `{ id: focusedNodeId, title, type, color, sharedTags: [], weight: focusedConnections.length }`. Pass it to `GraphDetailPanel` as a new prop on the existing render at `GraphClient.tsx:1420-1431`.
- [x] 2.3 Rename `selectedIdx` → `activeIdx` throughout `GraphDetailPanel.tsx`. Update dependencies and effect arrays accordingly. Default value becomes `0`.
- [x] 2.4 Reset effect: on `nodeTitle` change, `setActiveIdx(0)` (was `setActiveIdx(null)` at line 87).
- [x] 2.5 Unit test (`GraphDetailPanel.test.tsx`): with `headItem` set and `connections=[a,b,c]`, assert `items` has length 4 and `items[0] === headItem`.

## 3. Single-click open (remove two-tap gate)

Depends on: 2.1, 2.3.

- [x] 3.1 `handleConnectionClick` at `GraphDetailPanel.tsx:125-135`: delete the `selectedIdx === idx ? openCard(conn) : setSelectedIdx(idx)` branch. Replace with `setActiveIdx(idx); openCard(conn);` — both run on every click.
- [x] 3.2 Delete the "Tap again to open" inline hint block at lines `319-326`.
- [x] 3.3 Delete the `selectedIdx !== null ? 'Tap again to open · ← → to browse' : 'Tap a connection to select · Esc to close'` conditional at lines `358-361`. Footer becomes a single literal: `← → browse · Enter open · Esc close`.
- [x] 3.4 RTL test: render panel with 3 connections, click row 1 once, assert `onCardClick` called once with `items[1].id` and the modal open handler fires on the first click (not a second one).

## 4. Head row becomes a clickable list item

Depends on: 2.1, 2.2, 3.1.

- [x] 4.1 Convert the `panelHeader` block at `GraphDetailPanel.tsx:164-219` from a `<div>` into a `<button type="button" role="listitem" aria-current={activeIdx === 0 ? "true" : undefined}>`. Preserve all existing child content (color dot, title, type badge, tags).
- [x] 4.2 Wire `onClick={() => { setActiveIdx(0); openCard(items[0]); }}`.
- [x] 4.3 Move the close X button OUT of the panelHeader button (a button cannot contain a nested button). Render it as a sibling in the top-right corner of the panel — absolute-positioned in a 48 × 48 hit area.
- [x] 4.4 Style the head row to match connection rows: same horizontal padding, same `:hover` and `aria-current="true"` background treatment using `var(--surface-accent)`.
- [x] 4.5 Relocate the "Connected to" section label BELOW the head row. Label text: `Connected to · {connections.length} node{connections.length !== 1 ? 's' : ''}` when `n > 0`, otherwise `No connections yet`.
- [x] 4.6 RTL test: click the head row once, assert `onCardClick` fires with the focused node's `id`. Assert `aria-current="true"` is present on the head row when `activeIdx === 0`.

## 5. Unified keyboard navigation

Depends on: 2.1, 2.3, 2.4.

- [x] 5.1 Replace the keyboard effect at `GraphDetailPanel.tsx:91-112`. New behavior:
  - ArrowUp / ArrowLeft: `setActiveIdx(i => clampIdx(i - 1))`.
  - ArrowDown / ArrowRight: `setActiveIdx(i => clampIdx(i + 1))`.
  - Home: `setActiveIdx(0)`.
  - End: `setActiveIdx(items.length - 1)`.
  - Enter, Space: `const target = items[activeIdx]; if (target) openCard(target);` `e.preventDefault()` on Space.
  - `clampIdx(n) => Math.max(0, Math.min(items.length - 1, n))`.
- [x] 5.2 Update the `prev` / `next` chrome buttons at lines `226-248` to operate on the same unified list via `clampIdx`. Disable `prev` when `activeIdx === 0` and `next` when `activeIdx === items.length - 1`. `aria-disabled` mirrors `disabled`.
- [x] 5.3 RTL test: fire ArrowDown 10 times on a panel with `items.length === 3`; assert `activeIdx === 2` and no throw.
- [x] 5.4 RTL test: press Enter with `activeIdx === 1`; assert `onCardClick` fires with `items[1].id`.
- [x] 5.5 RTL test: press Home then End; assert `activeIdx === 0` then `activeIdx === items.length - 1`.

## 6. Empty-connections state

Depends on: 4.5.

- [x] 6.1 When `connections.length === 0`, render only the head row. Section label reads `No connections yet`. `prev` / `next` chrome buttons are `disabled` and get `aria-disabled="true"`.
- [x] 6.2 RTL test: mount panel with `connections={[]}`; click head row; assert `onCardClick` fires with head id; assert `prev` and `next` buttons are disabled.

## 7. Senior accessibility pass

Depends on: 4.1, 4.3, 5.2.

- [x] 7.1 Every row button (`GraphDetailPanel.tsx:264-344` and the new head row from task 4.1) gets `min-h-[48px]` and vertical padding that preserves a 48 px hit area on the smallest row content.
- [x] 7.2 Close X button at lines `211-217` gets `min-h-[48px] min-w-[48px] flex items-center justify-center`. Icon stays at 16 px; the padding grows to meet the hit target.
- [x] 7.3 Prev / next chrome buttons get `min-h-[48px]`.
- [x] 7.4 Bump font sizes: head row title `text-sm` → `text-base` (line 178), subtitle `text-[11px]` → `text-[13px]` (line 187), head tag chips `text-[9px]` → `text-[11px]` (line 197), connection row title `text-[13px]` → `text-[15px]` (line 290), connection tag chips `text-[9px]` → `text-[11px]` (line 302), selected-hint text was deleted in task 3.2, weight label `text-[9px]` → `text-[11px]` (line 340), footer hint `text-[11px]` → `text-[13px]` (line 352).
- [x] 7.5 Add a `focus-visible` utility class to every interactive element in the panel: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]`.
- [x] 7.6 ARIA wiring:
  - Add `role="list"` to the scroll container that wraps `connectionList` at line 253.
  - Add `role="listitem"` to every row button (head + connections). Add `aria-current="true"` when `activeIdx === idx`.
  - Add `aria-label="Close panel"` on the close X button (existing `title="Close (Esc)"` remains for mouse users).
- [x] 7.7 Add an `aria-live="polite"` region near the panel root with text `Showing {nodeTitle}. {connections.length} connection{connections.length !== 1 ? 's' : ''}.`. Update on `nodeTitle` change.
- [x] 7.8 Wrap the desktop `animate-slide-in-right` class at line 418 and the mobile `gdpSlideUp` keyframes at lines 400-407 in a `@media (prefers-reduced-motion: no-preference)` guard. Add a small CSS module or inline `<style>` that applies `animation: none` under `prefers-reduced-motion: reduce`.
- [ ] 7.9 Playwright spec: run axe-core against `/graph` with a seeded focused card; assert zero WCAG 2.1 AA violations.

## 8. Canvas click simplification

- [x] 8.1 In `GraphClient.tsx:911-935`, delete the `lastTapRef` state, the `isDoubleTap` computation, and the `400 ms` window logic at lines 914-918.
- [x] 8.2 Simplify `handleNodeClick` body to:
  - `if (focusedNodeId === node.id) { haptic('medium'); setSelectedCardId(node.id); return; }`
  - `haptic('light'); setFocusedNodeId(node.id); fg.centerAt(...); fg.zoom(...);`
- [x] 8.3 Delete the `lastTapRef` declaration wherever it currently lives.
- [ ] 8.4 RTL test (or existing GraphClient test): set `focusedNodeId = 'a'`, dispatch `handleNodeClick({ id: 'a' })`, assert `selectedCardId === 'a'`; then dispatch `handleNodeClick({ id: 'b' })`, assert `focusedNodeId === 'b'` AND `selectedCardId === 'a'` (modal is still showing 'a' until user closes it — or `null` if we also clear on refocus; decide in task 8.5).
- [x] 8.5 Decide: does refocusing a new node also clear the modal? Leave as-is (modal persists) — the modal has its own close affordance. Document in `design.md` under "Decisions."

## 9. Bounds hardening

Depends on: 5.1.

- [x] 9.1 Every mutation of `activeIdx` (click, keyboard, prev/next) routes through `clampIdx(next) = Math.max(0, Math.min(items.length - 1, next))`. No raw `setActiveIdx(n + 1)` call remains.
- [x] 9.2 Every `openCard(items[idx])` call guards `const target = items[idx]; if (!target) return;`.
- [x] 9.3 Unit test: call `setActiveIdx(-5)` and `setActiveIdx(999)` via exposed handler; assert state stays within `[0, items.length - 1]`.
- [x] 9.4 Unit test: render with `items.length === 1` (empty connections); fire ArrowDown, ArrowRight, End; assert no throw, `activeIdx` stays 0, `onCardClick` does not fire.

## 10. Verification

- [x] 10.1 `yarn rw type-check` — clean.
- [x] 10.2 `yarn rw test web GraphDetailPanel` — new suite passes.
- [ ] 10.3 `yarn rw test web GraphClient` — existing suite still passes.
- [x] 10.4 `yarn rw lint` — clean.
- [ ] 10.5 Manual pass in dev against Supabase seed data: load `/graph`, click a card to focus, click the head row → modal opens on first click. Click a connection row → modal opens on first click. Tab → arrow keys → Enter to open via keyboard. Esc closes. Reduced-motion OS setting → no slide animation.
- [ ] 10.6 Lighthouse accessibility score on `/graph` with panel open ≥ 95.
- [ ] 10.7 Playwright spec for the full one-click flow passes.
- [ ] 10.8 Axe-core shows zero WCAG 2.1 AA violations on the panel.

## 11. Documentation & handoff

- [x] 11.1 Update `.impeccable.md` principle 4 example if needed (no change expected).
- [ ] 11.2 When all tasks complete, move this change via `openspec:archive` per repo conventions (see existing `openspec/changes/archive/`).
