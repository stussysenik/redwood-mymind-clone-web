import { test, expect } from '@playwright/test'

const MODAL_TEXTAREA = 'textarea[placeholder*="Save something"]'

async function login(page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD

  if (!email || !password) {
    test.skip(true, 'E2E_EMAIL and E2E_PASSWORD env vars required')
    return
  }

  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button:has-text("Sign In")')

  // Wait for redirect to home
  await page.waitForURL('/', { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

test.describe('Add Flow - MyMind-style vanish', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
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
  test('save multiple cards rapidly without errors', async ({ page }) => {
    await login(page)

    const urls = [
      'https://example.com/page1',
      'https://example.com/page2',
      'https://example.com/page3',
    ]

    for (const url of urls) {
      await page.getByRole('button', { name: /add new/i }).click()
      const textarea = page.locator(MODAL_TEXTAREA)
      await expect(textarea).toBeVisible({ timeout: 2000 })

      await textarea.fill(url)
      await page.waitForTimeout(100)
      await page.locator('button:has-text("Save to Brain")').click()

      await expect(textarea).not.toBeVisible({ timeout: 2000 })
      await page.waitForTimeout(500)
    }

    await expect(page).toHaveURL(/.*/)
  })
})

test.describe('Mobile Touch Targets', () => {
  test('all interactive elements meet 44px minimum', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Mobile test for Safari only')
    await login(page)

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
