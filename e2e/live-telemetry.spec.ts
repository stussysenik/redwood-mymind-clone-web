import {
  createCard,
  expect,
  getCardById,
  getCardByUrl,
  login,
  saveLink,
  test,
} from './support/fixtures'

const STAGE_TEXT = /Queued|Fetching content|Analyzing|Extracting insights|Finalizing/
const LATER_STAGE_TEXT = /Fetching content|Analyzing|Extracting insights|Finalizing/

test.describe('Live telemetry and re-analysis confirmation', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('shows live processing status and screenshot fallback on mobile', async ({
    page,
    testUser,
  }, testInfo) => {
    await expect(page.getByRole('button', { name: /add new/i })).toBeVisible({
      timeout: 10000,
    })
    await page.screenshot({
      path: testInfo.outputPath('01-mobile-home.png'),
      fullPage: true,
    })

    const url = `https://example.com/?telemetry=${Date.now()}`
    await saveLink(page, url)

    const firstCard = page.locator('.card-base').first()
    await expect(firstCard).toBeVisible({ timeout: 10000 })
    await expect(firstCard.locator('[data-testid="feed-card-image"]').first()).toHaveAttribute(
      'data-visual-kind',
      'screenshot',
      { timeout: 10000 }
    )
    await expect(firstCard).toContainText(STAGE_TEXT, {
      timeout: 10000,
    })
    await page.screenshot({
      path: testInfo.outputPath('02-queued-state.png'),
      fullPage: true,
    })

    await expect
      .poll(() => getCardByUrl(testUser, url), { timeout: 10000 })
      .not.toBeNull()

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
  })

  test('archives a newly saved card directly from the modal header', async ({
    page,
    testUser,
  }, testInfo) => {
    const url = `https://example.com/?archive=${Date.now()}`
    await saveLink(page, url)

    let cardId = ''
    await expect
      .poll(async () => {
        const card = await getCardByUrl(testUser, url)
        cardId = card?.id ?? ''
        return !!card
      }, { timeout: 10000 })
      .toBe(true)

    const firstCard = page.locator('.card-base').first()
    await expect(firstCard).toBeVisible({ timeout: 10000 })
    await firstCard.click()

    const archiveButton = page.getByRole('button', { name: 'Archive' }).first()
    await expect(archiveButton).toBeVisible({ timeout: 10000 })
    await page.screenshot({
      path: testInfo.outputPath('04-archive-modal.png'),
      fullPage: true,
    })

    await archiveButton.click()

    await expect
      .poll(async () => (await getCardById(testUser, cardId))?.archived_at ?? null, {
        timeout: 10000,
      })
      .not.toBeNull()

    await expect
      .poll(async () => page.locator('.card-base').count(), {
        timeout: 10000,
      })
      .toBe(0)
  })

  test('guards re-analysis behind confirmation', async ({
    page,
    testUser,
  }, testInfo) => {
    const seededCard = await createCard(testUser, {
      title: `Re-analyze Seed ${Date.now()}`,
      url: `https://example.com/reanalyze/${Date.now()}`,
      metadata: {
        summary: 'Seed summary for re-analysis coverage.',
        enrichmentStage: 'complete',
        summarySource: 'glm',
        tagsSource: 'glm',
      },
      tags: ['seeded'],
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByText(seededCard.title ?? '').click()
    await page.getByRole('button', { name: 'Details' }).click()

    const reAnalyzeButton = page.getByTitle('Re-analyze with AI')
    await expect(reAnalyzeButton).toBeVisible({ timeout: 10000 })
    await reAnalyzeButton.click()

    const confirmText = page.getByText(
      'Re-analyze will replace AI-generated title, summary, and tags with a fresh pass. Continue?'
    )
    await expect(confirmText).toBeVisible({ timeout: 5000 })
    await page.screenshot({
      path: testInfo.outputPath('05-reanalyze-confirm.png'),
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
      path: testInfo.outputPath('06-reanalyze-started.png'),
      fullPage: true,
    })
  })
})
