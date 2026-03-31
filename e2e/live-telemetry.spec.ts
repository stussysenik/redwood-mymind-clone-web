import { expect, test } from '@playwright/test'

const MODAL_TEXTAREA = 'textarea[placeholder*="Save something"]'
const STAGE_TEXT = /Queued|Fetching content|Analyzing|Extracting insights|Finalizing/
const LATER_STAGE_TEXT = /Fetching content|Analyzing|Extracting insights|Finalizing/

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

  await page.waitForURL('/', { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

test.describe('Live telemetry and re-analysis confirmation', () => {
  test('shows live processing status on mobile and guards re-analysis behind confirmation', async ({
    page,
  }, testInfo) => {
    await login(page)

    await expect(page.getByRole('button', { name: /add new/i })).toBeVisible({
      timeout: 10000,
    })
    await page.screenshot({
      path: testInfo.outputPath('01-mobile-home.png'),
      fullPage: true,
    })

    await page.getByRole('button', { name: /add new/i }).click()
    await expect(page.locator(MODAL_TEXTAREA)).toBeVisible({ timeout: 3000 })

    const url = `https://example.com/?telemetry=${Date.now()}`
    await page.locator(MODAL_TEXTAREA).fill(url)
    await page.getByRole('button', { name: /save to brain/i }).click()
    await expect(page.locator(MODAL_TEXTAREA)).not.toBeVisible({
      timeout: 3000,
    })

    const firstCard = page.locator('.card-base').first()
    await expect(firstCard).toBeVisible({ timeout: 10000 })
    await expect(firstCard).toContainText(STAGE_TEXT, {
      timeout: 10000,
    })
    await page.screenshot({
      path: testInfo.outputPath('02-queued-state.png'),
      fullPage: true,
    })

    await expect
      .poll(
        async () => {
          const text = (await firstCard.textContent()) || ''
          const placeholderCount = await firstCard
            .locator('span.animate-pulse')
            .count()

          if (LATER_STAGE_TEXT.test(text)) return 'later-stage'
          if (!STAGE_TEXT.test(text) && placeholderCount === 0) {
            return 'completed'
          }

          return 'waiting'
        },
        { timeout: 30000, intervals: [1000, 2000, 3000] }
      )
      .not.toBe('waiting')

    await page.screenshot({
      path: testInfo.outputPath('03-live-update.png'),
      fullPage: true,
    })

    await firstCard.click()
    await page.getByRole('button', { name: 'Details' }).click()

    const reAnalyzeButton = page.getByTitle('Re-analyze with AI')
    await expect(reAnalyzeButton).toBeVisible({ timeout: 10000 })
    await reAnalyzeButton.click()

    const confirmText = page.getByText(
      'Re-analyze will replace AI-generated title, summary, and tags with a fresh pass. Continue?'
    )
    await expect(confirmText).toBeVisible({ timeout: 5000 })
    await page.screenshot({
      path: testInfo.outputPath('04-reanalyze-confirm.png'),
      fullPage: true,
    })

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirmText).not.toBeVisible({ timeout: 3000 })

    await reAnalyzeButton.click()
    await expect(confirmText).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /^Re-analyze$/ }).last().click()

    await expect(page.getByText('Re-analysis started')).toBeVisible({
      timeout: 10000,
    })
    await page.screenshot({
      path: testInfo.outputPath('05-reanalyze-started.png'),
      fullPage: true,
    })
  })
})
