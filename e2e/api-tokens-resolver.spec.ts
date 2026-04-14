/**
 * apiTokens resolver robustness — E2E tests
 *
 * Enforces `graphql-resolver-robustness`:
 *   - `/settings` must not emit a `Cannot return null for non-nullable field
 *     Query.apiTokens` GraphQL error on any response body.
 *   - No response may contain an `errors[]` entry whose path targets the
 *     `apiTokens` field.
 *
 * Implementation notes:
 *   - Playwright's `page.on('response')` lets us sniff bodies for every
 *     request. We filter to GraphQL traffic so we don't try to parse image
 *     or asset responses.
 *   - A failing response body is captured into a list that the assertion
 *     reads at the end of the test; this keeps the diagnostic message useful
 *     when it fires.
 */

import { expect, login, test } from './support/fixtures'

type GraphqlResponseSnapshot = {
  url: string
  body: string
}

test.describe('apiTokens resolver', () => {
  test('does not emit "Cannot return null" on the /settings page load', async ({ page, testUser }) => {
    const graphqlResponses: GraphqlResponseSnapshot[] = []

    page.on('response', async (response) => {
      const url = response.url()
      if (!url.includes('graphql')) return
      try {
        const body = await response.text()
        graphqlResponses.push({ url, body })
      } catch {
        // Ignore — some responses (redirects, 204s) have no body
      }
    })

    await login(page, testUser)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // Allow any trailing apiTokens query a moment to resolve
    await page.waitForTimeout(1500)

    const nullErrorResponses = graphqlResponses.filter((r) =>
      r.body.includes('Cannot return null for non-nullable field Query.apiTokens')
    )
    expect(
      nullErrorResponses,
      `apiTokens resolver emitted a non-null violation:\n${nullErrorResponses
        .map((r) => r.body.slice(0, 400))
        .join('\n---\n')}`
    ).toEqual([])

    const apiTokensErrorResponses = graphqlResponses.filter((r) => {
      try {
        const parsed = JSON.parse(r.body)
        const errors: Array<{ path?: unknown[] }> = parsed?.errors ?? []
        return errors.some(
          (err) =>
            Array.isArray(err?.path) && err.path.some((p) => p === 'apiTokens')
        )
      } catch {
        return false
      }
    })
    expect(
      apiTokensErrorResponses,
      `apiTokens GraphQL error path was present:\n${apiTokensErrorResponses
        .map((r) => r.body.slice(0, 400))
        .join('\n---\n')}`
    ).toEqual([])
  })
})
