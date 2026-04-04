const findManyMock = jest.fn()
const queryRawMock = jest.fn()
const querySemanticSimilarMock = jest.fn()
const getEmbeddingAvailabilityMock = jest.fn()
const getEmbeddingCompatibilityMock = jest.fn()

jest.mock('src/lib/db', () => ({
  db: {
    card: {
      findMany: findManyMock,
    },
    $queryRaw: queryRawMock,
  },
}))

jest.mock('src/lib/ai/vectorStore', () => ({
  querySemanticSimilar: querySemanticSimilarMock,
}))

jest.mock('src/lib/ai/embeddings', () => ({
  getEmbeddingAvailability: getEmbeddingAvailabilityMock,
  getEmbeddingCompatibility: getEmbeddingCompatibilityMock,
}))

import { searchCardsForUser, searchCardsForUserDetailed } from './search'

const makeRow = (overrides = {}) => ({
  id: 'card-1',
  user_id: 'user-1',
  type: 'link',
  title: 'Example card',
  content: 'Body text',
  url: 'https://example.com',
  image_url: 'https://example.com/image.jpg',
  metadata: {},
  tags: ['tag-name'],
  created_at: new Date('2026-03-31T00:00:00.000Z'),
  updated_at: new Date('2026-03-31T00:00:00.000Z'),
  deleted_at: null,
  archived_at: null,
  ...overrides,
})

describe('searchCards', () => {
  beforeEach(() => {
    queryRawMock.mockReset()
    findManyMock.mockReset()
    querySemanticSimilarMock.mockReset()
    getEmbeddingAvailabilityMock.mockReset()
    getEmbeddingAvailabilityMock.mockReturnValue({
      configured: false,
      provider: null,
      model: null,
      dimension: null,
      reason: 'No embedding provider configured',
    })
    getEmbeddingCompatibilityMock.mockReturnValue({
      status: 'unavailable',
      provider: null,
      model: null,
      expectedDimension: 1536,
      configuredDimension: null,
      vectorStoreDimension: 1536,
      reason: 'No embedding provider configured',
    })
  })

  it('normalizes hashtag searches before tag matching', async () => {
    queryRawMock.mockResolvedValue([makeRow()])

    const result = await searchCardsForUser('user-1', {
      query: '#Tag-Name',
      limit: 10,
    })

    const values = queryRawMock.mock.calls[0][0].values

    expect(values).toEqual(expect.arrayContaining(['Tag-Name', '%Tag-Name%']))
    expect(values).not.toEqual(expect.arrayContaining(['#Tag-Name']))
    expect(result.mode).toBe('search')
    expect(result.total).toBe(1)
    expect(result.cards[0].tags).toEqual(['tag-name'])
  })

  it('keeps freeform search text intact', async () => {
    queryRawMock.mockResolvedValue([makeRow()])

    await searchCardsForUser('user-1', {
      query: 'Design Inspiration',
      limit: 10,
    })

    const values = queryRawMock.mock.calls[0][0].values

    expect(values).toEqual(
      expect.arrayContaining(['Design Inspiration', '%Design Inspiration%'])
    )
  })

  it('normalizes tag filters without affecting browse mode', async () => {
    findManyMock.mockResolvedValue([makeRow()])

    const result = await searchCardsForUser('user-1', {
      tag: '#Tag-Name',
      limit: 10,
    })

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        deletedAt: null,
        archivedAt: null,
        tags: {
          has: 'tag-name',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    })
    expect(result.mode).toBe('browse')
    expect(result.total).toBe(1)
  })

  it('applies the explicit tag filter during searched queries', async () => {
    queryRawMock.mockResolvedValue([makeRow()])

    await searchCardsForUser('user-1', {
      query: 'Design Inspiration',
      tag: '#Visual',
      limit: 10,
    })

    const values = queryRawMock.mock.calls[0][0].values
    expect(values).toEqual(expect.arrayContaining(['visual']))
  })

  it('normalizes spaced hashtag queries to stored tag format', async () => {
    queryRawMock.mockResolvedValue([makeRow({ tags: ['design-systems'] })])

    await searchCardsForUser('user-1', {
      query: '#Design Systems',
      limit: 10,
    })

    const values = queryRawMock.mock.calls[0][0].values
    expect(values).toEqual(
      expect.arrayContaining([
        'Design Systems',
        '%Design Systems%',
        'design-systems',
      ])
    )
  })

  it('merges semantic-only matches into the ranked search results when embeddings are available', async () => {
    queryRawMock.mockResolvedValue([])
    getEmbeddingAvailabilityMock.mockReturnValue({
      configured: true,
      provider: 'gemini',
      model: 'gemini-embedding-2',
      dimension: 1536,
      reason: null,
    })
    getEmbeddingCompatibilityMock.mockReturnValue({
      status: 'ready',
      provider: 'gemini',
      model: 'gemini-embedding-2',
      expectedDimension: 1536,
      configuredDimension: 1536,
      vectorStoreDimension: 1536,
      reason: null,
    })
    querySemanticSimilarMock.mockResolvedValue([
      {
        id: 'card-2',
        score: 0.92,
      },
    ])
    findManyMock.mockResolvedValue([
      {
        id: 'card-2',
        userId: 'user-1',
        type: 'link',
        title: 'Semantic result',
        content: 'Found by meaning',
        url: 'https://example.com/semantic',
        imageUrl: null,
        metadata: {},
        tags: ['semantic'],
        createdAt: new Date('2026-03-31T00:00:00.000Z'),
        updatedAt: new Date('2026-03-31T00:00:00.000Z'),
        deletedAt: null,
        archivedAt: null,
      },
    ])

    const result = await searchCardsForUser('user-1', {
      query: 'creative retrieval',
      limit: 10,
    })

    expect(querySemanticSimilarMock).toHaveBeenCalledWith(
      'user-1',
      'creative retrieval',
      expect.any(Number)
    )
    expect(result.cards[0].id).toBe('card-2')
    expect(result.mode).toBe('semantic-hybrid')
  })

  it('emits explainable ranking diagnostics and skip reasons', async () => {
    queryRawMock.mockResolvedValue([makeRow({ exact_tag_match: true })])

    const result = await searchCardsForUserDetailed('user-1', {
      query: '#Tag-Name',
      limit: 10,
    })

    expect(result.diagnostics?.results[0]?.reasons).toEqual(
      expect.arrayContaining(['exact-tag-match:8'])
    )
    expect(result.diagnostics?.skipped).toEqual([
      expect.objectContaining({
        stage: 'semantic',
        reason: 'No embedding provider configured',
      }),
    ])
  })

  it('sanitizes semantic-only matches before returning them', async () => {
    queryRawMock.mockResolvedValue([])
    getEmbeddingAvailabilityMock.mockReturnValue({
      configured: true,
      provider: 'gemini',
      model: 'gemini-embedding-2',
      dimension: 1536,
      reason: null,
    })
    getEmbeddingCompatibilityMock.mockReturnValue({
      status: 'ready',
      provider: 'gemini',
      model: 'gemini-embedding-2',
      expectedDimension: 1536,
      configuredDimension: 1536,
      vectorStoreDimension: 1536,
      reason: null,
    })
    querySemanticSimilarMock.mockResolvedValue([
      {
        id: 'card-2',
        score: 0.92,
      },
    ])
    findManyMock.mockResolvedValue([
      {
        id: 'card-2',
        userId: 'user-1',
        type: 'social',
        title: 'Semantic result',
        content: 'Found by meaning',
        url: 'https://x.com/creator/status/1',
        imageUrl: null,
        metadata: {
          platform: 'twitter',
          authorHandle: 'Creator Handle',
        },
        tags: ['Creator Handle', 'Fresh Tag'],
        createdAt: new Date('2026-03-31T00:00:00.000Z'),
        updatedAt: new Date('2026-03-31T00:00:00.000Z'),
        deletedAt: null,
        archivedAt: null,
      },
    ])

    const result = await searchCardsForUser('user-1', {
      query: 'creative retrieval',
      limit: 10,
    })

    expect(result.cards[0].tags).toEqual(['fresh-tag'])
  })
})
