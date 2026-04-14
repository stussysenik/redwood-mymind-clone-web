/**
 * apiTokens resolver — unit tests
 *
 * Covers the `graphql-resolver-robustness` contract:
 *   1. When `context.currentUser` is null, the resolver returns []
 *      (never throws, never yields a non-null violation).
 *   2. When the underlying service throws, the resolver returns []
 *      and logs the error at `error` level with an event tag.
 *
 * The resolver lives in `src/services/apiTokens/apiTokens.ts` because
 * Redwood auto-wires `Query.apiTokens` from service exports, not from
 * SDL file exports. See `makeMergedSchema.mapFieldsToService`.
 */

jest.mock('src/lib/db', () => ({
  db: {
    apiToken: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('src/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

const { apiTokens } = require('src/services/apiTokens/apiTokens') as {
  apiTokens: () => Promise<unknown[]>
}
const { db: mockDb } = require('src/lib/db') as {
  db: { apiToken: { findMany: jest.Mock } }
}
const { logger: mockLogger } = require('src/lib/logger') as {
  logger: { error: jest.Mock }
}

// `mockCurrentUser` is a Redwood-provided global that writes into the mocked
// `@redwoodjs/context` store so `context.currentUser` reads resolve inside
// resolvers under test. See node_modules/@redwoodjs/testing/config/jest/api/jest.setup.js.
declare const mockCurrentUser: (user: unknown) => void

const mockUserId = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('apiTokens resolver', () => {
  it('returns [] and logs when context.currentUser is missing', async () => {
    mockCurrentUser(null)

    const result = await apiTokens()

    expect(result).toEqual([])
    expect(mockDb.apiToken.findMany).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { event: 'apiTokens.no_current_user' },
      expect.stringContaining('no current user')
    )
  })

  it('returns the service result on happy path', async () => {
    mockCurrentUser({ id: mockUserId, email: 'test@byoa.local' })
    const fakeTokens = [
      {
        id: 'tok_1',
        name: 'first',
        prefix: 'abcd1234',
        scopes: ['cards:write'],
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      },
    ]
    mockDb.apiToken.findMany.mockResolvedValue(fakeTokens)

    const result = await apiTokens()

    expect(result).toEqual(fakeTokens)
    expect(mockDb.apiToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUserId, revokedAt: null },
      })
    )
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('returns [] and logs when the service throws', async () => {
    mockCurrentUser({ id: mockUserId, email: 'test@byoa.local' })
    const serviceError = new Error('prisma cold start')
    mockDb.apiToken.findMany.mockRejectedValue(serviceError)

    const result = await apiTokens()

    expect(result).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: serviceError,
        event: 'apiTokens.service_failure',
      }),
      expect.stringContaining('threw')
    )
  })
})
