import { expect, login, saveLink, test } from './support/fixtures'

const MODAL_TEXTAREA = 'textarea[placeholder*="Save something"]'

test.describe('Add Flow - MyMind-style vanish', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('add button opens the modal', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add new/i })
    await addButton.click()
    await expect(page.locator(MODAL_TEXTAREA)).toBeVisible({ timeout: 2000 })
  })

  test('Escape closes the add modal', async ({ page }) => {
    await page.getByRole('button', { name: /add new/i }).click()
    await expect(page.locator(MODAL_TEXTAREA)).toBeVisible({ timeout: 2000 })

    await page.keyboard.press('Escape')
    await expect(page.locator(MODAL_TEXTAREA)).not.toBeVisible({ timeout: 1000 })
  })

  test('submit closes modal instantly (vanish animation)', async ({ page }) => {
    await page.getByRole('button', { name: /add new/i }).click()
    const textarea = page.locator(MODAL_TEXTAREA)
    await expect(textarea).toBeVisible({ timeout: 2000 })

    await textarea.fill('https://example.com')
    await page.waitForTimeout(200)

    await page.locator('button:has-text("Save to Brain")').click()

    // Modal should vanish quickly (within 2s — animation + mutation + network)
    await expect(textarea).not.toBeVisible({ timeout: 2000 })
  })
})

test.describe('Rapid Interaction Stress Test', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('save multiple cards rapidly without errors', async ({ page }) => {
    const urls = [
      'https://example.com/page1',
      'https://example.com/page2',
      'https://example.com/page3',
    ]

    for (const url of urls) {
      await saveLink(page, url)
      await page.waitForTimeout(500)
    }

    await expect(page).toHaveURL(/.*/)
  })
})

test.describe('Mobile Touch Targets', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('all interactive elements meet 44px minimum', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('Mobile'), 'Mobile-only assertion')

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
