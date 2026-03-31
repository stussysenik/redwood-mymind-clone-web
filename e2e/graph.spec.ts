import type { Page } from '@playwright/test'

import { expect, login, saveLink, test } from './support/fixtures'

async function ensureGraphSeed(page: Page, label: string) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const existingCards = await page.locator('.card-base').count()
  if (existingCards > 0) {
    return
  }

  await saveLink(page, `https://example.com/?graph=${encodeURIComponent(label)}`)
  await expect(page.locator('.card-base').first()).toBeVisible({
    timeout: 10000,
  })
}

test.describe('Graph Feature - Mobile', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
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
  test('graph loads and renders nodes', async ({ page, testUser }) => {
    await login(page, testUser)
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
