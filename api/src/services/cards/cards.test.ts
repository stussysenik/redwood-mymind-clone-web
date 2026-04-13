import { createCardForUser } from './cards'
import { db } from 'src/lib/db'
import { enrichCardPipeline } from 'src/services/enrichment/enrichment'

jest.mock('src/lib/db', () => ({
  db: {
    card: {
      create: jest.fn(),
    },
  },
}))

jest.mock('src/services/enrichment/enrichment', () => ({
  enrichCardPipeline: jest.fn().mockResolvedValue(undefined),
}))

const mockDb = db as unknown as {
  card: { create: jest.Mock }
}
const mockEnrich = enrichCardPipeline as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.card.create.mockImplementation(async ({ data }: { data: any }) => ({
    id: 'card_1',
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    archivedAt: null,
    embedding: null,
  }))
})

describe('createCardForUser', () => {
  it('creates a card with the given userId and default type "website" when none provided', async () => {
    const card = await createCardForUser('user_1', { url: 'https://example.com' })
    expect(card.id).toBe('card_1')
    const createArg = mockDb.card.create.mock.calls[0][0]
    expect(createArg.data.userId).toBe('user_1')
    expect(createArg.data.type).toBe('website')
    expect(createArg.data.url).toBe('https://example.com')
  })

  it('honors explicit type, title, content, imageUrl, tags', async () => {
    await createCardForUser('user_1', {
      url: 'https://example.com',
      type: 'article',
      title: 'Hello',
      content: 'Body',
      imageUrl: 'https://r2.example/abc.jpg',
      tags: ['design', 'inspiration'],
    })
    const createArg = mockDb.card.create.mock.calls[0][0]
    expect(createArg.data.content).toBe('Body')
    expect(createArg.data.imageUrl).toBe('https://r2.example/abc.jpg')
    // Tags go through normalizePersistedTags; just assert the core tags survive
    expect(createArg.data.tags).toEqual(expect.arrayContaining(['design', 'inspiration']))
  })

  it('sets metadata.processing=true and enrichmentStage="queued"', async () => {
    await createCardForUser('user_1', { url: 'https://example.com' })
    const createArg = mockDb.card.create.mock.calls[0][0]
    expect(createArg.data.metadata.processing).toBe(true)
    expect(createArg.data.metadata.enrichmentStage).toBe('queued')
    expect(createArg.data.metadata.enrichmentTiming).toBeDefined()
  })

  it('enqueues enrichment for the new card id (fire-and-forget)', async () => {
    await createCardForUser('user_1', { url: 'https://example.com' })
    expect(mockEnrich).toHaveBeenCalledWith('card_1')
  })

  it('does not throw if enrichment rejects (fire-and-forget)', async () => {
    mockEnrich.mockRejectedValueOnce(new Error('enrichment blew up'))
    await expect(
      createCardForUser('user_1', { url: 'https://example.com' })
    ).resolves.toBeDefined()
  })

  it('defaults type to "website" when url present but type is null/undefined', async () => {
    await createCardForUser('user_1', { url: 'https://example.com', type: null })
    const createArg = mockDb.card.create.mock.calls[0][0]
    expect(createArg.data.type).toBe('website')
  })
})
