const graphClusterFindManyMock = jest.fn()
const graphClusterFindFirstMock = jest.fn()
const graphClusterCreateMock = jest.fn()
const graphClusterUpdateMock = jest.fn()
const graphClusterDeleteMock = jest.fn()
const cardFindManyMock = jest.fn()

jest.mock('src/lib/db', () => ({
  db: {
    graphCluster: {
      findMany: graphClusterFindManyMock,
      findFirst: graphClusterFindFirstMock,
      create: graphClusterCreateMock,
      update: graphClusterUpdateMock,
      delete: graphClusterDeleteMock,
    },
    card: {
      findMany: cardFindManyMock,
    },
  },
}))

import {
  graphClusters,
  graphCluster,
  createGraphCluster,
  updateGraphCluster,
  deleteGraphCluster,
} from './graphClusters'

describe('graphClusters service', () => {
  const mockUserId = '550e8400-e29b-41d4-a716-446655440000'
  const mockCardId = '550e8400-e29b-41d4-a716-446655440001'
  const mockClusterId = 'cluster-123'

  beforeEach(() => {
    jest.clearAllMocks()
    ;(globalThis as any).context = {
      currentUser: {
        id: mockUserId,
      },
    }
  })

  describe('graphClusters query', () => {
    it('returns clusters scoped to current user', async () => {
      graphClusterFindManyMock.mockResolvedValue([
        {
          id: mockClusterId,
          userId: mockUserId,
          name: 'Test Cluster',
          nodeIds: [mockCardId],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      const result = (await graphClusters({})) as Array<{ name: string }>

      expect(graphClusterFindManyMock).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { createdAt: 'desc' },
      })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test Cluster')
    })

    it('filters by spaceId when provided', async () => {
      const spaceId = 'space-123'
      graphClusterFindManyMock.mockResolvedValue([])

      await graphClusters({ spaceId })

      expect(graphClusterFindManyMock).toHaveBeenCalledWith({
        where: { userId: mockUserId, spaceId },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('graphCluster query', () => {
    it('returns a cluster by id with user scoping', async () => {
      graphClusterFindFirstMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'Test Cluster',
        nodeIds: [mockCardId],
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = (await graphCluster({ id: mockClusterId })) as { name: string } | null

      expect(graphClusterFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockClusterId, userId: mockUserId },
      })
      expect(result?.name).toBe('Test Cluster')
    })

    it('returns null when cluster not found', async () => {
      graphClusterFindFirstMock.mockResolvedValue(null)

      const result = await graphCluster({ id: 'non-existent' })

      expect(result).toBeNull()
    })
  })

  describe('createGraphCluster', () => {
    it('creates a cluster with validated node IDs', async () => {
      cardFindManyMock.mockResolvedValue([{ id: mockCardId }])
      graphClusterCreateMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'New Cluster',
        note: 'A note',
        nodeIds: [mockCardId],
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = (await createGraphCluster({
        input: {
          name: 'New Cluster',
          note: 'A note',
          nodeIds: [mockCardId],
        },
      })) as { name: string }

      expect(cardFindManyMock).toHaveBeenCalledWith({
        where: {
          id: { in: [mockCardId] },
          userId: mockUserId,
          deletedAt: null,
        },
        select: { id: true },
      })
      expect(graphClusterCreateMock).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          spaceId: null,
          name: 'New Cluster',
          note: 'A note',
          nodeIds: [mockCardId],
        },
      })
      expect(result.name).toBe('New Cluster')
    })

    it('throws error for empty name', async () => {
      await expect(
        createGraphCluster({
          input: {
            name: '',
            nodeIds: [mockCardId],
          },
        })
      ).rejects.toThrow('Name is required')
    })

    it('throws error for name exceeding 60 chars', async () => {
      await expect(
        createGraphCluster({
          input: {
            name: 'a'.repeat(61),
            nodeIds: [mockCardId],
          },
        })
      ).rejects.toThrow('Name must be 60 characters or less')
    })

    it('throws error for note exceeding 280 chars', async () => {
      cardFindManyMock.mockResolvedValue([{ id: mockCardId }])
      await expect(
        createGraphCluster({
          input: {
            name: 'Valid Name',
            note: 'a'.repeat(281),
            nodeIds: [mockCardId],
          },
        })
      ).rejects.toThrow('Note must be 280 characters or less')
    })

    it('throws error for missing node IDs', async () => {
      await expect(
        createGraphCluster({
          input: {
            name: 'Valid Name',
            nodeIds: [],
          },
        })
      ).rejects.toThrow('At least one node ID is required')
    })

    it('throws error for cards not owned by user', async () => {
      cardFindManyMock.mockResolvedValue([])

      await expect(
        createGraphCluster({
          input: {
            name: 'Valid Name',
            nodeIds: [mockCardId],
          },
        })
      ).rejects.toThrow(`Cards not found or not owned by user: ${mockCardId}`)
    })

    it('includes spaceId when provided', async () => {
      const spaceId = 'space-123'
      cardFindManyMock.mockResolvedValue([{ id: mockCardId }])
      graphClusterCreateMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        spaceId,
        name: 'Space Cluster',
        nodeIds: [mockCardId],
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await createGraphCluster({
        input: {
          name: 'Space Cluster',
          spaceId,
          nodeIds: [mockCardId],
        },
      })

      expect(graphClusterCreateMock).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          spaceId,
          name: 'Space Cluster',
          note: null,
          nodeIds: [mockCardId],
        },
      })
    })
  })

  describe('updateGraphCluster', () => {
    it('updates cluster with ownership check', async () => {
      graphClusterFindFirstMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'Old Name',
        nodeIds: [mockCardId],
      })
      graphClusterUpdateMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'Updated Name',
        nodeIds: [mockCardId],
      })

      const result = (await updateGraphCluster({
        id: mockClusterId,
        input: {
          name: 'Updated Name',
        },
      })) as { name: string }

      expect(graphClusterFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockClusterId, userId: mockUserId },
      })
      expect(graphClusterUpdateMock).toHaveBeenCalledWith({
        where: { id: mockClusterId },
        data: { name: 'Updated Name' },
      })
      expect(result.name).toBe('Updated Name')
    })

    it('throws error when cluster not found', async () => {
      graphClusterFindFirstMock.mockResolvedValue(null)

      await expect(
        updateGraphCluster({
          id: 'non-existent',
          input: { name: 'New Name' },
        })
      ).rejects.toThrow('Cluster not found')
    })

    it('validates node IDs on update', async () => {
      const newCardId = '550e8400-e29b-41d4-a716-446655440002'
      graphClusterFindFirstMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'Old Name',
        nodeIds: [mockCardId],
      })
      cardFindManyMock.mockResolvedValue([{ id: newCardId }])
      graphClusterUpdateMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'Old Name',
        nodeIds: [newCardId],
      })

      await updateGraphCluster({
        id: mockClusterId,
        input: {
          nodeIds: [newCardId],
        },
      })

      expect(cardFindManyMock).toHaveBeenCalledWith({
        where: {
          id: { in: [newCardId] },
          userId: mockUserId,
          deletedAt: null,
        },
        select: { id: true },
      })
    })
  })

  describe('deleteGraphCluster', () => {
    it('deletes cluster with ownership check', async () => {
      graphClusterFindFirstMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'To Delete',
        nodeIds: [mockCardId],
      })
      graphClusterDeleteMock.mockResolvedValue({
        id: mockClusterId,
        userId: mockUserId,
        name: 'To Delete',
        nodeIds: [mockCardId],
      })

      const result = await deleteGraphCluster({ id: mockClusterId })

      expect(graphClusterFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockClusterId, userId: mockUserId },
      })
      expect(graphClusterDeleteMock).toHaveBeenCalledWith({
        where: { id: mockClusterId },
      })
      expect(result.id).toBe(mockClusterId)
    })

    it('throws error when cluster not found', async () => {
      graphClusterFindFirstMock.mockResolvedValue(null)

      await expect(
        deleteGraphCluster({ id: 'non-existent' })
      ).rejects.toThrow('Cluster not found')
    })
  })
})
