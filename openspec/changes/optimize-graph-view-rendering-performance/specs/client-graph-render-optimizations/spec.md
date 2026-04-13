## Capability: client-graph-render-optimizations

Eliminates five classes of unnecessary work in the graph view client: per-frame dark mode queries, React re-renders from missing memo boundaries, unthrottled tooltip state updates, missing `useMemo` in list view, and `Math.max` spread anti-patterns.

## ADDED Requirements

### Requirement: Dark mode computed once, not per canvas frame

`GraphClient` MUST compute dark mode preference at mount time into a `useRef` and update it only via a `MediaQueryList` `change` event listener. The `isDarkMode()` function MUST NOT be called inside `nodeCanvasObject` or `linkCanvasObject`.

#### Scenario: Dark mode ref initializes at mount

Given a user opens the graph view,
When the `GraphClient` component mounts,
Then `darkModeRef.current` reflects the current `prefers-color-scheme` at that moment.

#### Scenario: Canvas labels use correct color after dark mode change

Given the graph is open in light mode,
When the user switches their OS to dark mode,
Then on the next canvas frame, node labels and edge tag labels use the dark palette (`#F5EFE5` / `#C4B5A0`).

#### Scenario: No `isDarkMode()` calls during canvas render loop

Given a profiler trace of 100 canvas frames,
When a node with a label is rendered in each frame,
Then `window.matchMedia` is called 0 times during those frames (only 0–1 calls total at mount/change).

### Requirement: Canvas font strings hoisted to module-level constants

All fixed-size font strings used in `nodeCanvasObject` and `linkCanvasObject` MUST be defined as module-level `const` values. Only the per-node initial font (whose size varies with node radius) may remain as a dynamic template literal.

#### Scenario: Fixed font strings are constants

Given the `GraphClient` module is loaded,
Then the strings for label-prominent, label-normal, orphan-initial, and tag-label fonts are constants defined outside any function or component.

### Requirement: `Math.max` spread replaced with `reduce`

All `Math.max(1, ...<array>.map(...))` patterns in `GraphClient` MUST be replaced with `<array>.reduce((m, x) => Math.max(m, x.field), 1)`.

#### Scenario: maxWeight computed with reduce

Given `graphData.links` has 10,000 entries,
When `maxWeight` is computed,
Then no `RangeError: Maximum call stack size exceeded` is thrown and the correct maximum is returned.

### Requirement: Tooltip position updates RAF-throttled

The `mousemove` handler in `GraphClient` that calls `setTooltipPos` MUST be wrapped in a `requestAnimationFrame` guard so at most one `setTooltipPos` call is issued per animation frame.

#### Scenario: Tooltip renders at most once per animation frame

Given the user moves the mouse at 200+ events/sec over a hovered node,
When the tooltip position is updated,
Then `setTooltipPos` is called at most 60 times per second (capped to display refresh rate).

#### Scenario: RAF handle is cancelled on unmount

Given the tooltip mousemove handler has a pending RAF handle,
When the `GraphClient` component unmounts,
Then the pending `requestAnimationFrame` is cancelled via `cancelAnimationFrame`.

### Requirement: `GraphListView` computations memoized

The `titleMap`, `typeMap`, `colorMap`, `connectionMap`, `sortedNodes`, `uniqueTypes`, `showTypeBadge`, and `orphanCount` computations in `GraphListView` MUST be wrapped in `useMemo` with `[nodes, links]` as the dependency array.

#### Scenario: Maps not rebuilt on unrelated parent re-render

Given `GraphListView` is rendered with a stable `nodes` and `links` reference,
When the parent component re-renders due to unrelated state (e.g., `selectedCardId` changing),
Then `titleMap`, `typeMap`, `colorMap`, `connectionMap`, and `sortedNodes` are NOT recomputed.

#### Scenario: Maps rebuilt when nodes prop changes

Given `GraphListView` is rendered with an initial `nodes` array,
When the `nodes` prop reference changes (new data from GraphQL),
Then `titleMap` and all derived Maps are recomputed.

### Requirement: `GraphDetailPanel`, `GraphFilterPanel`, and `GraphTooltip` wrapped in `React.memo`

All three components MUST be exported as `React.memo`-wrapped components so they do not re-render unless their own props change.

#### Scenario: `GraphDetailPanel` does not re-render on tooltip hover

Given a node is focused (detail panel visible),
When the user moves the mouse over a different node (changing `hoveredNode` state in `GraphClient`),
Then `GraphDetailPanel` does NOT re-render (verified via React DevTools Profiler or component render counter).

#### Scenario: `GraphFilterPanel` does not re-render on tooltip hover

Given the graph is in idle state,
When the user moves the mouse across multiple nodes (updating tooltip position),
Then `GraphFilterPanel` does NOT re-render.

#### Scenario: `GraphTooltip` re-renders only when node or position changes

Given `GraphTooltip` is displaying a node tooltip,
When the user moves the mouse 10 pixels (position changes),
Then `GraphTooltip` re-renders exactly once per RAF-throttled position update.
When the user moves off the node (node becomes null),
Then `GraphTooltip` re-renders once to clear.
