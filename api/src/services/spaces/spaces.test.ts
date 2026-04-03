const spaceFindManyMock = jest.fn()
const spaceFindFirstMock = jest.fn()
const spaceCreateMock = jest.fn()
const spaceUpdateMock = jest.fn()
const cardCountMock = jest.fn()
const cardFindManyMock = jest.fn()

jest.mock('src/lib/db', () => ({
  db: {
    space: {
      findMany: spaceFindManyMock,
      findFirst: spaceFindFirstMock,
      create: spaceCreateMock,
      update: spaceUpdateMock,
    },
    card: {
      count: cardCountMock,
      findMany: cardFindManyMock,
    },
  },
}))

import { createSpace, space, spaces, updateSpace } from './spaces'

describe('spaces service tag normalization', () => {
  beforeEach(() => {
    spaceFindManyMock.mockReset()
    spaceFindFirstMock.mockReset()
    spaceCreateMock.mockReset()
    spaceUpdateMock.mockReset()
    cardCountMock.mockReset()
    cardFindManyMock.mockReset()

    ;(globalThis as any).context = {
      currentUser: {
        id: 'user-1',
      },
    }
  })

  it('normalizes smart space queries before counting cards', async () => {
    spaceFindManyMock.mockResolvedValue([
      {
        id: 'space-1',
        userId: 'user-1',
        name: 'Visual',
        query: '#Visual Mood',
        isSmart: true,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
      },
    ])
    cardCountMock.mockResolvedValue(4)

    const result = (await spaces()) as any[]

    expect(cardCountMock).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        deletedAt: null,
        archivedAt: null,
        tags: { has: 'visual-mood' },
      },
    })
    expect(result[0].cardCount).toBe(4)
  })

  it('normalizes smart space queries before fetching cards', async () => {
    spaceFindFirstMock.mockResolvedValue({
      id: 'space-1',
      userId: 'user-1',
      name: 'Design Systems',
      query: '#Design Systems',
      isSmart: true,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
    })
    cardFindManyMock.mockResolvedValue([{ id: 'card-1' }])

    const result = (await space({ id: 'space-1' })) as any

    expect(cardFindManyMock).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        deletedAt: null,
        archivedAt: null,
        tags: { has: 'design-systems' },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    expect(result?.cardCount).toBe(1)
  })

  it('stores normalized smart space queries on create', async () => {
    spaceCreateMock.mockResolvedValue({
      id: 'space-1',
      userId: 'user-1',
      name: 'Visual Mood',
      query: 'visual-mood',
      isSmart: true,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
    })

    await createSpace({
      input: {
        name: 'Visual Mood',
        query: '#Visual Mood',
        isSmart: true,
      },
    })

    expect(spaceCreateMock).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Visual Mood',
        query: 'visual-mood',
        isSmart: true,
      },
    })
  })

  it('stores normalized smart space queries on update', async () => {
    spaceFindFirstMock.mockResolvedValue({
      id: 'space-1',
      userId: 'user-1',
      name: 'Old Name',
      query: 'old-tag',
      isSmart: true,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
    })
    spaceUpdateMock.mockResolvedValue({
      id: 'space-1',
      userId: 'user-1',
      name: 'Visual Mood',
      query: 'visual-mood',
      isSmart: true,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
    })

    await updateSpace({
      id: 'space-1',
      input: {
        query: '#Visual Mood',
      },
    })

    expect(spaceUpdateMock).toHaveBeenCalledWith({
      where: { id: 'space-1' },
      data: {
        query: 'visual-mood',
      },
    })
  })
})
