import { test, expect } from '@playwright/test'

const MODAL_TEXTAREA = 'textarea[placeholder*="Save something"]'

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

async function ensureGraphSeed(page, label: string) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const existingCards = await page.locator('.card-base').count()
  if (existingCards > 0) {
    return
  }

  await page.getByRole('button', { name: /add new/i }).click()
  await expect(page.locator(MODAL_TEXTAREA)).toBeVisible({ timeout: 3000 })
  await page
    .locator(MODAL_TEXTAREA)
    .fill(`https://example.com/?graph=${encodeURIComponent(label)}`)
  await page.getByRole('button', { name: /save to brain/i }).click()
  await expect(page.locator(MODAL_TEXTAREA)).not.toBeVisible({
    timeout: 3000,
  })
  await expect(page.locator('.card-base').first()).toBeVisible({
    timeout: 10000,
  })
}

test.describe('Graph Feature - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureGraphSeed(page, `mobile-${Date.now()}`)
    await page.goto('/graph')
    await page.waitForLoadState('networkidle')
  })

  test('graph renders without crashing on mobile viewport', async ({ page }) => {
    // Wait for graph to initialize
    await page.waitForTimeout(3000)
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('graph container prevents scroll conflicts', async ({ page }) => {
    await page.waitForTimeout(3000)
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })
    // The react-force-graph container sets touch-action: none
    const container = page.locator('div[style*="touch-action"]').first()
    await expect(container).toBeVisible()
  })
})

test.describe('Graph Feature - Desktop', () => {
  test('graph loads and renders nodes', async ({ page }) => {
    await login(page)
    await ensureGraphSeed(page, `desktop-${Date.now()}`)
    await page.goto('/graph')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
  })
})
