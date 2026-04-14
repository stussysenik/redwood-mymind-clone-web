## Capability: graph-view-accessibility

Owns the presentation-layer accessibility invariants of the `/graph` surface: readable content-summary stats, keyboard- and touch-operable controls, visible-on-every-viewport dimensionality switching, and screen-reader-friendly dynamic updates. Distinct from `graph-view-overhaul` (owned by `fix-3d-graph-and-complete-clusters`), which governs renderer mechanics. This capability is the a11y floor for the graph.

## ADDED Requirements

### Requirement: Graph stats strip has accessible content summary

The graph filter panel MUST announce node count, edge count, and unconnected-node count as a single accessible group. The announcement MUST use full words ("nodes", "edges", "unconnected") regardless of viewport so screen readers are never handed the `n`/`e`/`solo` shorthand. On viewports ≥ 640 px, the visible text MUST also use full words. On viewports < 640 px, the compact shorthand MAY remain visible for sighted users; the accessible announcement remains the full-word form.

When `orphanCount === 0`, the "unconnected" segment MUST be omitted from both the visible text and the accessible label so users are not read a spurious "0 unconnected."

The edge-strength slider's `aria-label` MUST be a sentence describing its current function — not a field name. It MUST reflect the current `minWeight` value and pluralize correctly.

#### Scenario: Screen reader hears full words on mobile

Given a user on `/graph` with a mobile viewport (< 640 px),
When their screen reader focuses the stats region,
Then the announcement matches `/Graph contents: \d+ nodes, \d+ edges(, \d+ unconnected)?/` — never the `n`/`e`/`solo` shorthand.

#### Scenario: Sighted user sees full words on desktop

Given a user on `/graph` with a desktop viewport (≥ 640 px),
When the stats region renders,
Then the visible text contains the substrings `"nodes"`, `"edges"`, and (when applicable) `"unconnected"`.

#### Scenario: Compact shorthand stays on mobile

Given a user on `/graph` with a mobile viewport (< 640 px),
When the stats region renders,
Then the visible text matches `/\d+n \/ \d+e/` to preserve the existing tight layout near the slider.

#### Scenario: Zero orphans are not announced

Given a graph with 8 nodes and 11 edges where every node has at least one edge,
When the stats region renders,
Then neither the visible text nor the `aria-label` contains the word "unconnected" or "solo".

#### Scenario: Slider label reflects current threshold

Given the edge-strength slider is at `minWeight = 3`,
When a screen reader queries the slider,
Then its accessible label matches `/Edge strength filter.*at least 3 shared tags/` (plural "tags", not "tag").

#### Scenario: Slider label singularises at one

Given the edge-strength slider is at `minWeight = 1`,
When a screen reader queries the slider,
Then its accessible label contains `at least 1 shared tag` (singular "tag", not "tags").

### Requirement: 2D/3D dimensionality toggle is visible on every viewport

`/graph` MUST render a dimensionality toggle in the graph chrome at every viewport size. The toggle MUST be a segmented control with two radio buttons labeled `2D` and `3D`, wrapped in a `role="radiogroup"` with `aria-label="Graph dimensionality"`. Each button MUST meet the minimum touch-target requirement of 44×44 CSS pixels per WCAG 2.5.5 (Target Size) on mobile-touch devices, and remain operable with `Tab`, `Space`, and `Enter` on desktop keyboards.

Viewport gating via `sm:hidden`, `md:flex`, `hidden mobile:flex`, or equivalent CSS that removes the toggle on any viewport is FORBIDDEN by this requirement.

When the user taps `3D`, a `<canvas>` element with a non-null `webgl` or `webgl2` context MUST be mounted within 4 seconds. When the user taps `2D`, the previously active 2D backend MUST re-mount and the graph data MUST NOT be refetched.

#### Scenario: Mobile Safari renders the toggle

Given a user on an iPhone-class viewport (Playwright `Mobile Safari` project),
When they navigate to `/graph`,
Then an element matching `[role=radiogroup][aria-label="Graph dimensionality"]` is visible, both its `[role=radio]` children have `boundingBox()` dimensions of at least 44×44 CSS pixels, and the `2D` button has `aria-checked="true"` by default.

#### Scenario: Desktop Chrome renders the toggle

Given a user on a 1440×900 viewport (Playwright `Desktop Chrome` project),
When they navigate to `/graph`,
Then the same toggle is visible with the same accessibility attributes.

#### Scenario: Tapping 3D mounts a WebGL canvas

Given a user on `/graph` with the toggle showing `2D` as checked,
When they tap the `3D` button,
Then within 4 seconds a `<canvas>` element exists whose `getContext('webgl2') || getContext('webgl')` returns a non-null context, and the `3D` button's `aria-checked` attribute is `"true"`.

#### Scenario: Tapping 2D returns to the prior backend without refetch

Given a user on `/graph` with `graphRenderer === 'webgl'` and the toggle showing `3D` as checked,
When they tap the `2D` button,
Then the `ThreeGraphRenderer` unmounts, the `WebGLGraphRenderer` mounts, and no additional GraphQL queries for graph data are issued (verified by counting `page.on('response')` calls before and after the toggle).

#### Scenario: Keyboard operation on desktop

Given a user on `/graph` with a desktop viewport and the toggle currently at `2D`,
When they focus the toggle with `Tab` and press `ArrowRight` or `Space`,
Then the `3D` button becomes checked and the WebGL canvas mounts identically to the tap path.

### Requirement: Dimension toggle source is committed to version control

`web/src/components/GraphDimensionToggle/GraphDimensionToggle.tsx` MUST be tracked by git (not `??` untracked). `web/src/components/GraphClient/GraphClient.tsx` MUST contain an `import { GraphDimensionToggle } from 'src/components/GraphDimensionToggle/GraphDimensionToggle'` line and a JSX mount inside the top-right chrome block.

This requirement exists because prior verification found the component on disk but not in the deployment pipeline. The requirement makes shippability a first-class invariant of the spec.

#### Scenario: Git status shows toggle as tracked

Given the repository at HEAD after this change lands,
When `git ls-files web/src/components/GraphDimensionToggle/GraphDimensionToggle.tsx` runs,
Then it prints the file path (the file is tracked) and `git status` does not show the file under "Untracked files".

#### Scenario: GraphClient imports the toggle

Given the repository at HEAD after this change lands,
When `grep -n "GraphDimensionToggle" web/src/components/GraphClient/GraphClient.tsx` runs,
Then it returns at least one import line and at least one JSX usage line.
