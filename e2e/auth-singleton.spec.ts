/**
 * Supabase client singleton — E2E test (currently RED, expected to stay RED
 * until the follow-up `consolidate-supabase-client-singleton` change lands).
 *
 * Enforces `supabase-client-singleton`:
 *   - Zero console warnings matching /Multiple GoTrueClient instances detected/
 *     across a login + navigation flow.
 *
 * This spec is intentionally shipped in `fix-prod-errors-and-accessibility-gaps`
 * even though the implementation is deferred — see design.md §D3. It serves as
 * the forcing function for the follow-up and gives a failing-baseline
 * measurement future engineers can grep for.
 */

import { expect, login, test } from './support/fixtures'

test.describe('Supabase client singleton', () => {
  test('console emits no Multiple GoTrueClient warnings across navigation', async ({ page, testUser }) => {
    const gotrueWarnings: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (/Multiple GoTrueClient instances detected/i.test(text)) {
        gotrueWarnings.push(text)
      }
    })

    await login(page, testUser)
    await page.goto('/graph')
    await page.waitForLoadState('networkidle')
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(
      gotrueWarnings,
      `Multiple GoTrueClient instances warning emitted:\n${gotrueWarnings.join('\n')}`
    ).toEqual([])
  })
})
