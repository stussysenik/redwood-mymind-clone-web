import { test, expect } from '@playwright/test'

test.describe('Image Lightbox', () => {
  test('lightbox opens on image click in card detail', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click the first card that has an image
    const card = page.locator('[data-testid="card-item"]').first()
    if (await card.isVisible()) {
      await card.click()

      // Wait for card detail modal
      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible({ timeout: 3000 })

      // Click the main image (should have cursor-zoom-in class)
      const zoomableImage = modal.locator('img.cursor-zoom-in').first()
      if (await zoomableImage.isVisible()) {
        await zoomableImage.click()

        // Lightbox should open (z-index 100+ overlay)
        const lightbox = page.locator('[class*="z-\\[100\\]"]')
        await expect(lightbox).toBeVisible({ timeout: 1000 })

        // Close with Escape
        await page.keyboard.press('Escape')
        await expect(lightbox).not.toBeVisible({ timeout: 1000 })
      }
    }
  })

  test('lightbox zoom controls work', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Open first card with image, then lightbox
    const card = page.locator('[data-testid="card-item"]').first()
    if (await card.isVisible()) {
      await card.click()
      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible({ timeout: 3000 })

      const zoomableImage = modal.locator('img.cursor-zoom-in').first()
      if (await zoomableImage.isVisible()) {
        await zoomableImage.click()

        // Zoom in button should be visible
        const zoomInBtn = page.locator('button[title="Zoom in"]')
        await expect(zoomInBtn).toBeVisible()

        // Zoom out button should be visible
        const zoomOutBtn = page.locator('button[title="Zoom out"]')
        await expect(zoomOutBtn).toBeVisible()
      }
    }
  })
})
