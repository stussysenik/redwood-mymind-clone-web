# Design — unify-graph-focus-one-click

## Context

See `proposal.md` for the full bug statement and the user-reported scenario. In short: `GraphDetailPanel` has two selection states (`focusedNodeId` in the parent + `selectedIdx` in the panel), the focused node is not a clickable row in the panel, and all clickable rows gate `openCard` behind a two-tap pattern. The user asked for "just the most intuitive one click, and accessibility for seniors." This design doc captures the handful of architectural trade-offs that decision unlocked.

## Goals

1. A single-click opens any card in the panel — the focused card and every connection row — with zero configuration and zero "select-first" ceremony.
2. The panel and the graph canvas agree on the same interaction model: click an unfocused node to focus, click the focused node to open. No dead zones, no redundant double-tap detectors.
3. Keyboard navigation treats the focused node and its connections as a single list. Bounds are enforced at one place in the code.
4. WCAG 2.1 AA with senior-friendly minimums: 48 px touch targets, 15 px body / 16 px title, strong focus rings, ARIA list semantics, `prefers-reduced-motion` support.
5. Every click, key press, and ref access is well-defined. No `undefined[idx]`, no state that rolls off the end of the list.

## Non-goals

- Replacing `CardDetailModal` with inline expansion.
- Adding hover-preview or long-press context menus in the panel.
- Touch-target and a11y sweep for non-panel graph chrome (filter panel, cluster button, mode switcher). Tracked separately.
- Spatial arrow-key traversal of the graph canvas itself.

## Key Decisions

### Decision 1 — `activeIdx` lives inside `GraphDetailPanel`

**Options considered:**

- **A. Local to the panel.** `activeIdx` is a `useState` inside `GraphDetailPanel`. Parent passes `headItem` + `connections`. Panel owns the cursor.
- **B. Lifted to `GraphClient`.** Parent owns `activeIdx`, passes it down along with a setter. Canvas and panel can both read/write it.
- **C. Dedicated hook** (`useFocusSelection`) mirroring the existing `useClusterSelection.ts:70` pattern. Parent and panel both consume the hook.

**Chosen: A.**

**Reasoning:**

- The cursor is ephemeral. It doesn't need to survive reload, doesn't need to be shared across components, and doesn't need to be exposed to external consumers. Lifting it into the parent or a hook is ceremony without a return.
- The canvas does not need to read `activeIdx`. It already drives which node is focused via `focusedNodeId` (`GraphClient.tsx:334`). The panel reads `focusedNodeId` as a prop (via `focusedNodeMeta`), uses it to build `items[0]`, and manages `activeIdx` locally.
- The original design pass briefly proposed a `useFocusSelection` hook to mirror `useClusterSelection`. That's the right shape for state that has inputs from multiple call sites (the cluster selection hook is driven by long-press, toolbar buttons, and keyboard). Here there is only one caller — the panel itself. A hook adds a file, a re-export, a test surface, and zero benefit.
- Matches the "enforce simplicity" and "would a staff engineer look at this and say *why didn't you just...*" principles from `agent-skills:using-agent-skills`.

**Trade-off accepted:** if a future feature needs to drive `activeIdx` from outside the panel (e.g., a "jump to connection N" hotkey from the command palette), it will have to lift the state then. YAGNI for now.

### Decision 2 — head item is passed as a prop, not derived in the panel

**Options considered:**

- **A. Derive in the panel.** Panel accepts the existing `nodeTitle`, `nodeType`, `nodeColor`, `nodeTags` props and builds the head item internally.
- **B. Pass a `headItem: ConnectionItem` prop.** Parent builds the head item once; panel consumes it as-is and prepends it.

**Chosen: B.**

**Reasoning:**

- The parent (`GraphClient.tsx:1216-1222`) already computes `focusedNodeMeta` from the neighbor index maps. Building `headItem` there is one line of additional code at the site where all the source data already lives.
- Option A would require the panel to either keep the four primitive props (`nodeTitle`, etc.) AND also build an object from them (duplicating the shape), or churn through a prop rename. Option B lets the panel stop caring about the four primitives — it can delete those props in a future pass once the head-row conversion is proven.
- `ConnectionItem` already has the right shape. Reusing the type keeps the head row and connection rows literally identical at the rendering layer — same component, same props, same behavior — which is what "unified list" means architecturally.

**Head-item field mapping:**

```ts
headItem: ConnectionItem = {
  id: focusedNodeId,
  title: neighborIndex.titleMap[focusedNodeId],
  type: neighborIndex.typeMap[focusedNodeId],
  color: neighborIndex.colorMap[focusedNodeId],
  sharedTags: [],                            // N/A — no "shared with self"
  weight: focusedConnections.length,         // doubles as "# of connections"
}
```

The `weight` value lets the weight-indicator bar on the head row read as "this card has N connections", which is a usefully informative reuse of the existing visual vocabulary.

### Decision 3 — remove the canvas-side double-tap detector

**Options considered:**

- **A. Keep the 400 ms `lastTapRef` window as a safety net** for users who click fast.
- **B. Delete it entirely** and let `focusedNodeId === node.id` be the sole signal for "open the card."

**Chosen: B.**

**Reasoning:**

- Once every interaction opens on a single click, `isDoubleTap` becomes dead code. Its only callsite is the `||` branch at `GraphClient.tsx:920` where it is already OR'd with `focusedNodeId === node.id`. Removing it simplifies the handler from a five-branch state machine to a two-branch one.
- The 400 ms window was always a hack to paper over "first click focuses, second click opens" being two different actions. Now they're still two different actions — but each is a one-click action distinguished by state (`focusedNodeId`), not by a 400 ms race condition.

**Trade-off accepted:** users who habitually double-tap the canvas will land the second tap on the now-focused node, which also opens the modal. Same outcome as today, reached via a clearer code path.

### Decision 4 — keyboard has redundant axes (Up/Down and Left/Right)

**Options considered:**

- **A. Vertical only** (ArrowUp / ArrowDown). Left / Right are ignored in the panel; the prev / next buttons handle the horizontal axis.
- **B. Both axes equivalent.** Up ≡ Left (decrement); Down ≡ Right (increment).

**Chosen: B.**

**Reasoning:**

- The panel is visually a vertical list (rows stack top-to-bottom) but the existing prev / next chrome uses left / right arrows. Users who see the buttons reach for ← / →. Users who see the list reach for ↑ / ↓. Both expectations are legitimate.
- Supporting both is two lines of additional code. The cost is zero; the accessibility and discoverability payoff is real.
- Matches the screen-reader convention where `listitem` elements can be navigated via either axis depending on user-agent.

### Decision 5 — refocusing a new node does NOT auto-close the card modal

**Scenario:** user clicks node A → modal A opens. User clicks node B (not the focused one now, but the previously focused one — B is unrelated to A). What happens to modal A?

**Chosen:** leave modal A open. It has its own close affordance and its own Esc handler.

**Reasoning:**

- The modal is a full-screen overlay that intercepts keyboard and click events. The user cannot click node B on the graph canvas while modal A is open — the canvas is behind the modal. So the scenario cannot occur in practice.
- If the user uses the panel's keyboard nav to move `activeIdx` from row 1 to row 2 while modal A is showing row 1's content, that is also a no-op — the panel's nav doesn't auto-open the modal. Only Enter / Space / click opens it.
- Documented in tasks.md task 8.5.

### Decision 6 — `prefers-reduced-motion` is a hard cutoff, not a reduced animation

**Options considered:**

- **A. Reduced version of the slide-in** (faster, shorter distance, linear easing).
- **B. No animation at all** under `prefers-reduced-motion: reduce`.

**Chosen: B.**

**Reasoning:**

- `prefers-reduced-motion` is set by users with vestibular disorders, ADHD, or simply a preference for stillness. "Reduced" versions still move. The standard-compliant behavior is to disable movement entirely.
- Matches WCAG 2.1 Success Criterion 2.3.3 (Animation from Interactions).

## Data flow (after this change)

```
GraphClient
  ├─ focusedNodeId: state            (unchanged, line 334)
  ├─ focusedNodeMeta: derived        (unchanged, line 1216)
  ├─ focusedConnections: derived     (unchanged, line 766)
  ├─ headItem: derived               (NEW — built from focusedNodeMeta)
  └─ renders GraphDetailPanel
       ├─ props: headItem, connections, onClose, onCardClick, isMobile
       ├─ activeIdx: state, default 0          (renamed from selectedIdx)
       ├─ items: memo [headItem, ...connections]
       ├─ handleRowClick(idx):
       │    setActiveIdx(clampIdx(idx))
       │    openCard(items[idx])               ← guard: items[idx] != null
       ├─ keyboard effect: ↑↓←→ Home End Enter Space Esc
       └─ renders:
            ├─ list container with role="list"
            ├─ head row (button, role=listitem, aria-current if activeIdx===0)
            ├─ "Connected to · N nodes" | "No connections yet" label
            └─ connection rows (button, role=listitem, aria-current if activeIdx===idx)
```

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Playwright specs assert on the removed "Tap again to open" string. | Medium | Task 10.7 runs the full Playwright suite. Any failing assertion is updated or deleted in the same PR. |
| Users who discovered the "select-then-preview" pattern as a peek affordance lose it. | Low | There is no signal this was used as a peek. The hint text was instructional, not a feature surface. |
| Moving the close X button out of the panelHeader button (task 4.3) shifts its visual position. | Low | The X was top-right; it stays top-right as an absolute-positioned sibling with the same coordinates. Visual parity is preserved. |
| `prefers-reduced-motion` detection is unreliable on older Safari. | Low | Older Safari is not a supported target. If reduced-motion doesn't detect, the slide still plays — a soft failure, not a broken state. |
| Bumping row font sizes changes the panel's vertical rhythm and makes the connection list longer. | Medium | Visual QA in task 10.5. If overflow becomes an issue, reduce row padding slightly; do not reduce font sizes. |
| Removing `lastTapRef` changes the canvas click feel for users who habitually double-tap. | Low | Double-tap now lands the second click on the focused node, which opens the modal — same outcome. |

## Out of scope (reminder)

- A broader accessibility sweep of the graph chrome.
- An inline card expansion replacing `CardDetailModal`.
- Hover previews, long-press menus, peek affordances.
- Text-to-speech narration beyond `aria-live`.
- Full keyboard traversal of graph canvas nodes.
