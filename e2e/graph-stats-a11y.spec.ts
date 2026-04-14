/**
 * Graph stats strip accessibility — E2E tests
 *
 * Enforces `graph-view-accessibility`:
 *   - The stats cluster is wrapped in a role=group element
 *   - Its aria-label contains the full words "nodes" and "edges"
 *   - On viewports ≥ 640 px, the visible text also contains the full words
 *   - On viewports < 640 px, the compact shorthand stays visible
 */

import { expect, login, seedGraphCards, test } from './support/fixtures'

test.describe('Graph stats strip accessibility', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await seedGraphCards(testUser)
    await login(page, testUser)
  })

  test('role=group with full-sentence aria-label is present on /graph', async ({ page }) => {
    await page.goto('/graph')
    await page.waitForLoadState('networkidle')

    const statsGroup = page.locator('[role="group"][aria-label*="nodes"][aria-label*="edges"]')
    await expect(statsGroup).toBeVisible({ timeout: 8000 })

    const ariaLabel = await statsGroup.getAttribute('aria-label')
    expect(ariaLabel).toMatch(/\d+ nodes/)
    expect(ariaLabel).toMatch(/\d+ edges/)
  })

  test('visible text matches viewport: words on ≥640px, shorthand on <640px', async ({ page, viewport }) => {
    await page.goto('/graph')
    await page.waitForLoadState('networkidle')

    const statsGroup = page.locator('[role="group"][aria-label*="nodes"][aria-label*="edges"]')
    await expect(statsGroup).toBeVisible({ timeout: 8000 })

    const visibleText = (await statsGroup.innerText()).trim()
    const width = viewport?.width ?? 0

    if (width >= 640) {
      expect(visibleText).toMatch(/\d+ nodes/)
      expect(visibleText).toMatch(/\d+ edges/)
    } else {
      expect(visibleText).toMatch(/\d+n\s*\/\s*\d+e/)
    }
  })
})
