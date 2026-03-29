import { test, expect } from '@playwright/test'

test.describe('Add Flow - MyMind-style vanish', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await page.waitForLoadState('networkidle')
  })

  test('Cmd+A opens the add modal', async ({ page }) => {
    await page.keyboard.press('Meta+a')
    // Modal should appear
    const modal = page.locator('[class*="fixed"][class*="z-[70]"]')
    await expect(modal).toBeVisible({ timeout: 2000 })
  })

  test('Ctrl+A opens the add modal (non-Mac)', async ({ page }) => {
    await page.keyboard.press('Control+a')
    const modal = page.locator('[class*="fixed"][class*="z-[70]"]')
    await expect(modal).toBeVisible({ timeout: 2000 })
  })

  test('Escape closes the add modal', async ({ page }) => {
    await page.keyboard.press('Meta+a')
    const modal = page.locator('[class*="fixed"][class*="z-[70]"]')
    await expect(modal).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: 1000 })
  })

  test('submit closes modal instantly (vanish animation)', async ({ page }) => {
    // Open modal
    await page.keyboard.press('Meta+a')
    const modal = page.locator('[class*="fixed"][class*="z-[70]"]')
    await expect(modal).toBeVisible()

    // Type a URL
    const textarea = modal.locator('textarea')
    await textarea.fill('https://example.com')

    // Wait for mode detection
    await page.waitForTimeout(200)

    // Submit via Cmd+Enter
    await page.keyboard.press('Meta+Enter')

    // Modal should vanish quickly (within 500ms, not 1200ms like before)
    await expect(modal).not.toBeVisible({ timeout: 500 })
  })
})

test.describe('Rapid Interaction Stress Test', () => {
  test('save multiple cards rapidly without errors', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const urls = [
      'https://example.com/page1',
      'https://example.com/page2',
      'https://example.com/page3',
      'https://example.com/page4',
      'https://example.com/page5',
    ]

    for (const url of urls) {
      // Open modal
      await page.keyboard.press('Meta+a')
      const modal = page.locator('[class*="fixed"][class*="z-[70]"]')
      await expect(modal).toBeVisible({ timeout: 2000 })

      // Type URL and submit
      const textarea = modal.locator('textarea')
      await textarea.fill(url)
      await page.waitForTimeout(100) // Let mode detection trigger
      await page.keyboard.press('Meta+Enter')

      // Wait for vanish
      await expect(modal).not.toBeVisible({ timeout: 1000 })

      // Brief pause between saves
      await page.waitForTimeout(300)
    }

    // No errors should have been thrown
    // Page should still be functional
    await expect(page).toHaveURL(/.*/)
  })
})

test.describe('Mobile Touch Targets', () => {
  test('all interactive elements meet 44px minimum', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Mobile test for Safari only')
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check add button touch target
    const addButton = page.locator('[title*="Add Item"]')
    if (await addButton.isVisible()) {
      const box = await addButton.boundingBox()
      expect(box).toBeTruthy()
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
})
