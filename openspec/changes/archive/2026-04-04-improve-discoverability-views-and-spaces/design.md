## Context

The current product makes users choose between a masonry feed and a separate graph route, with no resilient middle path when the graph renderer fails or the graph is too sparse to read. Spaces compound that problem by using an older presentation layer, which breaks the feeling of one coherent browsing system.

The product goal is maximum discoverability with minimum scrolling and clicking. That means every major browsing surface should support a denser retraceable view, and the graph route should degrade into something useful instead of a dead end.

## Goals / Non-Goals

**Goals:**
- Add a persistent list view for collection pages that already use feed card records.
- Keep the graph route usable when the force-directed canvas is unavailable or low-signal.
- Align space index/detail surfaces with the visual quality of the main library.

**Non-Goals:**
- Replace the force graph with a new graph engine.
- Redesign every navigation surface in the app header.
- Build a full tree editor or nested folder model for spaces.

## Decisions

### Decision: Reuse feed card primitives for collection list views
Collection pages already share feed-card data and visual primitives. The list view should be built from the same visual/body pieces instead of inventing a parallel card renderer.

Alternative considered: reuse the older `CardGridClient` list mode everywhere.
Why rejected: it is a broader legacy path with separate concerns and more mutation logic than needed for the current Redwood feed surfaces.

### Decision: Add a graph relationship index instead of only showing error/empty states
The graph route will offer a list/index mode backed by the same node/link data so users can still retrace related cards even if the canvas renderer fails or the graph is sparse.

Alternative considered: only improve empty/error copy on the graph page.
Why rejected: better copy does not solve the discoverability failure.

### Decision: Harden canvas labels for broader browser support
The graph canvas should avoid relying exclusively on newer APIs such as `CanvasRenderingContext2D.roundRect` without a fallback path.

Alternative considered: leave the existing implementation and treat graph issues as device-specific.
Why rejected: mobile/browser compatibility issues directly undermine the route.

### Decision: Align spaces with the main browsing shell
Space detail should share the same count/toggle/header behavior as the library, and the spaces index should use richer, clearer surface cards instead of an older utility layout.

Alternative considered: defer spaces cleanup until after graph/list work ships.
Why rejected: it would preserve an obvious product inconsistency right next to the new discoverability work.

## Risks / Trade-offs

- [More view modes can add UI chrome] → Mitigation: keep toggles compact and colocated with existing page metadata.
- [Graph list mode may duplicate some graph information] → Mitigation: optimize it for retracing connections and opening cards, not for visual novelty.
- [Persisted view preferences can surprise users across routes] → Mitigation: persist by surface type (`library`, `search`, `space`, `graph`) instead of globally.

## Migration Plan

1. Add the OpenSpec change.
2. Introduce shared view-mode helpers and collection list rendering.
3. Update library/search/space detail pages to use persistent grid/list modes.
4. Add graph list/index mode and canvas hardening.
5. Refresh spaces index styling.
6. Validate with build and React-focused checks.
