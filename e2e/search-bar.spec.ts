import { expect, getSpaceByName, login, test } from './support/fixtures'

test.describe('SearchBar Save Flow - Mobile', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)

    await page.route('**/api/save*', async (route) => {
      throw new Error('SearchBar must not call the dead /api/save endpoint')
    })
  })

  test('creates a smart space from a hashtag search on mobile', async ({
    page,
    testUser,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByLabel('Search cards')
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    const tagName = `tag-${Date.now()}`
    await searchInput.fill(`#${tagName}`)
    await page.getByRole('button', { name: 'Save as Space' }).click()

    await expect(page).toHaveURL('/spaces', { timeout: 10000 })
    await expect
      .poll(() => getSpaceByName(testUser, tagName), { timeout: 10000 })
      .not.toBeNull()
    await expect(
      page.getByRole('link', { name: new RegExp(tagName, 'i') }).first()
    ).toBeVisible({ timeout: 10000 })
  })
})
