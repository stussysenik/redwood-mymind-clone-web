/**
 * Login/Signup form accessibility — E2E tests
 *
 * Enforces the contract defined by the `auth-form-accessibility` capability:
 *   - Every input has an `id` attribute
 *   - A matching `<label for>` exists
 *   - `autocomplete` is set to a spec-defined value
 *
 * These assertions mirror Chrome DevTools' automated a11y checks that were
 * failing against prod on 2026-04-13.
 */

import { expect, test } from './support/fixtures'

async function assertInputHasLabelAndAutocomplete(
  page: Parameters<typeof expect>[0] extends never ? never : any,
  selector: string,
  expectedAutocomplete: string
) {
  const input = page.locator(selector)
  await expect(input).toBeVisible({ timeout: 8000 })

  const id = await input.getAttribute('id')
  expect(id, `input ${selector} must have an id attribute`).toBeTruthy()

  const autocomplete = await input.getAttribute('autocomplete')
  expect(
    autocomplete,
    `input ${selector} must have autocomplete="${expectedAutocomplete}"`
  ).toBe(expectedAutocomplete)

  // <label for="..."> with matching `for` must exist and be connected
  const label = page.locator(`label[for="${id}"]`)
  await expect(
    label,
    `label[for="${id}"] must exist for input ${selector}`
  ).toHaveCount(1)
}

test.describe('Login form accessibility', () => {
  test('email and password inputs have id, label[for], and autocomplete', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await assertInputHasLabelAndAutocomplete(page, 'input[type="email"]', 'email')
    await assertInputHasLabelAndAutocomplete(
      page,
      'input[type="password"]',
      'current-password'
    )
  })
})

test.describe('Signup form accessibility', () => {
  test('email and password inputs have id, label[for], and autocomplete', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await assertInputHasLabelAndAutocomplete(page, 'input[type="email"]', 'email')
    await assertInputHasLabelAndAutocomplete(
      page,
      'input[type="password"]',
      'new-password'
    )
  })
})
