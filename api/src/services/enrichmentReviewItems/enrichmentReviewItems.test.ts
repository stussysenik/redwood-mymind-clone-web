const reviewFindManyMock = jest.fn()
const reviewCountMock = jest.fn()
const reviewFindFirstMock = jest.fn()
const reviewUpdateMock = jest.fn()
const cardFindFirstMock = jest.fn()
const cardUpdateMock = jest.fn()
const transactionMock = jest.fn()

jest.mock('src/lib/db', () => ({
  db: {
    enrichmentReviewItem: {
      findMany: reviewFindManyMock,
      count: reviewCountMock,
      findFirst: reviewFindFirstMock,
      update: reviewUpdateMock,
    },
    card: {
      findFirst: cardFindFirstMock,
      update: cardUpdateMock,
    },
    $transaction: transactionMock,
  },
}))

import {
  pendingEnrichmentReviewItems,
  resolveEnrichmentReviewItem,
} from './enrichmentReviewItems'

const mockUserId = '550e8400-e29b-41d4-a716-446655440000'
const otherUserId = '550e8400-e29b-41d4-a716-446655440999'
const mockCardId = '550e8400-e29b-41d4-a716-446655440001'
const mockReviewId = '550e8400-e29b-41d4-a716-446655440002'

beforeEach(() => {
  jest.clearAllMocks()
  ;(globalThis as any).context = {
    currentUser: { id: mockUserId, email: 'test@byoa.local' },
  }

  // Default: $transaction runs the callback with a mock tx that reuses the
  // same spies — keeps assertions simple.
  transactionMock.mockImplementation(async (cb: any) =>
    cb({
      enrichmentReviewItem: {
        findFirst: reviewFindFirstMock,
        update: reviewUpdateMock,
      },
      card: {
        findFirst: cardFindFirstMock,
        update: cardUpdateMock,
      },
    }),
  )
})

describe('pendingEnrichmentReviewItems', () => {
  it('scopes to current user and returns cursor pagination', async () => {
    const now = new Date('2026-04-14T10:00:00Z')
    reviewFindManyMock.mockResolvedValue([
      {
        id: mockReviewId,
        cardId: mockCardId,
        userId: mockUserId,
        kind: 'title',
        proposedValue: 'Home Server Rack Haul',
        currentValue: 'someones the new proud owner of a 42u server rack',
        confidence: 0.78,
        critique: 'Title is 4 words and captures the subject',
        createdAt: now,
        resolvedAt: null,
        resolution: null,
        editedValue: null,
      },
    ])
    reviewCountMock.mockResolvedValue(1)

    const result = await pendingEnrichmentReviewItems({
      first: 10,
      after: null as any,
      kind: 'any' as any,
    })

    expect(reviewFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: mockUserId,
          resolvedAt: null,
        }),
        orderBy: { createdAt: 'desc' },
        take: 11,
      }),
    )
    expect(result.edges).toHaveLength(1)
    expect(result.totalCount).toBe(1)
    expect(result.pageInfo.hasNextPage).toBe(false)
    expect(result.pageInfo.endCursor).not.toBeNull()
  })

  it('filters by kind when provided', async () => {
    reviewFindManyMock.mockResolvedValue([])
    reviewCountMock.mockResolvedValue(0)

    await pendingEnrichmentReviewItems({
      first: 5,
      after: null as any,
      kind: 'title' as any,
    })

    expect(reviewFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: 'title' }),
      }),
    )
  })
})

describe('resolveEnrichmentReviewItem', () => {
  const baseItem = {
    id: mockReviewId,
    cardId: mockCardId,
    userId: mockUserId,
    kind: 'title' as const,
    proposedValue: 'Home Server Rack Haul',
    currentValue: 'old title',
    confidence: 0.77,
    critique: 'good',
    createdAt: new Date(),
    resolvedAt: null,
    resolution: null,
    editedValue: null,
  }
  const baseCard = {
    id: mockCardId,
    userId: mockUserId,
    metadata: {},
    titleConfidence: null,
    descriptionConfidence: null,
  }

  it('rejects cross-user access', async () => {
    reviewFindFirstMock.mockResolvedValue(null)
    await expect(
      resolveEnrichmentReviewItem({
        id: mockReviewId,
        resolution: 'accept' as any,
        editedValue: null as any,
      }),
    ).rejects.toThrow('Review item not found')
    expect(cardUpdateMock).not.toHaveBeenCalled()
  })

  it('accept writes title and marks resolved', async () => {
    reviewFindFirstMock.mockResolvedValue(baseItem)
    cardFindFirstMock.mockResolvedValue(baseCard)
    cardUpdateMock.mockResolvedValue({ ...baseCard, title: 'Home Server Rack Haul' })
    reviewUpdateMock.mockResolvedValue({
      ...baseItem,
      resolvedAt: new Date(),
      resolution: 'accept',
    })

    await resolveEnrichmentReviewItem({
      id: mockReviewId,
      resolution: 'accept' as any,
      editedValue: null as any,
    })

    expect(cardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockCardId },
        data: expect.objectContaining({ title: 'Home Server Rack Haul' }),
      }),
    )
    expect(reviewUpdateMock).toHaveBeenCalled()
  })

  it('edit sets title_edited_at tombstone', async () => {
    reviewFindFirstMock.mockResolvedValue(baseItem)
    cardFindFirstMock.mockResolvedValue(baseCard)
    cardUpdateMock.mockResolvedValue({})
    reviewUpdateMock.mockResolvedValue({})

    await resolveEnrichmentReviewItem({
      id: mockReviewId,
      resolution: 'edit' as any,
      editedValue: 'User Wrote This',
    })

    const cardUpdate = cardUpdateMock.mock.calls[0][0]
    expect(cardUpdate.data.title).toBe('User Wrote This')
    expect(cardUpdate.data.titleEditedAt).toBeInstanceOf(Date)
  })

  it('reject leaves card untouched', async () => {
    reviewFindFirstMock.mockResolvedValue(baseItem)
    cardFindFirstMock.mockResolvedValue(baseCard)
    reviewUpdateMock.mockResolvedValue({})

    await resolveEnrichmentReviewItem({
      id: mockReviewId,
      resolution: 'reject' as any,
      editedValue: null as any,
    })

    expect(cardUpdateMock).not.toHaveBeenCalled()
    expect(reviewUpdateMock).toHaveBeenCalled()
  })

  it('skip leaves card untouched', async () => {
    reviewFindFirstMock.mockResolvedValue(baseItem)
    cardFindFirstMock.mockResolvedValue(baseCard)
    reviewUpdateMock.mockResolvedValue({})

    await resolveEnrichmentReviewItem({
      id: mockReviewId,
      resolution: 'skip' as any,
      editedValue: null as any,
    })

    expect(cardUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects edit without editedValue', async () => {
    reviewFindFirstMock.mockResolvedValue(baseItem)
    cardFindFirstMock.mockResolvedValue(baseCard)

    await expect(
      resolveEnrichmentReviewItem({
        id: mockReviewId,
        resolution: 'edit' as any,
        editedValue: '' as any,
      }),
    ).rejects.toThrow('editedValue is required')
  })

  it('rejects already-resolved item', async () => {
    reviewFindFirstMock.mockResolvedValue({ ...baseItem, resolvedAt: new Date() })

    await expect(
      resolveEnrichmentReviewItem({
        id: mockReviewId,
        resolution: 'accept' as any,
        editedValue: null as any,
      }),
    ).rejects.toThrow('already resolved')
  })

  it('description resolution writes to metadata.summary', async () => {
    reviewFindFirstMock.mockResolvedValue({ ...baseItem, kind: 'description' })
    cardFindFirstMock.mockResolvedValue({
      ...baseCard,
      metadata: { existing: 'value' },
    })
    cardUpdateMock.mockResolvedValue({})
    reviewUpdateMock.mockResolvedValue({})

    await resolveEnrichmentReviewItem({
      id: mockReviewId,
      resolution: 'accept' as any,
      editedValue: null as any,
    })

    const call = cardUpdateMock.mock.calls[0][0]
    expect(call.data.metadata).toEqual({
      existing: 'value',
      summary: baseItem.proposedValue,
    })
  })
})
