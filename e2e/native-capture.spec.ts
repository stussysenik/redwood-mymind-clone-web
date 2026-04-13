import { expect, login, test } from './support/fixtures'

test.describe('Native capture — Settings + endpoint roundtrip', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('generate token, POST to /capture, see the card, revoke, 401', async ({
    page,
    request,
    baseURL,
  }) => {
    // Go to Settings
    await page.goto('/settings')

    // Mobile Capture section should be visible
    await expect(
      page.getByRole('heading', { name: /mobile capture/i })
    ).toBeVisible({ timeout: 5000 })

    // Open the generate dialog
    await page.getByRole('button', { name: /generate token/i }).click()
    await expect(page.getByLabel(/device name/i)).toBeVisible({ timeout: 2000 })

    // Fill a unique device name so revoke targeting is unambiguous
    const deviceName = `Playwright ${Date.now()}`
    await page.getByLabel(/device name/i).fill(deviceName)

    // Submit
    await page.getByRole('button', { name: /^create$/i }).click()

    // Capture the plaintext token from the dialog
    const tokenLocator = page.locator('text=/byoa_[a-f0-9]{8}_[a-f0-9]{32}/')
    await expect(tokenLocator).toBeVisible({ timeout: 5000 })
    const plaintext = (await tokenLocator.innerText()).trim()
    expect(plaintext).toMatch(/^byoa_[a-f0-9]{8}_[a-f0-9]{32}$/)

    // Close the "Token created" dialog
    await page.getByRole('button', { name: /^done$/i }).click()

    // Active token row should appear with the device name we typed
    await expect(page.getByText(deviceName)).toBeVisible({ timeout: 3000 })

    // Hit /functions/capture directly with the token (simulating the iOS Shortcut)
    const captureUrl = new URL(
      '/.redwood/functions/capture',
      baseURL!
    ).toString()
    const uniquePath = `playwright-${Date.now()}`
    const captureResponse = await request.post(captureUrl, {
      headers: {
        Authorization: `Bearer ${plaintext}`,
        'Content-Type': 'application/json',
      },
      data: {
        url: `https://example.com/${uniquePath}`,
        note: 'e2e capture #playwright #automation',
      },
    })
    expect(captureResponse.status()).toBe(200)
    const captureJson = await captureResponse.json()
    expect(captureJson.ok).toBe(true)
    expect(captureJson.cardId).toBeTruthy()

    // Visit /home and assert the card lands — we look for the unique URL path
    await page.goto('/home')
    await expect(
      page
        .locator(
          `a[href*="example.com/${uniquePath}"], :text("${uniquePath}")`
        )
        .first()
    ).toBeVisible({ timeout: 15_000 })

    // Revoke the token — the Revoke button has aria-label "Revoke <deviceName>"
    await page.goto('/settings')
    // Handle the window.confirm() dialog that the Revoke button triggers
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: new RegExp(`revoke ${deviceName}`, 'i') })
      .click()

    // Wait for the token row to disappear
    await expect(page.getByText(deviceName)).not.toBeVisible({ timeout: 5000 })

    // POST again — should now return 401
    const afterRevoke = await request.post(captureUrl, {
      headers: {
        Authorization: `Bearer ${plaintext}`,
        'Content-Type': 'application/json',
      },
      data: { url: 'https://example.com/should-fail' },
    })
    expect(afterRevoke.status()).toBe(401)
    const afterJson = await afterRevoke.json()
    expect(afterJson.error).toMatch(/invalid_token|revoked/)
  })
})
