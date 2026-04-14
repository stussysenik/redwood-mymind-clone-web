import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s: string) => UUID_RE.test(s)

// Validate anchor exists and belongs to the user
async function validateAnchor(
  anchorType: string,
  anchorId: string,
  userId: string
): Promise<void> {
  if (!isUuid(anchorId)) {
    throw new Error('Invalid anchor ID format')
  }

  if (anchorType === 'node') {
    const card = await db.card.findFirst({
      where: { id: anchorId, userId, deletedAt: null },
      select: { id: true },
    })
    if (!card) throw new Error('Card not found or not owned by user')
  } else if (anchorType === 'cluster') {
    const cluster = await db.graphCluster.findFirst({
      where: { id: anchorId, userId },
      select: { id: true },
    })
    if (!cluster) throw new Error('Cluster not found or not owned by user')
  } else {
    throw new Error('anchorType must be "node" or "cluster"')
  }
}

export const graphAnnotations: QueryResolvers['graphAnnotations'] = async ({ anchorType, anchorId }) => {
  const userId = context.currentUser!.id

  const where: any = { userId }
  if (anchorType !== undefined) where.anchorType = anchorType
  if (anchorId !== undefined) where.anchorId = anchorId

  return db.graphAnnotation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
}

export const graphAnnotation: QueryResolvers['graphAnnotation'] = async ({ id }) => {
  const userId = context.currentUser!.id

  return db.graphAnnotation.findFirst({
    where: { id, userId },
  })
}

export const createGraphAnnotation: MutationResolvers['createGraphAnnotation'] = async ({ input }) => {
  const userId = context.currentUser!.id

  // Validate text
  if (!input.text || input.text.trim().length === 0) {
    throw new Error('Text is required')
  }
  if (input.text.length > 280) {
    throw new Error('Text must be 280 characters or less')
  }

  // Validate anchor
  await validateAnchor(input.anchorType, input.anchorId, userId)

  return db.graphAnnotation.create({
    data: {
      userId,
      anchorType: input.anchorType,
      anchorId: input.anchorId,
      text: input.text.trim(),
      offsetX: input.offsetX ?? null,
      offsetY: input.offsetY ?? null,
      offsetZ: input.offsetZ ?? null,
    },
  })
}

export const updateGraphAnnotation: MutationResolvers['updateGraphAnnotation'] = async ({ id, input }) => {
  const userId = context.currentUser!.id

  // Verify ownership
  const existing = await db.graphAnnotation.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Annotation not found')

  const data: any = {}

  if (input.text !== undefined) {
    if (input.text.trim().length === 0) {
      throw new Error('Text is required')
    }
    if (input.text.length > 280) {
      throw new Error('Text must be 280 characters or less')
    }
    data.text = input.text.trim()
  }

  if (input.offsetX !== undefined) data.offsetX = input.offsetX ?? null
  if (input.offsetY !== undefined) data.offsetY = input.offsetY ?? null
  if (input.offsetZ !== undefined) data.offsetZ = input.offsetZ ?? null

  // Validate new anchor if changed
  const newAnchorType = input.anchorType ?? existing.anchorType
  const newAnchorId = input.anchorId ?? existing.anchorId
  if (input.anchorType !== undefined || input.anchorId !== undefined) {
    await validateAnchor(newAnchorType, newAnchorId, userId)
    data.anchorType = newAnchorType
    data.anchorId = newAnchorId
  }

  return db.graphAnnotation.update({
    where: { id },
    data,
  })
}

export const deleteGraphAnnotation: MutationResolvers['deleteGraphAnnotation'] = async ({ id }) => {
  const userId = context.currentUser!.id

  // Verify ownership
  const existing = await db.graphAnnotation.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Annotation not found')

  return db.graphAnnotation.delete({ where: { id } })
}
