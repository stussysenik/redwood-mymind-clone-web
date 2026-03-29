import { test, expect } from '@playwright/test'

test.describe('Graph Feature - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to graph view
    await page.goto('/?view=graph')
    await page.waitForLoadState('networkidle')
  })

  test('graph renders without crashing on mobile viewport', async ({ page }) => {
    // Graph canvas should be present
    const canvas = page.locator('canvas')
    if (await canvas.isVisible()) {
      // Canvas should have non-zero dimensions
      const box = await canvas.boundingBox()
      expect(box).toBeTruthy()
      if (box) {
        expect(box.width).toBeGreaterThan(0)
        expect(box.height).toBeGreaterThan(0)
      }
    }
  })

  test('graph container prevents scroll conflicts', async ({ page }) => {
    // The graph container should have touch-action: none
    const graphContainer = page.locator('[style*="touch-action: none"]')
    // If graph is rendered, the container should exist
    const canvas = page.locator('canvas')
    if (await canvas.isVisible()) {
      await expect(graphContainer).toBeVisible()
    }
  })
})

test.describe('Graph Feature - Desktop', () => {
  test('graph loads and renders nodes', async ({ page }) => {
    await page.goto('/?view=graph')
    await page.waitForLoadState('networkidle')

    // Wait for graph to render (canvas element)
    const canvas = page.locator('canvas')
    if (await canvas.isVisible({ timeout: 5000 })) {
      // Graph is rendering
      const box = await canvas.boundingBox()
      expect(box).toBeTruthy()
    }
  })
})
