## Why

The graph view is architecturally sound — viewport culling, LOD rendering, Web Worker physics, focus-mode dimming — but several measured hot paths undermine it at scale:

1. **Server**: link computation is O(n²) over all card pairs. At 1,000 cards that is ~500 k tag-intersection comparisons per request. At 2,000 cards it is ~2 M. This is the single largest latency source.
2. **Client canvas**: `isDarkMode()` (`window.matchMedia`) is called on every `requestAnimationFrame` inside the hot canvas paint path — dozens of times per second.
3. **Client React**: `GraphListView` rebuilds four `Map` objects plus a full `Array.sort` on every render because it has no `useMemo`. Anything that causes a parent re-render (e.g. tooltip position update) triggers full recomputation.
4. **Client React**: `GraphDetailPanel`, `GraphFilterPanel`, and `GraphTooltip` have no `React.memo` boundary, so they re-render on every `hoveredNode` state change — which fires on every mouse-move pixel.
5. **Client React**: tooltip position is set via `setState` on every `mousemove` event (unbatched, no RAF throttle), creating a render loop at 60+ fps.
6. **Client canvas**: font strings are allocated via template literals on every frame in the hot node-draw path.
7. **Client canvas**: `Math.max(1, ...largeArray.map())` uses spread — slow and stack-unsafe above ~10 k elements. Should use `reduce`.

Fixing these seven issues is additive-only (no public API changes, no schema changes) and delivers the fastest possible graph experience on both desktop and mobile Safari.

## What Changes

- Replace the O(n²) nested loop in the `graphData` resolver with an inverted tag index, reducing link computation from O(n²) to O(n·k) where k is average tags per card.
- Cache the resolved `graphData` result per `(userId, spaceId, tag, minWeight)` key with a short TTL so repeated page loads skip recomputation entirely.
- Fix `isDarkMode()` to compute once per component mount and update via `MediaQueryList` event — not per canvas frame.
- Wrap `GraphListView` body in `useMemo` so Maps and sort run only when `nodes` or `links` references change.
- Add `React.memo` to `GraphDetailPanel`, `GraphFilterPanel`, and `GraphTooltip`.
- Throttle tooltip `mousemove` handler with `requestAnimationFrame`.
- Replace `Math.max(1, ...array.map())` spreads with `array.reduce()`.
- Hoist canvas font strings to module-level constants.

## Capabilities

### Modified Capabilities
- `graph-view-overhaul` (existing spec in `platform-hardening-auth-export-visual-fidelity`) — performance sub-layer: server link indexing and client render optimizations. This change is a prerequisite to the full overhaul; it improves the existing `react-force-graph-2d` canvas path that remains the current production renderer.

### New Capabilities
- `server-graph-link-index`: Inverted tag index + result cache for the `graphData` resolver.
- `client-graph-render-optimizations`: Canvas hot-path fixes, React memo boundaries, RAF-throttled tooltip.

## Impact

- **API** (`api/src/services/enrichment/enrichment.ts`): Replace nested loop with inverted index. Add in-process LRU cache (no new infra).
- **Web** (`GraphClient.tsx`, `GraphListView.tsx`, `GraphDetailPanel.tsx`, `GraphFilterPanel.tsx`, `GraphTooltip.tsx`): Pure client-side React/canvas fixes. Zero schema or API surface changes.
- **No breaking changes.** All changes are internal implementation details.
