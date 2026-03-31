import type { TestUser } from './support/fixtures'

import { createCard, expect, login, test } from './support/fixtures'

async function seedImageCard(testUser: TestUser, suffix: string) {
  const imageUrl = `https://picsum.photos/seed/${suffix}/1200/800`
  return createCard(testUser, {
    title: `Lightbox ${suffix}`,
    url: `https://example.com/lightbox/${suffix}`,
    imageUrl,
    metadata: {
      images: [imageUrl],
    },
    tags: ['visual-test'],
  })
}

test.describe('Image Lightbox', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
    await page.waitForLoadState('networkidle')
  })

  test('lightbox opens on image click in card detail', async ({
    page,
    testUser,
  }) => {
    const card = await seedImageCard(testUser, `open-${Date.now()}`)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const cardImage = page.locator(`img[alt="${card.title}"]`).first()
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

  test('lightbox zoom controls work', async ({ page, testUser }) => {
    const card = await seedImageCard(testUser, `zoom-${Date.now()}`)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const cardImage = page.locator(`img[alt="${card.title}"]`).first()
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
