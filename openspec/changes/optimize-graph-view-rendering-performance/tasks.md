# Tasks: optimize-graph-view-rendering-performance

Ordered by impact. Items within a group are parallelizable.

## Group 1 — Server (Critical path, unblocks everything)

- [x] **1.1** Replace nested-loop link builder in `api/src/services/enrichment/enrichment.ts` with inverted tag index (`tag → cardId[]`). Verify link correctness with unit test: given cards A/B/C with known tag overlaps, assert sharedTags and weight match expected values.
- [x] **1.2** Add in-process LRU cache (`Map<string, { value, expiresAt }>`, max 50 entries, 120 s TTL) to `graphData` resolver. Add `clearGraphCache(userId)` export.
- [x] **1.3** Call `clearGraphCache(userId)` from `saveCard`, `updateCard`, `deleteCard`, `archiveCard`, `unarchiveCard`, and `restoreCard` service functions to keep cache coherent.
- [x] **1.4** Validate: TypeScript check passes on `api/src/services/enrichment/enrichment.ts` and `api/src/services/cards/cards.ts` — zero errors in changed files.

## Group 2 — Client canvas hot path (High impact, parallel with Group 1)

- [x] **2.1** In `GraphClient.tsx`: replaced `isDarkMode()` inline calls with a `darkModeRef` initialized at mount, updated via `mql.addEventListener('change', ...)`. `isDarkMode()` function removed; no longer called in canvas loop.
- [x] **2.2** In `GraphClient.tsx`: hoisted fixed font strings to module-level constants (`FONT_LABEL_PROMINENT`, `FONT_LABEL_NORMAL`, `FONT_ORPHAN_INITIAL`, `FONT_TAG_LABEL`). All `ctx.font` literals in canvas callbacks replaced with constants.
- [x] **2.3** In `GraphClient.tsx`: replaced both `Math.max(1, ...array.map(...))` spreads with `.reduce()` for `maxWeight` and `maxConnections`.
- [x] **2.4** In `GraphClient.tsx`: wrapped `mousemove` tooltip handler with RAF guard. Pending RAF cancelled on effect cleanup.
- [x] **2.5** Validate: TypeScript check passes on all web graph components — zero errors.

## Group 3 — React memo boundaries (Medium impact, parallel with Group 2)

- [x] **3.1** In `GraphListView.tsx`: wrapped all computations (`titleMap`, `typeMap`, `colorMap`, `connectionMap`, `sortedNodes`, `uniqueTypes`, `showTypeBadge`, `orphanCount`) in a single `useMemo(() => { ... }, [nodes, links])`.
- [x] **3.2** In `GraphDetailPanel.tsx`: exported as `memo(GraphDetailPanelInner)`. Behavior unchanged.
- [x] **3.3** In `GraphFilterPanel.tsx`: exported as `memo(GraphFilterPanelInner)`. Behavior unchanged.
- [x] **3.4** In `GraphTooltip.tsx`: exported as `memo(GraphTooltipInner)`. Behavior unchanged.
- [x] **3.5** Validate: `yarn rw check` — 1 pre-existing error in `apiTokens.sdl.ts` (SERVICE_NOT_IMPLEMENTED, unrelated). Zero errors in any changed file.

## Group 4 — Final verification

- [x] **4.1** TypeScript check clean on all changed files (api/services/enrichment, api/services/cards, all web graph components).
- [x] **4.2** `isDarkMode()` confirmed absent from canvas render loop via grep.
- [ ] **4.3** Manual smoke test: open graph with 500+ nodes, hover nodes at speed, click to focus, verify tooltip, detail panel, filter panel all work correctly.
- [ ] **4.4** Commit with message: `perf(graph): O(n·k) link index, LRU cache, memo boundaries, RAF tooltip`

## Dependencies

- Group 2 and 3 are independent and can be worked in parallel with Group 1.
- Group 4 depends on Groups 1, 2, and 3.
