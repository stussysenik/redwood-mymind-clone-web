import {
  generateApiToken,
  verifyApiToken,
  revokeApiToken,
  listApiTokens,
} from './apiTokens'
import { db } from 'src/lib/db'

jest.mock('src/lib/db', () => ({
  db: {
    apiToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const mockDb = db as unknown as {
  apiToken: {
    create: jest.Mock
    findFirst: jest.Mock
    findMany: jest.Mock
    update: jest.Mock
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('generateApiToken', () => {
  it('returns plaintext token in byoa_<prefix>_<secret> format', async () => {
    mockDb.apiToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }))

    const result = await generateApiToken({ userId: 'user_1', name: 'iPhone' })

    expect(result.plaintext).toMatch(/^byoa_[a-f0-9]{8}_[a-f0-9]{32}$/)
    expect(mockDb.apiToken.create).toHaveBeenCalledTimes(1)
  })

  it('persists only the sha256 hash, never the plaintext secret', async () => {
    mockDb.apiToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }))

    const result = await generateApiToken({ userId: 'user_1', name: 'iPhone' })

    const createCall = mockDb.apiToken.create.mock.calls[0][0]
    expect(createCall.data.tokenHash).not.toContain(result.plaintext)
    expect(createCall.data.tokenHash).toHaveLength(64) // sha256 hex
    expect(createCall.data.userId).toBe('user_1')
    expect(createCall.data.name).toBe('iPhone')
    expect(createCall.data.scopes).toEqual(['cards:write'])
  })
})

describe('verifyApiToken', () => {
  it('returns the token record for a valid plaintext', async () => {
    mockDb.apiToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }))
    const generated = await generateApiToken({ userId: 'user_1', name: 'iPhone' })

    mockDb.apiToken.findFirst.mockImplementation(async ({ where }) => {
      if (
        where.prefix === generated.token.prefix &&
        where.tokenHash === generated.token.tokenHash &&
        where.revokedAt === null
      ) {
        return generated.token
      }
      return null
    })
    mockDb.apiToken.update.mockResolvedValue(generated.token)

    const verified = await verifyApiToken(generated.plaintext)
    expect(verified).not.toBeNull()
    expect(verified?.id).toBe('tok_1')
  })

  it('returns null for a malformed token', async () => {
    expect(await verifyApiToken('not-a-byoa-token')).toBeNull()
    expect(await verifyApiToken('byoa_short_x')).toBeNull()
    expect(await verifyApiToken('')).toBeNull()
    expect(mockDb.apiToken.findFirst).not.toHaveBeenCalled()
  })

  it('returns null for a valid-shape token with unknown prefix', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue(null)
    const token = 'byoa_deadbeef_' + 'a'.repeat(32)
    expect(await verifyApiToken(token)).toBeNull()
  })

  it('returns null for a revoked token (findFirst filter)', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue(null) // revoked rows filtered out by where clause
    const token = 'byoa_abcdef01_' + 'b'.repeat(32)
    expect(await verifyApiToken(token)).toBeNull()
  })

  it('updates lastUsedAt on successful verify (fire-and-forget, does not throw on failure)', async () => {
    mockDb.apiToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }))
    const generated = await generateApiToken({ userId: 'user_1', name: 'iPhone' })
    mockDb.apiToken.findFirst.mockResolvedValue(generated.token)
    mockDb.apiToken.update.mockRejectedValue(new Error('boom')) // fire-and-forget swallows

    const verified = await verifyApiToken(generated.plaintext)
    expect(verified).not.toBeNull()
    // Let the microtask queue drain so the fire-and-forget runs
    await new Promise((r) => setImmediate(r))
    expect(mockDb.apiToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tok_1' },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      })
    )
  })
})

describe('revokeApiToken', () => {
  it('sets revokedAt on the token owned by the user', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue({ id: 'tok_1', userId: 'user_1' })
    mockDb.apiToken.update.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      revokedAt: new Date(),
    })
    const result = await revokeApiToken({ id: 'tok_1', userId: 'user_1' })
    expect(result.revokedAt).toBeInstanceOf(Date)
    expect(mockDb.apiToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tok_1' },
        data: { revokedAt: expect.any(Date) },
      })
    )
  })

  it('throws when the token does not belong to the caller', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue(null)
    await expect(
      revokeApiToken({ id: 'tok_1', userId: 'user_2' })
    ).rejects.toThrow('Token not found')
    expect(mockDb.apiToken.update).not.toHaveBeenCalled()
  })
})

describe('listApiTokens', () => {
  it('lists only non-revoked tokens for the user, newest first', async () => {
    mockDb.apiToken.findMany.mockResolvedValue([])
    await listApiTokens({ userId: 'user_1' })
    expect(mockDb.apiToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1', revokedAt: null },
        orderBy: { createdAt: 'desc' },
      })
    )
  })
})
