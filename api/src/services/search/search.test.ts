const findManyMock = jest.fn()
const queryRawMock = jest.fn()

jest.mock('src/lib/db', () => ({
  db: {
    card: {
      findMany: findManyMock,
    },
    $queryRaw: queryRawMock,
  },
}))

import { searchCards } from './search'

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
    globalThis.context = {
      currentUser: {
        id: 'user-1',
      },
    } as any
  })

  it('normalizes hashtag searches before tag matching', async () => {
    queryRawMock.mockResolvedValue([makeRow()])

    const result = await searchCards({
      query: '#Tag-Name',
      limit: 10,
    })

    const values = queryRawMock.mock.calls[0].slice(1)

    expect(values).toEqual(
      expect.arrayContaining(['Tag-Name', '%Tag-Name%'])
    )
    expect(values).not.toEqual(expect.arrayContaining(['#Tag-Name']))
    expect(result.mode).toBe('search')
    expect(result.total).toBe(1)
    expect(result.cards[0].tags).toEqual(['tag-name'])
  })

  it('keeps freeform search text intact', async () => {
    queryRawMock.mockResolvedValue([makeRow()])

    await searchCards({
      query: 'Design Inspiration',
      limit: 10,
    })

    const values = queryRawMock.mock.calls[0].slice(1)

    expect(values).toEqual(
      expect.arrayContaining(['Design Inspiration', '%Design Inspiration%'])
    )
  })

  it('normalizes tag filters without affecting browse mode', async () => {
    findManyMock.mockResolvedValue([makeRow()])

    const result = await searchCards({
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
})
