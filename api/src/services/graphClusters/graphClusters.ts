import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'
import { validate as validateUuid } from 'uuid'

// Validate node IDs exist and belong to the user
async function validateNodeIds(nodeIds: string[], userId: string): Promise<string[]> {
  if (!nodeIds || nodeIds.length === 0) {
    throw new Error('At least one node ID is required')
  }

  // Validate UUID format
  const invalidIds = nodeIds.filter(id => !validateUuid(id))
  if (invalidIds.length > 0) {
    throw new Error(`Invalid node IDs: ${invalidIds.join(', ')}`)
  }

  // Verify all cards exist and belong to user
  const cards = await db.card.findMany({
    where: {
      id: { in: nodeIds },
      userId,
      deletedAt: null,
    },
    select: { id: true },
  })

  const foundIds = new Set(cards.map(c => c.id))
  const missingIds = nodeIds.filter(id => !foundIds.has(id))

  if (missingIds.length > 0) {
    throw new Error(`Cards not found or not owned by user: ${missingIds.join(', ')}`)
  }

  return nodeIds
}

export const graphClusters: QueryResolvers['graphClusters'] = async ({ spaceId }) => {
  const userId = context.currentUser!.id

  const where: any = { userId }
  if (spaceId !== undefined) {
    where.spaceId = spaceId
  }

  return db.graphCluster.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
}

export const graphCluster: QueryResolvers['graphCluster'] = async ({ id }) => {
  const userId = context.currentUser!.id

  return db.graphCluster.findFirst({
    where: { id, userId },
  })
}

export const createGraphCluster: MutationResolvers['createGraphCluster'] = async ({ input }) => {
  const userId = context.currentUser!.id

  // Validate name
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('Name is required')
  }
  if (input.name.length > 60) {
    throw new Error('Name must be 60 characters or less')
  }

  // Validate note length
  if (input.note && input.note.length > 280) {
    throw new Error('Note must be 280 characters or less')
  }

  // Validate node IDs
  const validatedNodeIds = await validateNodeIds(input.nodeIds, userId)

  return db.graphCluster.create({
    data: {
      userId,
      spaceId: input.spaceId || null,
      name: input.name.trim(),
      note: input.note?.trim() || null,
      nodeIds: validatedNodeIds,
    },
  })
}

export const updateGraphCluster: MutationResolvers['updateGraphCluster'] = async ({ id, input }) => {
  const userId = context.currentUser!.id

  // Verify ownership
  const existing = await db.graphCluster.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Cluster not found')

  const data: any = {}

  if (input.name !== undefined) {
    if (input.name.trim().length === 0) {
      throw new Error('Name is required')
    }
    if (input.name.length > 60) {
      throw new Error('Name must be 60 characters or less')
    }
    data.name = input.name.trim()
  }

  if (input.note !== undefined) {
    if (input.note && input.note.length > 280) {
      throw new Error('Note must be 280 characters or less')
    }
    data.note = input.note?.trim() || null
  }

  if (input.spaceId !== undefined) {
    data.spaceId = input.spaceId || null
  }

  if (input.nodeIds !== undefined) {
    data.nodeIds = await validateNodeIds(input.nodeIds, userId)
  }

  return db.graphCluster.update({
    where: { id },
    data,
  })
}

export const deleteGraphCluster: MutationResolvers['deleteGraphCluster'] = async ({ id }) => {
  const userId = context.currentUser!.id

  // Verify ownership
  const existing = await db.graphCluster.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Cluster not found')

  return db.graphCluster.delete({ where: { id } })
}
