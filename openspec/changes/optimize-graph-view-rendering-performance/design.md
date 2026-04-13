## Context

The BYOA graph renders a force-directed knowledge graph. All data flows from a single `graphData` GraphQL query:

```
Prisma (cards) → graphData resolver → GraphCell → GraphClient → ForceGraph2D canvas
```

Performance audit identified seven hot paths across two layers.

```mermaid
mindmap
  root((Graph Perf))
    Server
      O(n²) link build
        Inverted tag index
        O(n·k) replacement
      Repeated recompute
        In-process LRU cache
    Client Canvas
      isDarkMode per frame
        Mount-time ref + listener
      Font string allocs
        Module constants
      Math.max spread
        reduce replacement
    Client React
      GraphListView no memo
        useMemo wrapping
      Panel re-renders
        React.memo guards
      Tooltip setState loop
        RAF throttle
```

---

## Architecture Decisions

### A — Server: Inverted Tag Index

**Problem**: Current resolver (`enrichment.ts`) builds links with:
```ts
for (let i = 0; i < cards.length; i++)
  for (let j = i + 1; j < cards.length; j++)
    const shared = a.tags.filter(t => b.tags.includes(t))
```
This is O(n²) outer loop × O(k) intersection = O(n²·k). At n=1000, k=5: ~2.5 M operations per request.

**Fix**: Build an inverted index `tag → Set<cardId>`, then for each tag enumerate all card pairs sharing that tag. Complexity becomes O(n·k + E) where E is the number of links (typically much smaller than n²).

```ts
// Build index: tag → [cardId, ...]
const tagIndex = new Map<string, string[]>()
for (const card of cards) {
  for (const tag of card.tags) {
    const bucket = tagIndex.get(tag) ?? []
    bucket.push(card.id)
    tagIndex.set(tag, bucket)
  }
}

// Enumerate pairs per tag
const pairShared = new Map<string, Set<string>>()
for (const [tag, ids] of tagIndex) {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = ids[i] < ids[j] ? `${ids[i]}::${ids[j]}` : `${ids[j]}::${ids[i]}`
      const tags = pairShared.get(key) ?? new Set()
      tags.add(tag)
      pairShared.set(key, tags)
    }
  }
}
```

For sparse graphs (few cards share many tags), this is 10–100× faster than the nested loop.

### B — Server: In-Process LRU Cache

The graph rarely changes between page loads within a session. A simple Map-based LRU (max 50 entries, 2-minute TTL) per Node process eliminates recomputation on repeated visits.

**Trade-off**: Stale data risk — max 2 minutes. Acceptable for a knowledge graph where card adds are infrequent. Cache is invalidated on card mutation via a `clearGraphCache(userId)` call in the card service.

**Implementation**: Use a plain `Map<string, { value, expiresAt }>` with LRU eviction on max-size. No new dependencies.

### C — Canvas: `isDarkMode()` Ref Pattern

**Problem**: `isDarkMode()` calls `window.matchMedia?.('(prefers-color-scheme: dark)').matches` on every canvas paint frame (≥60 fps). Each call queries the browser's style engine.

**Fix**: Compute once in a `useRef`, update via `MediaQueryList.addEventListener('change', ...)`.

```ts
const darkModeRef = useRef(isDarkMode())
useEffect(() => {
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => { darkModeRef.current = e.matches }
  mql.addEventListener('change', handler)
  return () => mql.removeEventListener('change', handler)
}, [])
```

In `nodeCanvasObject` and `linkCanvasObject`: replace `isDarkMode()` → `darkModeRef.current`.

### D — Canvas: Font String Constants

Canvas font-setting triggers style recalculation when the string changes. Hoisting to module-level constants:
- Eliminates template literal allocation per frame
- Allows the browser to cache the parsed font descriptor

```ts
// Module-level constants (zero cost per frame)
const FONT_LABEL_PROMINENT = '600 12px Inter, system-ui, sans-serif'
const FONT_LABEL_NORMAL    = '10px Inter, system-ui, sans-serif'
const FONT_INITIAL_PREFIX  = '700 '  // + `${size}px Inter...` (size varies — unavoidable)
const FONT_ORPHAN_INITIAL  = '600 5px Inter, system-ui, sans-serif'
const FONT_TAG_LABEL       = '9px Inter, system-ui, sans-serif'
```

The per-node initial font size still varies with `radius`, so that one string remains dynamic. All fixed-size strings become constants.

### E — Canvas: `Math.max` Spread → `reduce`

```ts
// BAD — spread copies entire array onto call stack
const maxWeight = Math.max(1, ...graphData.links.map(l => l.weight))

// GOOD — O(n) single pass, stack-safe
const maxWeight = graphData.links.reduce((m, l) => Math.max(m, l.weight), 1)
```

Already inside `useMemo` so runs only on data change — but the spread form is still stack-unsafe above ~100 k elements.

### F — React: `useMemo` in `GraphListView`

`GraphListView` currently runs this on every render:
```ts
const titleMap = new Map(nodes.map(...))
const typeMap = new Map(nodes.map(...))
const colorMap = new Map(nodes.map(...))
const connectionMap = new Map<string, ConnectionPreview[]>()
// + full links loop + Array.sort
```

These computations depend only on `nodes` and `links` props. Wrapping in `useMemo` means they run only when prop references change — not when a parent state update (e.g., `selectedCardId`) causes GraphClient to re-render.

### G — React: `React.memo` Guards

`GraphDetailPanel`, `GraphFilterPanel`, and `GraphTooltip` re-render on every `hoveredNode` state change (every mouse-move pixel over the canvas). None of these components depend on `hoveredNode`:

| Component | Re-renders on hover? | Needed? |
|-----------|---------------------|---------|
| `GraphDetailPanel` | Yes | No — only changes on `focusedNodeId` |
| `GraphFilterPanel` | Yes | No — only changes on `minWeight` / counts |
| `GraphTooltip` | Yes | Yes — it IS the hover display |

Adding `React.memo` to `GraphDetailPanel` and `GraphFilterPanel` eliminates these. `GraphTooltip` receives `node` and `position` as props; with `React.memo` it only re-renders when those change (which is correct).

### H — React: RAF-Throttled Tooltip

```ts
// BEFORE: setState on every mousemove (60+ calls/sec)
window.addEventListener('mousemove', (e) => {
  if (hoveredNode) setTooltipPos({ x: e.clientX, y: e.clientY })
})

// AFTER: RAF-throttled, skips frames if no pending update
const rafRef = useRef<number | null>(null)
window.addEventListener('mousemove', (e) => {
  if (!hoveredNode) return
  if (rafRef.current !== null) return  // skip if frame pending
  rafRef.current = requestAnimationFrame(() => {
    rafRef.current = null
    setTooltipPos({ x: e.clientX, y: e.clientY })
  })
})
```

This reduces tooltip re-renders from ~60/sec to ≤ display refresh rate, and only when hovering a node.

---

## Performance Budget Targets

| Metric | Current (estimated) | Target |
|--------|--------------------|----|
| `graphData` resolver at n=1000 | ~50–200 ms | < 10 ms |
| `graphData` resolver at n=2000 | ~200–800 ms | < 20 ms |
| Cached repeat request | ~50–200 ms | < 1 ms |
| Canvas frame time (idle hover) | React re-renders on every frame | 0 React re-renders |
| `GraphListView` render time | Full Map rebuild + sort | Only on data change |
| Tooltip update rate | ~60+ React renders/sec | ≤ 1 per rAF |

---

## Files Changed

| File | Change | Tier |
|------|--------|------|
| `api/src/services/enrichment/enrichment.ts` | Inverted tag index + LRU cache | Critical |
| `web/src/components/GraphClient/GraphClient.tsx` | darkMode ref, RAF throttle, reduce, font constants | High |
| `web/src/components/GraphListView/GraphListView.tsx` | useMemo for all Maps + sort | High |
| `web/src/components/GraphDetailPanel/GraphDetailPanel.tsx` | React.memo | Medium |
| `web/src/components/GraphFilterPanel/GraphFilterPanel.tsx` | React.memo | Medium |
| `web/src/components/GraphTooltip/GraphTooltip.tsx` | React.memo | Medium |
