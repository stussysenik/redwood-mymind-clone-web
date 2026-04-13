const graphAnnotationFindManyMock = jest.fn()
const graphAnnotationFindFirstMock = jest.fn()
const graphAnnotationCreateMock = jest.fn()
const graphAnnotationUpdateMock = jest.fn()
const graphAnnotationDeleteMock = jest.fn()
const cardFindFirstMock = jest.fn()
const graphClusterFindFirstMock = jest.fn()

jest.mock('src/lib/db', () => ({
  db: {
    graphAnnotation: {
      findMany: graphAnnotationFindManyMock,
      findFirst: graphAnnotationFindFirstMock,
      create: graphAnnotationCreateMock,
      update: graphAnnotationUpdateMock,
      delete: graphAnnotationDeleteMock,
    },
    card: {
      findFirst: cardFindFirstMock,
    },
    graphCluster: {
      findFirst: graphClusterFindFirstMock,
    },
  },
}))

import {
  graphAnnotations,
  graphAnnotation,
  createGraphAnnotation,
  updateGraphAnnotation,
  deleteGraphAnnotation,
} from './graphAnnotations'

describe('graphAnnotations service', () => {
  const mockUserId = '550e8400-e29b-41d4-a716-446655440000'
  const mockCardId = '550e8400-e29b-41d4-a716-446655440001'
  const mockClusterId = 'cluster-123'
  const mockAnnotationId = 'annotation-123'

  beforeEach(() => {
    jest.clearAllMocks()
    ;(globalThis as any).context = {
      currentUser: {
        id: mockUserId,
      },
    }
  })

  describe('graphAnnotations query', () => {
    it('returns annotations scoped to current user', async () => {
      graphAnnotationFindManyMock.mockResolvedValue([
        {
          id: mockAnnotationId,
          userId: mockUserId,
          anchorType: 'node',
          anchorId: mockCardId,
          text: 'Test annotation',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      const result = await graphAnnotations({})

      expect(graphAnnotationFindManyMock).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { createdAt: 'desc' },
      })
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Test annotation')
    })

    it('filters by anchorType when provided', async () => {
      graphAnnotationFindManyMock.mockResolvedValue([])

      await graphAnnotations({ anchorType: 'cluster' })

      expect(graphAnnotationFindManyMock).toHaveBeenCalledWith({
        where: { userId: mockUserId, anchorType: 'cluster' },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('filters by anchorId when provided', async () => {
      graphAnnotationFindManyMock.mockResolvedValue([])

      await graphAnnotations({ anchorId: mockCardId })

      expect(graphAnnotationFindManyMock).toHaveBeenCalledWith({
        where: { userId: mockUserId, anchorId: mockCardId },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('graphAnnotation query', () => {
    it('returns an annotation by id with user scoping', async () => {
      graphAnnotationFindFirstMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: mockCardId,
        text: 'Test annotation',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await graphAnnotation({ id: mockAnnotationId })

      expect(graphAnnotationFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockAnnotationId, userId: mockUserId },
      })
      expect(result?.text).toBe('Test annotation')
    })

    it('returns null when annotation not found', async () => {
      graphAnnotationFindFirstMock.mockResolvedValue(null)

      const result = await graphAnnotation({ id: 'non-existent' })

      expect(result).toBeNull()
    })
  })

  describe('createGraphAnnotation', () => {
    it('creates an annotation anchored to a node', async () => {
      cardFindFirstMock.mockResolvedValue({ id: mockCardId })
      graphAnnotationCreateMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: mockCardId,
        text: 'New annotation',
        offsetX: 1.0,
        offsetY: 2.0,
        offsetZ: 3.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await createGraphAnnotation({
        input: {
          anchorType: 'node',
          anchorId: mockCardId,
          text: 'New annotation',
          offsetX: 1.0,
          offsetY: 2.0,
          offsetZ: 3.0,
        },
      })

      expect(cardFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockCardId, userId: mockUserId, deletedAt: null },
        select: { id: true },
      })
      expect(graphAnnotationCreateMock).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          anchorType: 'node',
          anchorId: mockCardId,
          text: 'New annotation',
          offsetX: 1.0,
          offsetY: 2.0,
          offsetZ: 3.0,
        },
      })
      expect(result.text).toBe('New annotation')
    })

    it('creates an annotation anchored to a cluster', async () => {
      graphClusterFindFirstMock.mockResolvedValue({ id: mockClusterId })
      graphAnnotationCreateMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'cluster',
        anchorId: mockClusterId,
        text: 'Cluster annotation',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await createGraphAnnotation({
        input: {
          anchorType: 'cluster',
          anchorId: mockClusterId,
          text: 'Cluster annotation',
        },
      })

      expect(graphClusterFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockClusterId, userId: mockUserId },
        select: { id: true },
      })
      expect(result.anchorType).toBe('cluster')
    })

    it('throws error for empty text', async () => {
      await expect(
        createGraphAnnotation({
          input: {
            anchorType: 'node',
            anchorId: mockCardId,
            text: '',
          },
        })
      ).rejects.toThrow('Text is required')
    })

    it('throws error for text exceeding 280 chars', async () => {
      await expect(
        createGraphAnnotation({
          input: {
            anchorType: 'node',
            anchorId: mockCardId,
            text: 'a'.repeat(281),
          },
        })
      ).rejects.toThrow('Text must be 280 characters or less')
    })

    it('throws error for invalid anchorType', async () => {
      await expect(
        createGraphAnnotation({
          input: {
            anchorType: 'invalid',
            anchorId: mockCardId,
            text: 'Valid text',
          },
        })
      ).rejects.toThrow('anchorType must be "node" or "cluster"')
    })

    it('throws error for node not owned by user', async () => {
      cardFindFirstMock.mockResolvedValue(null)

      await expect(
        createGraphAnnotation({
          input: {
            anchorType: 'node',
            anchorId: mockCardId,
            text: 'Valid text',
          },
        })
      ).rejects.toThrow('Card not found or not owned by user')
    })

    it('throws error for cluster not owned by user', async () => {
      graphClusterFindFirstMock.mockResolvedValue(null)

      await expect(
        createGraphAnnotation({
          input: {
            anchorType: 'cluster',
            anchorId: mockClusterId,
            text: 'Valid text',
          },
        })
      ).rejects.toThrow('Cluster not found or not owned by user')
    })
  })

  describe('updateGraphAnnotation', () => {
    it('updates annotation with ownership check', async () => {
      graphAnnotationFindFirstMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: mockCardId,
        text: 'Old text',
      })
      graphAnnotationUpdateMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: mockCardId,
        text: 'Updated text',
      })

      const result = await updateGraphAnnotation({
        id: mockAnnotationId,
        input: {
          text: 'Updated text',
        },
      })

      expect(graphAnnotationFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockAnnotationId, userId: mockUserId },
      })
      expect(graphAnnotationUpdateMock).toHaveBeenCalledWith({
        where: { id: mockAnnotationId },
        data: { text: 'Updated text' },
      })
      expect(result.text).toBe('Updated text')
    })

    it('throws error when annotation not found', async () => {
      graphAnnotationFindFirstMock.mockResolvedValue(null)

      await expect(
        updateGraphAnnotation({
          id: 'non-existent',
          input: { text: 'New text' },
        })
      ).rejects.toThrow('Annotation not found')
    })

    it('validates new anchor on update', async () => {
      const newCardId = '550e8400-e29b-41d4-a716-446655440002'
      graphAnnotationFindFirstMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: mockCardId,
        text: 'Old text',
      })
      cardFindFirstMock.mockResolvedValue({ id: newCardId })
      graphAnnotationUpdateMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: newCardId,
        text: 'Old text',
      })

      await updateGraphAnnotation({
        id: mockAnnotationId,
        input: {
          anchorId: newCardId,
        },
      })

      expect(cardFindFirstMock).toHaveBeenCalledWith({
        where: { id: newCardId, userId: mockUserId, deletedAt: null },
        select: { id: true },
      })
    })
  })

  describe('deleteGraphAnnotation', () => {
    it('deletes annotation with ownership check', async () => {
      graphAnnotationFindFirstMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: mockCardId,
        text: 'To delete',
      })
      graphAnnotationDeleteMock.mockResolvedValue({
        id: mockAnnotationId,
        userId: mockUserId,
        anchorType: 'node',
        anchorId: mockCardId,
        text: 'To delete',
      })

      const result = await deleteGraphAnnotation({ id: mockAnnotationId })

      expect(graphAnnotationFindFirstMock).toHaveBeenCalledWith({
        where: { id: mockAnnotationId, userId: mockUserId },
      })
      expect(graphAnnotationDeleteMock).toHaveBeenCalledWith({
        where: { id: mockAnnotationId },
      })
      expect(result.id).toBe(mockAnnotationId)
    })

    it('throws error when annotation not found', async () => {
      graphAnnotationFindFirstMock.mockResolvedValue(null)

      await expect(
        deleteGraphAnnotation({ id: 'non-existent' })
      ).rejects.toThrow('Annotation not found')
    })
  })
})
