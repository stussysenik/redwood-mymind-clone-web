import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'
import { createEnrichmentTiming } from 'src/lib/enrichmentTiming'
import { logger } from 'src/lib/logger'
import { detectPlatform } from 'src/lib/platforms'
import { stripGeneratedTagNoise } from 'src/lib/semantic'
import { enrichCardPipeline } from 'src/services/enrichment/enrichment'

function sanitizeCardTags<T extends { tags?: string[] | null; metadata?: unknown; url?: string | null }>(
  card: T
): T {
  const metadata =
    card.metadata && typeof card.metadata === 'object' && !Array.isArray(card.metadata)
      ? (card.metadata as Record<string, unknown>)
      : {}

  return {
    ...card,
    tags: stripGeneratedTagNoise(card.tags || [], {
      platform: typeof metadata.platform === 'string' ? metadata.platform : null,
      url: card.url || null,
      authorHandle:
        typeof metadata.authorHandle === 'string'
          ? metadata.authorHandle
          : typeof metadata.author === 'string'
            ? metadata.author
            : null,
      authorName:
        typeof metadata.authorName === 'string' ? metadata.authorName : null,
    }),
  }
}

export const cards: QueryResolvers['cards'] = async ({
  page = 1,
  pageSize = 24,
  mode = 'DEFAULT',
}) => {
  const userId = context.currentUser!.id
  const skip = (page - 1) * pageSize

  const where: any = { userId }

  switch (mode) {
    case 'ARCHIVE':
      where.archivedAt = { not: null }
      where.deletedAt = null
      break
    case 'TRASH':
      where.deletedAt = { not: null }
      break
    default:
      where.deletedAt = null
      where.archivedAt = null
      break
  }

  const [cardsList, total] = await Promise.all([
    db.card.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.card.count({ where }),
  ])

  return {
    cards: cardsList.map((card) => sanitizeCardTags(card)),
    total,
    page,
    pageSize,
    hasMore: skip + cardsList.length < total,
  }
}

export const card: QueryResolvers['card'] = async ({ id }) => {
  const result = await db.card.findFirst({
    where: {
      id,
      userId: context.currentUser!.id,
    },
  })

  return result ? sanitizeCardTags(result) : null
}

export const randomCards: QueryResolvers['randomCards'] = async ({
  limit = 10,
}) => {
  const userId = context.currentUser!.id
  // Use raw SQL for random selection (more efficient than Prisma)
  const cards = await db.$queryRaw<any[]>`
    SELECT * FROM cards
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
      AND archived_at IS NULL
    ORDER BY RANDOM()
    LIMIT ${limit}
  `
  return cards.map((row) =>
    sanitizeCardTags({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      content: row.content,
      url: row.url,
      imageUrl: row.image_url,
      metadata: row.metadata || {},
      tags: row.tags || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      archivedAt: row.archived_at,
    })
  )
}

export const saveCard: MutationResolvers['saveCard'] = async ({ input }) => {
  const userId = context.currentUser!.id
  const clientMetadata =
    input.clientClassification &&
    typeof input.clientClassification === 'object' &&
    !Array.isArray(input.clientClassification)
      ? (input.clientClassification as Record<string, unknown>)
      : {}
  const contentLength = (input.content?.length || 0) + (input.title?.length || 0)
  const timing = createEnrichmentTiming(
    input.url ? detectPlatform(input.url) : input.type || 'generic',
    contentLength,
    !!input.imageUrl
  )

  const card = await db.card.create({
    data: {
      userId,
      type: input.type || 'website',
      title: input.title || null,
      content: input.content || null,
      url: input.url || null,
      imageUrl: input.imageUrl || null,
      tags: input.tags || [],
      metadata: {
        ...clientMetadata,
        processing: true,
        enrichmentStage: 'queued',
        enrichmentTiming: {
          startedAt: timing.startedAt,
          estimatedTotalMs: timing.estimatedTotalMs,
          platform: timing.platform,
        },
      },
    },
  })

  // Save is the single entry point for new-card enrichment.
  enrichCardPipeline(card.id).catch((err) => {
    logger.error({ cardId: card.id, err }, 'Background enrichment failed')
  })

  return card
}

export const updateCard: MutationResolvers['updateCard'] = async ({
  id,
  input,
}) => {
  const userId = context.currentUser!.id

  // Verify ownership
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.content !== undefined) data.content = input.content
  if (input.type !== undefined) data.type = input.type
  if (input.tags !== undefined) data.tags = input.tags
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl
  if (input.metadata !== undefined) {
    data.metadata = { ...(existing.metadata as any), ...(input.metadata as any) }
  }

  return db.card.update({ where: { id }, data })
}

export const deleteCard: MutationResolvers['deleteCard'] = async ({
  id,
  permanent,
}) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  if (permanent) {
    return db.card.delete({ where: { id } })
  }

  return db.card.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

export const archiveCard: MutationResolvers['archiveCard'] = async ({ id }) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  return db.card.update({
    where: { id },
    data: { archivedAt: new Date() },
  })
}

export const unarchiveCard: MutationResolvers['unarchiveCard'] = async ({
  id,
}) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  return db.card.update({
    where: { id },
    data: { archivedAt: null },
  })
}

export const restoreCard: MutationResolvers['restoreCard'] = async ({
  id,
}) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  return db.card.update({
    where: { id },
    data: { deletedAt: null },
  })
}

export const bulkCardAction: MutationResolvers['bulkCardAction'] = async ({
  action,
}) => {
  const userId = context.currentUser!.id

  let result: { count: number }

  switch (action) {
    case 'EMPTY_TRASH':
      result = await db.card.deleteMany({
        where: { userId, deletedAt: { not: null } },
      })
      break
    case 'RESTORE_ALL':
      result = await db.card.updateMany({
        where: { userId, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      break
    case 'ARCHIVE_ALL':
      result = await db.card.updateMany({
        where: { userId, deletedAt: null, archivedAt: null },
        data: { archivedAt: new Date() },
      })
      break
    case 'UNARCHIVE_ALL':
      result = await db.card.updateMany({
        where: { userId, archivedAt: { not: null } },
        data: { archivedAt: null },
      })
      break
    default:
      throw new Error(`Unknown bulk action: ${action}`)
  }

  return { success: true, affectedCount: result.count }
}
