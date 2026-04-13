import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'
import { createEnrichmentTiming } from 'src/lib/enrichmentTiming'
import { logger } from 'src/lib/logger'
import { detectPlatform } from 'src/lib/platforms'
import { buildInitialLocalClassificationState, normalizeLocalClassification } from 'src/lib/ai/localClassification'
import { normalizeTagList, stripGeneratedTagNoise } from 'src/lib/semantic'
import { enrichCardPipeline, clearGraphCache } from 'src/services/enrichment/enrichment'
import { createCompositeImage, fetchImageBuffers } from 'src/lib/scraper/compositeImage'
import { buildMicrolinkScreenshotUrl } from 'src/lib/scraper/fallbackPreview'

function normalizePersistedTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return []
  }

  return normalizeTagList(tags)
}

function sanitizeCardTags<
  T extends { tags?: string[] | null; metadata?: unknown; url?: string | null },
>(card: T): T {
  const metadata =
    card.metadata &&
    typeof card.metadata === 'object' &&
    !Array.isArray(card.metadata)
      ? (card.metadata as Record<string, unknown>)
      : {}

  return {
    ...card,
    tags: stripGeneratedTagNoise(card.tags || [], {
      platform:
        typeof metadata.platform === 'string' ? metadata.platform : null,
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

// Shared card-creation path. Called by:
//   1. saveCard GraphQL resolver (user is from context.currentUser)
//   2. /functions/capture endpoint (user is resolved from an ApiToken)
//
// The serverless-fn path has no Redwood auth context, so the user id is
// passed explicitly rather than read from `context.currentUser`.
export async function createCardForUser(
  userId: string,
  input: {
    url?: string | null
    type?: string | null
    title?: string | null
    content?: string | null
    imageUrl?: string | null
    tags?: string[] | null
    clientClassification?: unknown
  }
) {
  const clientClassification = normalizeLocalClassification(
    input.clientClassification
  )
  const initialLocalState = buildInitialLocalClassificationState({
    inputType: input.type,
    inputTitle: input.title,
    inputTags: input.tags,
    clientClassification,
  })
  const contentLength =
    (input.content?.length || 0) + (initialLocalState.title?.length || 0)
  const timing = createEnrichmentTiming(
    input.url ? detectPlatform(input.url) : input.type || 'generic',
    contentLength,
    !!input.imageUrl
  )

  const card = await db.card.create({
    data: {
      userId,
      type: initialLocalState.type || input.type || 'website',
      title: initialLocalState.title || null,
      content: input.content || null,
      url: input.url || null,
      imageUrl: input.imageUrl || null,
      tags: normalizePersistedTags(initialLocalState.tags),
      metadata: {
        ...initialLocalState.metadata,
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

  // Fire and forget. Must not throw from this function if enrichment fails.
  void enrichCardPipeline(card.id).catch((err) => {
    logger.error({ cardId: card.id, err }, 'Background enrichment failed')
  })

  return card
}

export const saveCard: MutationResolvers['saveCard'] = async ({ input }) => {
  const userId = context.currentUser!.id
  const card = await createCardForUser(userId, input)
  clearGraphCache(userId)
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
  if (input.tags !== undefined) data.tags = normalizePersistedTags(input.tags)
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl
  if (input.metadata !== undefined) {
    data.metadata = {
      ...(existing.metadata as any),
      ...(input.metadata as any),
    }
  }

  const card = await db.card.update({ where: { id }, data })
  clearGraphCache(userId)
  return card
}

export const deleteCard: MutationResolvers['deleteCard'] = async ({
  id,
  permanent,
}) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  let card
  if (permanent) {
    card = await db.card.delete({ where: { id } })
  } else {
    card = await db.card.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
  clearGraphCache(userId)
  return card
}

export const archiveCard: MutationResolvers['archiveCard'] = async ({ id }) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  const card = await db.card.update({
    where: { id },
    data: { archivedAt: new Date() },
  })
  clearGraphCache(userId)
  return card
}

export const unarchiveCard: MutationResolvers['unarchiveCard'] = async ({
  id,
}) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  const card = await db.card.update({
    where: { id },
    data: { archivedAt: null },
  })
  clearGraphCache(userId)
  return card
}

export const restoreCard: MutationResolvers['restoreCard'] = async ({ id }) => {
  const userId = context.currentUser!.id
  const existing = await db.card.findFirst({ where: { id, userId } })
  if (!existing) throw new Error('Card not found')

  const card = await db.card.update({
    where: { id },
    data: { deletedAt: null },
  })
  clearGraphCache(userId)
  return card
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

export const reExtractImage: MutationResolvers['reExtractImage'] = async ({
  cardId,
}) => {
  const userId = context.currentUser!.id

  const card = await db.card.findFirst({
    where: { id: cardId, userId, deletedAt: null },
  })
  if (!card) throw new Error('Card not found')

  const metadata = (card.metadata || {}) as Record<string, unknown>

  // Rate limit: max 1 re-extract per card per 24h
  const lastReExtract = metadata.lastReExtractAt as string | undefined
  if (lastReExtract) {
    const elapsed = Date.now() - new Date(lastReExtract).getTime()
    if (elapsed < 24 * 60 * 60 * 1000) {
      return card
    }
  }

  let newImageUrl: string | null = null

  // Strategy 1: Instagram carousel composite
  const images = (metadata.images as string[]) || []
  if (images.length >= 2 && !card.imageUrl) {
    try {
      const buffers = await fetchImageBuffers(images)
      if (buffers.length >= 2) {
        const composite = await createCompositeImage(buffers)
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const path = `cards/${cardId}/composite.jpg`
        const { error: uploadError } = await supabase.storage
          .from('card-media')
          .upload(path, composite, {
            contentType: 'image/jpeg',
            upsert: true,
          })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('card-media')
            .getPublicUrl(path)
          newImageUrl = urlData.publicUrl
        }
      }
    } catch {
      // Composite failed, continue to next strategy
    }
  }

  // Strategy 2: Microlink screenshot for any URL
  if (!newImageUrl && card.url) {
    try {
      const screenshotUrl = buildMicrolinkScreenshotUrl(card.url)
      if (screenshotUrl) {
        const res = await fetch(screenshotUrl, {
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) {
          const contentType = res.headers.get('content-type') || ''
          if (contentType.startsWith('image/')) {
            newImageUrl = screenshotUrl
          }
        }
      }
    } catch {
      // Screenshot failed
    }
  }

  // Update card
  const updatedMetadata = {
    ...metadata,
    lastReExtractAt: new Date().toISOString(),
    reExtractSuccess: !!newImageUrl,
  }

  return db.card.update({
    where: { id: cardId },
    data: {
      ...(newImageUrl ? { imageUrl: newImageUrl } : {}),
      metadata: updatedMetadata,
    },
  })
}
