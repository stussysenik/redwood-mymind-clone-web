## Why

The product still hides too much behind one brittle browsing mode at a time. The graph route can fail or become sparse enough to feel broken, the main library has no persistent list-style alternative for fast retracing, and spaces still present an older interface that feels disconnected from the main feed. We need a discoverability layer that stays usable when the canvas graph degrades and that reduces scrolling/clicking across library and space browsing.

## What Changes

- Add persistent grid/list discoverability views for card collections so library, search, and space detail pages can switch between masonry browsing and a denser retraceable list.
- Harden graph browsing so the route stays useful when the canvas renderer fails or the graph is sparse by adding a relationship list/index view.
- Refresh spaces surfaces so the spaces index and space detail pages use the same cleaner browsing language as the main library.

## Capabilities

### New Capabilities
- `discoverability-views`: Users can switch collection pages between grid and list views without losing the underlying data context.
- `graph-fallback-index`: The graph route remains explorable through a list/index view even when force-graph rendering is unavailable or low-signal.
- `space-surface-consistency`: Spaces use the same polished browsing conventions as the primary library.

### Modified Capabilities

- None.

## Impact

- Affected code: `web/src/components/CardsCell`, `web/src/components/SearchCell`, `web/src/components/SpaceCell`, `web/src/components/SpacesCell`, `web/src/components/GraphClient`, shared feed/view helpers, and related layout components.
- Affected systems: library browsing, search result browsing, graph exploration, and spaces UX.
