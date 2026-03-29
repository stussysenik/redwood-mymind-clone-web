import { test, expect } from '@playwright/test'

async function login(page) {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    test.skip(true, 'E2E_EMAIL and E2E_PASSWORD env vars required')
    return
  }
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button:has-text("Sign In")')
  await page.waitForURL('/', { timeout: 10000 })
}

test.describe('Image Lightbox', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
  })

  test('lightbox opens on image click in card detail', async ({ page }) => {
    // Click the first card image to open detail modal
    const cardImage = page.locator('img[alt]').first()
    await expect(cardImage).toBeVisible({ timeout: 5000 })
    await cardImage.click()

    // Wait for card detail modal
    const modal = page.locator('dialog, [role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Click the main image (should have cursor-zoom-in)
    const zoomableImage = modal.locator('img.cursor-zoom-in').first()
    if (await zoomableImage.isVisible({ timeout: 2000 })) {
      await zoomableImage.click()

      // Lightbox should show zoom controls
      const zoomIn = page.locator('button[title="Zoom in"]')
      await expect(zoomIn).toBeVisible({ timeout: 2000 })

      // Close with Escape
      await page.keyboard.press('Escape')
      await expect(zoomIn).not.toBeVisible({ timeout: 1000 })
    }
  })

  test('lightbox zoom controls work', async ({ page }) => {
    const cardImage = page.locator('img[alt]').first()
    await expect(cardImage).toBeVisible({ timeout: 5000 })
    await cardImage.click()

    const modal = page.locator('dialog, [role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 3000 })

    const zoomableImage = modal.locator('img.cursor-zoom-in').first()
    if (await zoomableImage.isVisible({ timeout: 2000 })) {
      await zoomableImage.click()

      const zoomIn = page.locator('button[title="Zoom in"]')
      const zoomOut = page.locator('button[title="Zoom out"]')
      await expect(zoomIn).toBeVisible({ timeout: 2000 })
      await expect(zoomOut).toBeVisible({ timeout: 2000 })
    }
  })
})
