# Tasks — fix-3d-pixel-precise-hover

Ordered list of small, verifiable work items. Every task ships something testable.

## 1. Spec approval & validation

- [ ] 1.1 Run `openspec validate fix-3d-pixel-precise-hover --strict --no-interactive`; resolve every issue before sharing.
- [ ] 1.2 User review of `proposal.md`, `design.md`, and the `graph-view-overhaul` spec delta. Sign-off required before any code is written.

## 2. Pure hit-test helper

- [ ] 2.1 Create `web/src/lib/graphHitTest.ts` exporting `nearestNodeInRadius(screenPositions, clientX, clientY): string | null`. No Three.js imports. No DOM. Pure JavaScript.
- [ ] 2.2 Define and export the `NodeScreenPosition` type: `{ id: string; sx: number; sy: number; r: number }`.
- [ ] 2.3 Implement the walk-and-pick loop exactly as specified in `design.md` — O(N), `dsq <= r * r`, `<=` tie-break preferring the later entry.

## 3. Unit tests for the helper

Depends on: 2.1, 2.2, 2.3.

- [ ] 3.1 Create `web/src/lib/graphHitTest.test.ts`.
- [ ] 3.2 Test: empty array → `null`.
- [ ] 3.3 Test: cursor outside every `r` → `null`.
- [ ] 3.4 Test: single node, cursor exactly inside → returns that id.
- [ ] 3.5 Test: single node, cursor exactly on the radius boundary (`dsq === r * r`) → returns that id (inclusive).
- [ ] 3.6 Test: two overlapping nodes, cursor nearer to the second → returns the second id.
- [ ] 3.7 Test: exact tie (`dsq` identical) on two entries → returns the later-indexed id.
- [ ] 3.8 Test: negative and very large cursor coordinates → no throw, returns `null`.
- [ ] 3.9 `yarn rw test web graphHitTest` — suite passes.

## 4. Renderer: per-frame projection buffer

Depends on: 2.1.

- [ ] 4.1 Add `screenPositionsRef = useRef<NodeScreenPosition[]>([])` near the other refs at the top of `ThreeGraphRenderer` (around `ThreeGraphRenderer.tsx:115-130`).
- [ ] 4.2 Add a single scratch `tmpVec3 = new THREE.Vector3()` reused each frame (allocated inside `init` where `raycaster` lives today at `ThreeGraphRenderer.tsx:204`).
- [ ] 4.3 In the `animate()` loop at `ThreeGraphRenderer.tsx:330-414`, immediately BEFORE `renderer.render(scene, activeCam)` at line `411`:
  - Read `rect = canvasRef.current?.getBoundingClientRect()`; early-return (no projection) if it is `null`.
  - Resize `screenPositionsRef.current.length = simNodes.length`.
  - For each `sn` in `simNodes`:
    - Set `tmpVec3.set(sn.x, sn.y, sn.z)`.
    - Compute `mv = tmpVec3.clone().applyMatrix4(activeCam.matrixWorldInverse)`; read `-mv.z`.
    - Compute `pointSize = 20 * 300 / -mv.z` (matches shader `uSize * 300 / -mvPos.z` where `uSize === 20`).
    - Compute `r = Math.max(6, pointSize / 2)`.
    - Clone `tmpVec3` back to original, then `project(activeCam)` to NDC.
    - Compute `sx = rect.left + ((ndc.x + 1) / 2) * rect.width`, `sy = rect.top + ((1 - ndc.y) / 2) * rect.height`.
    - Write `screenPositionsRef.current[i] = { id: sn.id, sx, sy, r }`.
- [ ] 4.4 Guard: if the scratch allocation happens in `init` but `init` re-runs on dimensions change, ensure `tmpVec3` does not leak. A local `const tmpVec3` inside `init` captured by the `animate` closure is the cleanest home.

## 5. Renderer: rewrite `pickNode`

Depends on: 2.1, 4.1, 4.3.

- [ ] 5.1 In `ThreeGraphRenderer.tsx:446-462`, replace the raycaster body of `pickNode` with:
  ```ts
  function pickNode(clientX: number, clientY: number): string | null {
    return nearestNodeInRadius(screenPositionsRef.current, clientX, clientY);
  }
  ```
- [ ] 5.2 Add the import: `import { nearestNodeInRadius } from 'src/lib/graphHitTest'`.
- [ ] 5.3 Verify call sites at lines `507`, `523`, and `568` continue to work unchanged (they only depend on the signature `(clientX, clientY) => string | null`).

## 6. Remove the raycaster

Depends on: 5.1.

- [ ] 6.1 Delete `raycasterRef` declaration at `ThreeGraphRenderer.tsx:115-130` (find and remove the line that declares it alongside the other refs).
- [ ] 6.2 Delete the `raycaster` construction and threshold block at `ThreeGraphRenderer.tsx:204-209` (5 lines).
- [ ] 6.3 `grep -n "raycaster\|Raycaster\|threshold" web/src/components/ThreeGraphRenderer/ThreeGraphRenderer.tsx` MUST return zero matches after deletion.

## 7. Verification

Depends on: 2–6.

- [ ] 7.1 `yarn rw type-check` — clean (no new TypeScript errors).
- [ ] 7.2 `yarn rw lint` — clean.
- [ ] 7.3 `yarn rw test web graphHitTest` — all tests pass.
- [ ] 7.4 Manual pass in dev (`yarn rw dev`) against Supabase seed data with `graphRenderer === 'three'`:
  - Load `/graph`, flat (ortho) mode. Hover a dense cluster of 5+ nodes; visually confirm the hover halo lands on the node nearest the cursor, not a neighbor.
  - Drag the tilt handle to 0.8 (perspective mode). Hover near-camera nodes: halo sticks to the sprite visible on screen. Hover far-camera nodes: halo sticks to the sprite visible on screen.
  - Click a specific node; the card detail modal opens for the node the cursor was over.
  - Long-press the same node; the cluster selection sheet opens seeded from that node.
- [ ] 7.5 Regression check: `yarn rw test web GraphClient` — existing suite still passes (no indirect breakage).
- [ ] 7.6 Regression check: mobile touch picking is not worse — Chrome DevTools emulated Pixel 7, hover a small sprite with the simulated pointer, confirm it hits.

## 8. Documentation & handoff

- [ ] 8.1 If any node-count or performance numbers shift meaningfully from the `design.md` estimates (±50%), record the measured values in a short "Measured" subsection in `design.md` under the existing "Math reference" block.
- [ ] 8.2 When all tasks complete, archive this change via `openspec:archive` per repo conventions.
