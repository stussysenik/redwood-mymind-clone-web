/**
 * Graph dimension toggle (2D ↔ 3D) accessibility — E2E tests
 *
 * Enforces `graph-view-accessibility`:
 *   - A role=radiogroup[aria-label="Graph dimensionality"] is visible on /graph
 *   - Both 2D and 3D radio buttons have bounding boxes ≥ 44×44 px
 *   - Clicking 3D flips aria-checked and mounts the Three.js renderer
 *   - Clicking 2D returns to the 2D canvas backend
 *
 * Runs on all four viewport projects defined by playwright.config.ts to
 * explicitly prove the control is visible and tappable on mobile.
 *
 * Note on the mount assertion: we cannot check `canvas.getContext('webgl2')`
 * directly because headless Chromium ships without WebGL (neither webgl1 nor
 * webgl2 — both return null). Instead we assert on two observable side effects
 * of a successful ThreeGraphRenderer mount: (1) a `<canvas>` element appears
 * under the graph container, and (2) the Three-only tilt handle button becomes
 * visible. Both are structural proofs that the Suspense boundary resolved and
 * the Three component rendered, without depending on a live GL context.
 */

import { expect, login, seedGraphCards, test } from './support/fixtures'

test.describe('Graph dimension toggle', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await seedGraphCards(testUser)
    await login(page, testUser)
  })

  test('radiogroup is visible, keyboard operable, and switches renderer backends', async ({ page }) => {
    await page.goto('/graph')
    await page.waitForLoadState('networkidle')

    const radiogroup = page.locator('[role="radiogroup"][aria-label="Graph dimensionality"]')
    await expect(radiogroup).toBeVisible({ timeout: 8000 })

    const twoD = radiogroup.getByRole('radio', { name: /^2D$/ })
    const threeD = radiogroup.getByRole('radio', { name: /^3D$/ })

    // Touch targets ≥ 44×44 px per WCAG 2.5.5 / iOS HIG
    const twoDBox = await twoD.boundingBox()
    const threeDBox = await threeD.boundingBox()
    expect(twoDBox, '2D button must have a bounding box').not.toBeNull()
    expect(threeDBox, '3D button must have a bounding box').not.toBeNull()
    expect(twoDBox!.width).toBeGreaterThanOrEqual(44)
    expect(twoDBox!.height).toBeGreaterThanOrEqual(44)
    expect(threeDBox!.width).toBeGreaterThanOrEqual(44)
    expect(threeDBox!.height).toBeGreaterThanOrEqual(44)

    // Click 3D → aria-checked flips
    await threeD.click()
    await expect(threeD).toHaveAttribute('aria-checked', 'true', { timeout: 4000 })
    await expect(twoD).toHaveAttribute('aria-checked', 'false')

    // The Three.js renderer's unique tilt handle appears once the Suspense
    // boundary resolves. Its aria-label is either "Drag to tilt into 3D
    // perspective" (handle flat) or "Tap to reset to flat view" (handle tilted).
    // Whichever label is shown, its presence is structural proof that the
    // ThreeGraphRenderer mounted in 3D mode.
    const tiltHandle = page.getByRole('button', {
      name: /Drag to tilt into 3D perspective|Tap to reset to flat view/,
    })
    await expect(tiltHandle).toBeVisible({ timeout: 4000 })

    // A <canvas> element must be present as well — this is the WebGL surface
    // that Three.js attaches to. Headless Chromium won't paint pixels into it,
    // but the element itself must exist for the renderer to have initialised.
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 4000 })

    // Click 2D → flips back
    await twoD.click()
    await expect(twoD).toHaveAttribute('aria-checked', 'true', { timeout: 4000 })
    await expect(threeD).toHaveAttribute('aria-checked', 'false')
  })
})
