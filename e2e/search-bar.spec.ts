import { expect, test } from '@playwright/test'

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

test.describe('SearchBar Save Flow - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)

    await page.route('**/api/save*', async (route) => {
      throw new Error('SearchBar must not call the dead /api/save endpoint')
    })

    await page.route('**/graphql*', async (route) => {
      const request = route.request()

      if (request.method() !== 'POST') {
        await route.fallback()
        return
      }

      const postData = request.postDataJSON() as {
        operationName?: string
        variables?: {
          input?: {
            name?: string
            query?: string | null
            isSmart?: boolean
          }
        }
      }

      if (postData.operationName === 'SearchBarCreateSpace') {
        expect(postData.variables?.input).toMatchObject({
          name: 'tag-name',
          query: 'tag-name',
          isSmart: true,
        })

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createSpace: {
                id: 'space-search-bar',
                name: 'tag-name',
              },
            },
          }),
        })
        return
      }

      await route.fallback()
    })
  })

  test('creates a smart space from a hashtag search on mobile', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByLabel('Search cards')
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    await searchInput.fill('#tag-name')
    await page.getByTitle('Save as Space').click()

    await expect(page).toHaveURL('/spaces', { timeout: 10000 })
  })
})
