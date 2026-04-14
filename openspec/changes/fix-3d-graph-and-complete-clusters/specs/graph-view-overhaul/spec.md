## Capability: graph-view-overhaul

Extends the graph view with a user-visible 2D/3D dimensionality toggle, a Three.js renderer that actually renders at all tilt values, Three pointer wiring (hover / click / long-press), and neighbor-aware focus dimming on the WebGL backend. The existing renderer picker (Canvas / WebGL / Three) is demoted to a 2D backend preference and lives alongside the new dimensionality axis.

## ADDED Requirements

### Requirement: `graphDimension` preference column

`UserPreferences` MUST include a `graphDimension: '2d' | '3d'` column, default `'2d'`, NOT NULL. The API `userPreferences` service MUST read and write it. The GraphQL `UserPreferences` type MUST expose it, and `UpdateUserPreferencesInput` MUST accept it.

#### Scenario: Existing users default to 2D

Given a user with no prior `graphDimension` value,
When `userPreferences` is queried for that user,
Then the returned `graphDimension` is `'2d'`.

#### Scenario: Rejected invalid values

Given an `UpdateUserPreferencesInput` with `graphDimension: '4d'`,
When the mutation runs,
Then the request fails validation with a clear error message and the stored value is unchanged.

#### Scenario: Persisted across sessions

Given a user sets `graphDimension` to `'3d'`,
When they sign out and sign back in,
Then the first load of `/graph` mounts the Three renderer without any user input.

### Requirement: In-graph 2D/3D dimensionality toggle

`GraphClient` MUST render a segmented control with labels `2D` and `3D` in the graph chrome at the top-right. Touch targets MUST be at least 44 px tall. The control's active state MUST mirror the graph/list mode switcher's visual language.

Selecting `3D` MUST set `graphDimension` to `'3d'` via `setGraphDimension`, mount `ThreeGraphRenderer`, and pass `initialTilt={0.35}` on first mount. Selecting `2D` MUST set `graphDimension` to `'2d'`, unmount `ThreeGraphRenderer`, and mount the currently selected 2D backend (from `graphRenderer`, with `three` coerced to `canvas`).

The toggle MUST be disabled for 200 ms after each change to prevent double-mounts during the cross-fade.

#### Scenario: Toggle to 3D mounts Three with visible tilt

Given a user on `/graph` with `graphDimension === '2d'`,
When they tap the `3D` segment,
Then `ThreeGraphRenderer` mounts, the camera starts at `tilt = 0.35`, and the graph shows clear depth banding along the z-axis within 200 ms.

#### Scenario: Toggle back to 2D remounts the last 2D backend

Given a user on `/graph` with `graphRenderer === 'webgl'` and `graphDimension === '3d'`,
When they tap the `2D` segment,
Then `ThreeGraphRenderer` unmounts, `WebGLGraphRenderer` mounts, and the graph data is preserved without a refetch.

#### Scenario: Double-tap is rate-limited

Given a user on `/graph`,
When they tap `3D`, then immediately tap `2D` within 100 ms,
Then only the first tap takes effect; the second tap is a no-op until the 200 ms guard window elapses.

### Requirement: Three renderer camera renders at every tilt value

`ThreeGraphRenderer` MUST instantiate a pair of cameras pointing at `(width/2, height/2, 0)`: an `OrthographicCamera` sized to the canvas dimensions for tilt `< 0.05`, and a `PerspectiveCamera` with `fov = 45°` and `position.z` derived so the perspective frustum matches the orthographic frustum at `z = 0` for tilt `≥ 0.05`. Per-frame, the renderer MUST select `activeCam = tiltRef.current < 0.05 ? orthoCam : perspCam` and render the scene with that camera.

The perspective camera MUST orbit its target using `sin(tilt · π/4)` for the y offset and `cos(tilt · π/4) · dist` for the z offset, so the graph appears to rotate around its center as tilt increases.

#### Scenario: Flat tilt shows every node

Given `nodes.length === 20` distributed across an 800-unit canvas,
When the renderer mounts with `tilt = 0`,
Then all 20 nodes are within the orthographic frustum and visible in the rendered canvas.

#### Scenario: 3D tilt shows z-stratified depth

Given nodes with `TYPE_Z` values spanning `[-100, +100]`,
When the renderer mounts with `tilt = 0.35`,
Then nodes at positive z appear visually higher on screen than nodes at negative z (the perspective camera is tilted forward).

#### Scenario: Camera does NOT use the prior fov=1° perspective

Given any tilt value,
When inspecting `activeCam`,
Then `activeCam.fov` (if defined) is never `1°` — the flat-at-rest case uses `OrthographicCamera`, not a narrow-fov perspective.

### Requirement: Three renderer invokes click and hover callbacks via raycasting

`ThreeGraphRenderer` MUST instantiate a `THREE.Raycaster` with `params.Points.threshold = 12` (screen-space pixels at default camera distance, recomputed to world units on resize). On `pointermove` events over the canvas, the renderer MUST project the pointer into normalized device coordinates, raycast against the `pointCloud` `THREE.Points` object, and invoke `onHoverRef.current(nodeId | null)` with the nearest hit's node id or `null` if no hit.

On a `pointerup` event within 8 px of `pointerdown` and 250 ms of press start, the renderer MUST invoke `onClickRef.current(nodeId)` where `nodeId` is the picked node.

Pointer events MUST NOT fire while `isDraggingHandle.current` is `true` (tilt drag suppresses hover / click).

#### Scenario: Hover over a node fires onHover

Given the 3D canvas is mounted with at least one visible node,
When the user moves the pointer over that node,
Then `onNodeHover(nodeId)` is called with the node's id within one animation frame.

#### Scenario: Tap on a node fires onClick

Given the 3D canvas is mounted,
When the user presses down on a node and releases within 250 ms and 8 px,
Then `onNodeClick(nodeId)` is called with the node's id.

#### Scenario: Tilt drag does not fire click

Given the user is actively dragging the tilt handle,
When they lift the pointer within 250 ms,
Then `onNodeClick` is NOT called (the drag suppresses tap detection).

### Requirement: Three renderer supports long-press cluster selection

`ThreeGraphRenderer` MUST detect a long-press on any node: `pointerdown` starts a 300 ms timer, `pointermove` of more than 10 px cancels the timer, and timer firing invokes `haptic('medium')` followed by `onLongPressNode(nodeId)` with the picked node's id.

During an active press, the `pointermove` listener MUST be attached to `window` (not the canvas) so pointer movement over the tilt handle or elsewhere still cancels the long-press cleanly.

#### Scenario: 300 ms hold fires onLongPressNode

Given the 3D canvas is mounted with a visible node,
When the user presses down on the node and holds for 300 ms without moving more than 10 px,
Then `haptic('medium')` is called and `onLongPressNode(nodeId)` is called with the node's id.

#### Scenario: Moving cancels the long-press

Given the user is holding down on a node,
When they drag more than 10 px before the 300 ms timer fires,
Then the timer is cancelled and `onLongPressNode` is NOT called.

#### Scenario: Release before threshold fires tap, not long-press

Given the user presses on a node and releases after 200 ms within 8 px,
When the press state machine resolves,
Then `onNodeClick` is called and `onLongPressNode` is NOT.

### Requirement: `GraphRendererProps` accepts long-press and neighbor set props

`GraphRendererProps` (shared by Canvas, WebGL, and Three backends) MUST include:

- `onLongPressNode?: (nodeId: string) => void` — optional; only the Three backend invokes it today.
- `neighborSetsByNode?: Map<string, Set<string>>` — optional; Canvas ignores (has its own neighbor logic); WebGL uses for focus dimming.

Canvas and WebGL backends MUST accept both props without breaking existing behavior when they are omitted.

#### Scenario: Canvas backend ignores new props

Given `CanvasGraphRenderer` is rendered without `onLongPressNode` or `neighborSetsByNode`,
When the user interacts with the canvas,
Then behavior is identical to the pre-change Canvas backend.

#### Scenario: WebGL backend uses neighborSetsByNode for focus dimming

Given `WebGLGraphRenderer` is rendered with a valid `neighborSetsByNode` map and `focusedNodeId` set,
When the renderer draws a non-focused node,
Then nodes whose id is in `neighborSetsByNode.get(focusedNodeId)` are drawn at full opacity, and all other non-focused nodes are dimmed.

### Requirement: WebGL focus mode dims non-neighbors only

`WebGLGraphRenderer` MUST use `neighborSetsByNode.get(focusedNodeId)?.has(node.id)` to determine whether a non-focused node is a neighbor of the focused node. Neighbors MUST render at full opacity; non-neighbors MUST dim to the existing focus-mode dim value; the focused node itself renders at full opacity with its existing focus treatment.

When `focusedNodeId` is null, no dimming applies.

#### Scenario: Focus dims non-neighbors but not neighbors

Given a graph with 10 nodes and `neighborSetsByNode.get('A')` returning `{'B', 'C'}`,
When the user focuses node `A`,
Then nodes `A`, `B`, and `C` render at full opacity while nodes `D` through `J` render dimmed.

#### Scenario: Clearing focus restores full opacity

Given the user has focused node `A`,
When they click outside the graph to clear focus,
Then all 10 nodes render at full opacity.

### Requirement: Renderer picker labels lead with dimensionality

The Settings → Experimental `GraphRendererPicker` MUST label its options as dimensionality-first:

- `"2D · Canvas (default)"`
- `"2D · WebGL (GPU)"`
- `"3D · Three.js (depth)"`

The picker's subtitle MUST explain: *"Advanced: when 2D is active, pick which 2D backend renders your graph."*

#### Scenario: Picker copy reflects dimensionality

Given the user opens Settings → Experimental,
When the renderer picker renders,
Then the option labels lead with `"2D · "` or `"3D · "` and the subtitle mentions "when 2D is active".
