## Capability: graph-view-overhaul

Tightens the 3D graph's node picker contract from "raycaster within a world-space threshold" to "screen-space nearest-neighbor within the visual sprite radius". The picker becomes pixel-accurate under both orthographic and perspective cameras, and the hit-test logic is extracted into a pure unit-testable helper.

## MODIFIED Requirements

### Requirement: 3D node picker is screen-space accurate

The `ThreeGraphRenderer` node picker MUST return the node whose visual sprite center is closest to the cursor in CSS-pixel screen space, bounded by the sprite's visual radius. The picker MUST NOT rely on world-space distance, ray-hit order, or any fixed world-unit threshold.

For every frame, the renderer MUST maintain a projection buffer — an array of `{ id, sx, sy, r }` entries where `sx` and `sy` are the node's CSS-pixel coordinates under the currently active camera (ortho below `tilt = 0.05`, perspective at or above) and `r` is the node's expected visual sprite radius in CSS pixels. `r` MUST be at least 6 CSS pixels so far-back nodes remain pickable.

On any pointer event (`pointermove`, `pointerdown`, `pointerup`), the picker MUST find the entry with the smallest `(clientX - sx)² + (clientY - sy)²` such that that distance is less than or equal to `r²`, and return its `id`. If no entry satisfies the radius check, the picker MUST return `null`. The hit-test logic MUST be implemented as a pure function exported from `web/src/lib/graphHitTest.ts` so it can be unit-tested without a canvas or WebGL context.

The `Raycaster` / `intersectObject(Points)` code path and the `raycaster.params.Points.threshold` constant MUST be removed; no code in `ThreeGraphRenderer.tsx` may reference them after this change lands.

#### Scenario: Picker returns the nearest node under an orthographic camera

- **GIVEN** the 3D graph is rendered flat (`tilt === 0`, orthographic camera active),
- **AND** three nodes A, B, C are projected to screen coordinates `(100, 100)`, `(110, 110)`, `(130, 130)` with visual radii `6, 6, 6`,
- **WHEN** the user's pointer is at `(105, 105)`,
- **THEN** the picker returns `A` (A is closest and the cursor is inside A's radius).

#### Scenario: Picker returns the nearest node under a perspective camera

- **GIVEN** the 3D graph is tilted to `tilt = 0.5` (perspective camera active),
- **AND** a node near the camera projects to `(200, 200)` with `r = 12`,
- **AND** a node far from the camera projects to `(205, 205)` with `r = 6`,
- **WHEN** the user's pointer is at `(204, 204)`,
- **THEN** the picker returns the far node (cursor is inside both radii, but the far node's center is closer).

#### Scenario: Picker returns null when cursor is outside every radius

- **GIVEN** the projection buffer has 3 entries each with `r <= 10`,
- **AND** the nearest entry's center is 50 pixels from the cursor,
- **WHEN** the picker runs,
- **THEN** the picker returns `null`,
- **AND** no hover or click callback fires.

#### Scenario: Picker returns the later entry on exact distance tie

- **GIVEN** two projection entries A (index 3) and B (index 7) have identical `sx`, `sy`, `r`,
- **AND** the cursor sits exactly at their shared center,
- **WHEN** the picker runs,
- **THEN** the picker returns B's `id` (the later-indexed entry, matching the point cloud's draw-on-top order).

#### Scenario: Minimum picker radius floor

- **GIVEN** a node whose computed visual sprite radius under perspective is 3 CSS pixels,
- **WHEN** the projection buffer is rebuilt,
- **THEN** that node's `r` in the buffer is clamped to 6 CSS pixels,
- **AND** the node remains pickable when the cursor is within 6 CSS pixels of its center.

#### Scenario: Raycaster is removed from the renderer

- **WHEN** `web/src/components/ThreeGraphRenderer/ThreeGraphRenderer.tsx` is searched for the strings `raycaster`, `Raycaster`, or `threshold`,
- **THEN** zero matches are found.

### Requirement: Hit test logic is a pure testable helper

The `nearestNodeInRadius` function MUST live in `web/src/lib/graphHitTest.ts` as a default export or a named export. It MUST take an array of `{ id, sx, sy, r }`, a `clientX`, and a `clientY`, and return `string | null`. It MUST NOT import from `three`, `react`, or any DOM global.

The function MUST be unit-tested in `web/src/lib/graphHitTest.test.ts` with at least the following cases: empty array, cursor outside every radius, single node inside its radius, cursor exactly on a radius boundary, two overlapping nodes with the cursor closer to one, exact tie between two nodes, and negative / out-of-bounds cursor coordinates.

#### Scenario: Helper is importable without a canvas

- **GIVEN** a test file that imports `nearestNodeInRadius` from `'src/lib/graphHitTest'`,
- **WHEN** the test file runs in Jest with no JSDOM canvas and no `three` package loaded,
- **THEN** the import resolves successfully,
- **AND** the function executes without throwing.

#### Scenario: Helper returns null for an empty projection buffer

- **WHEN** `nearestNodeInRadius([], 100, 100)` is called,
- **THEN** the return value is `null`.

#### Scenario: Helper handles out-of-bounds cursor coordinates

- **GIVEN** a projection buffer with 10 entries all in the range `sx ∈ [0, 1000]`, `sy ∈ [0, 1000]`,
- **WHEN** the function is called with `clientX = -5000, clientY = 999999`,
- **THEN** the function returns `null`,
- **AND** no exception is thrown.
