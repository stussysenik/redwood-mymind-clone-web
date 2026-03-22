import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'
import { detectPlatform } from 'src/lib/platforms'
import { createEnrichmentTiming } from 'src/lib/enrichmentTiming'
import { buildEmbeddingText } from 'src/lib/pinecone'
import {
  classifyContent,
  generateFallbackTags,
} from 'src/lib/ai/classificationPipeline'
import {
  generateSummaryWithDSPy,
  generateTagsWithDSPy,
  cleanMovieTitle,
  isMoviePlatform,
  type DSPyPlatform,
} from 'src/lib/ai/dspyClient'
import {
  embedDocument,
  getEmbeddingProvenance,
} from 'src/lib/ai/embeddings'
import { storeEmbedding, matchCards } from 'src/lib/vectorOperations'

// =============================================================================
// CONSTANTS
// =============================================================================

const DSPY_SUPPORTED_PLATFORMS = new Set<DSPyPlatform>([
  'instagram',
  'twitter',
  'reddit',
  'imdb',
  'letterboxd',
  'youtube',
  'amazon',
  'goodreads',
  'storygraph',
  'wikipedia',
])

function toDSPyPlatform(platform: string): DSPyPlatform | null {
  return DSPY_SUPPORTED_PLATFORMS.has(platform as DSPyPlatform)
    ? (platform as DSPyPlatform)
    : null
}

// =============================================================================
// graphData RESOLVER (unchanged)
// =============================================================================

export const graphData: QueryResolvers['graphData'] = async ({
  spaceId,
  tag,
  minWeight = 1,
}) => {
  const userId = context.currentUser!.id

  // Fetch cards for graph
  const where: any = {
    userId,
    deletedAt: null,
    archivedAt: null,
  }

  if (tag) {
    where.tags = { has: tag }
  }

  let cards

  if (spaceId) {
    // Look up space to get its query/tag filter, then fetch matching cards
    const space = await db.space.findFirst({ where: { id: spaceId } })
    if (space?.query) {
      where.tags = { has: space.query }
    }
    cards = await db.card.findMany({
      where,
      take: 200,
      orderBy: { createdAt: 'desc' },
    })
  } else {
    cards = await db.card.findMany({
      where,
      take: 200,
      orderBy: { createdAt: 'desc' },
    })
  }

  // Build graph nodes
  const nodes = cards.map((card) => ({
    id: card.id,
    title: card.title,
    imageUrl: card.imageUrl,
    type: card.type,
    tags: card.tags || [],
    colors: ((card.metadata as any)?.colors as string[]) || [],
    connections: 0,
  }))

  // Build graph links based on shared tags
  const links: {
    source: string
    target: string
    sharedTags: string[]
    weight: number
  }[] = []

  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const sharedTags = (cards[i].tags || []).filter((t) =>
        (cards[j].tags || []).includes(t)
      )

      if (sharedTags.length >= minWeight) {
        links.push({
          source: cards[i].id,
          target: cards[j].id,
          sharedTags,
          weight: sharedTags.length,
        })
      }
    }
  }

  // Count connections per node
  const connectionMap: Record<string, number> = {}
  for (const link of links) {
    connectionMap[link.source] = (connectionMap[link.source] || 0) + 1
    connectionMap[link.target] = (connectionMap[link.target] || 0) + 1
  }

  const nodesWithConnections = nodes.map((n) => ({
    ...n,
    connections: connectionMap[n.id] || 0,
  }))

  return { nodes: nodesWithConnections, links }
}

// =============================================================================
// enrichCard MUTATION
// =============================================================================

export const enrichCard: MutationResolvers['enrichCard'] = async ({
  cardId,
}) => {
  const userId = context.currentUser!.id
  const card = await db.card.findFirst({ where: { id: cardId, userId } })
  if (!card) throw new Error('Card not found')

  // Kick off enrichment pipeline in the background (fire-and-forget)
  enrichCardPipeline(card.id).catch((err) => {
    logger.error({ cardId: card.id, err }, 'Background enrichment failed')
  })

  return {
    success: true,
    cardId,
    stage: 'processing',
    error: null,
  }
}

// =============================================================================
// enrichCardPipeline — full enrichment (exported for fire-and-forget use)
// =============================================================================

export async function enrichCardPipeline(cardId: string): Promise<void> {
  let card: any

  try {
    // 1. Fetch card from DB
    card = await db.card.findUnique({ where: { id: cardId } })
    if (!card) {
      logger.warn({ cardId }, 'enrichCardPipeline: card not found')
      return
    }

    const currentMetadata = (card.metadata as any) || {}

    // Initialize timing tracking
    const platform = detectPlatform(card.url)
    const imageCount = Math.max(
      currentMetadata.slideCount || 0,
      currentMetadata.images?.length || 0,
      card.imageUrl ? 1 : 0
    )
    const contentLength =
      (card.content?.length || 0) + (card.title?.length || 0)
    const timing = createEnrichmentTiming(
      platform,
      contentLength,
      !!card.imageUrl,
      imageCount
    )

    // 2. Set processing state
    await db.card.update({
      where: { id: cardId },
      data: {
        metadata: {
          ...currentMetadata,
          processing: true,
          enrichmentError: undefined,
          enrichmentFailedAt: undefined,
          enrichmentStage: 'scraping',
          enrichmentTiming: {
            startedAt: timing.startedAt,
            estimatedTotalMs: timing.estimatedTotalMs,
            platform: timing.platform,
          },
        },
      },
    })

    // 3. Scrape URL if content is missing
    let contentToAnalyze = card.content
    let scrapeMs = 0

    if (!contentToAnalyze && card.url) {
      const scrapeStart = Date.now()
      try {
        // Dynamic import — scraper module may not exist yet
        const { scrapeUrl } = await import('src/lib/scraper/scraper')
        const scraped = await scrapeUrl(card.url)
        contentToAnalyze = scraped.content
        scrapeMs = Date.now() - scrapeStart

        if (contentToAnalyze) {
          await db.card.update({
            where: { id: cardId },
            data: {
              content: contentToAnalyze,
              ...(scraped.title &&
              (!card.title || card.title === 'Link')
                ? { title: scraped.title }
                : {}),
              ...(!card.imageUrl && scraped.imageUrl
                ? { imageUrl: scraped.imageUrl }
                : {}),
            },
          })
        }
      } catch (scrapeErr) {
        logger.warn(
          { cardId, err: scrapeErr },
          'Scrape failed, continuing with existing content'
        )
        scrapeMs = Date.now() - scrapeStart
        // Fall back to whatever we have
        contentToAnalyze =
          card.title || card.content || card.url || 'Saved link'
      }
    }

    // If still no content, use whatever text we have
    if (!contentToAnalyze) {
      contentToAnalyze = card.title || card.url || 'Saved item'
    }

    // 4. Update stage to analyzing
    await db.card.update({
      where: { id: cardId },
      data: {
        metadata: {
          ...currentMetadata,
          processing: true,
          enrichmentStage: 'analyzing',
          enrichmentTiming: {
            startedAt: timing.startedAt,
            estimatedTotalMs: timing.estimatedTotalMs,
            platform: timing.platform,
            stageUpdatedAt: Date.now(),
          },
        },
      },
    })

    // 5. Run AI classification
    const classifyStart = Date.now()
    const classification = await classifyContent(
      card.url,
      contentToAnalyze,
      card.imageUrl,
      imageCount
    )
    const classifyMs = Date.now() - classifyStart
    logger.info(
      { cardId, classifyMs, type: classification.type },
      'Classification complete'
    )

    // 6. Try DSPy enrichment for supported platforms
    const detectedPlatform = (
      classification.platform ||
      currentMetadata.platform ||
      platform
    ).toLowerCase()
    const dspyPlatform = toDSPyPlatform(detectedPlatform)

    let finalSummary = classification.summary
    let finalTags: string[] = Array.isArray(classification.tags)
      ? classification.tags
      : []
    let summarySource: 'dspy' | 'glm' | 'fallback' = 'glm'
    let tagsSource: 'dspy' | 'glm' | 'fallback' = 'glm'

    if (dspyPlatform && contentToAnalyze) {
      try {
        const [dspySummary, dspyTags] = await Promise.all([
          generateSummaryWithDSPy(contentToAnalyze, dspyPlatform, {
            author:
              currentMetadata.authorHandle || currentMetadata.authorName,
            title: classification.title,
            imageCount,
          }),
          generateTagsWithDSPy(contentToAnalyze, dspyPlatform, {
            title: classification.title,
            imageUrl: card.imageUrl || undefined,
            imageCount,
          }),
        ])

        if (dspySummary.isAnalytical && dspySummary.qualityScore > 0.6) {
          finalSummary = dspySummary.summary
          summarySource = 'dspy'
        }

        if (dspyTags.confidence > 0.5 && dspyTags.tags.length > 0) {
          finalTags = dspyTags.tags
          tagsSource = 'dspy'
        }
      } catch (dspyErr) {
        logger.warn({ cardId, err: dspyErr }, 'DSPy enhancement failed')
      }
    }

    // 7. Generate embedding and store it
    let embeddingStored = false
    try {
      const embeddingText = buildEmbeddingText({
        title: classification.title,
        tags: finalTags,
        metadata: {
          summary: finalSummary,
          author:
            currentMetadata.authorName ||
            currentMetadata.authorHandle ||
            currentMetadata.author,
          platform: detectedPlatform,
        },
      })

      const vector = await embedDocument(embeddingText)
      await storeEmbedding(cardId, vector)
      embeddingStored = true
      logger.info({ cardId }, 'Embedding stored via pgvector')
    } catch (embErr) {
      logger.warn({ cardId, err: embErr }, 'Embedding generation/storage failed')
    }

    // 8. Determine final title
    const shouldUpdateTitle = !currentMetadata.titleEditedAt
    let finalTitle: string | undefined

    if (shouldUpdateTitle) {
      const platformsWithExplicitTitles = [
        'youtube',
        'reddit',
        'article',
        'letterboxd',
        'imdb',
        'goodreads',
        'amazon',
        'storygraph',
      ]
      const hasExplicitTitle = platformsWithExplicitTitles.includes(
        detectedPlatform.toLowerCase()
      )
      const existingTitleIsGood =
        card.title && card.title !== 'Link' && card.title.length > 3

      if (hasExplicitTitle && existingTitleIsGood) {
        if (isMoviePlatform(detectedPlatform) && card.title) {
          const cleaned = cleanMovieTitle(card.title)
          finalTitle = cleaned.title
        }
        // else keep existing title (don't set finalTitle)
      } else {
        finalTitle = classification.title
      }
    }

    // 9. Merge tags
    const currentTags = Array.isArray(card.tags) ? card.tags : []
    const mergedTags = Array.from(new Set([...currentTags, ...finalTags]))

    // 10. Calculate total timing
    const totalMs = Date.now() - timing.startedAt
    const embeddingProvenance = getEmbeddingProvenance()

    const enrichmentSource =
      summarySource === 'dspy' && tagsSource === 'dspy'
        ? 'dspy'
        : summarySource === 'dspy' || tagsSource === 'dspy'
          ? 'mixed'
          : 'glm'

    // 11. Final update with all enriched data
    await db.card.update({
      where: { id: cardId },
      data: {
        type: classification.type,
        ...(finalTitle ? { title: finalTitle } : {}),
        tags: mergedTags,
        metadata: {
          ...currentMetadata,
          summary: currentMetadata.summaryEditedAt
            ? currentMetadata.summary
            : finalSummary,
          platform:
            classification.platform || currentMetadata.platform,
          processing: false,
          enrichmentError: null,
          enrichmentFailedAt: null,
          enrichmentStage: 'complete',
          enrichmentSource,
          tagsSource,
          summarySource,
          titleSource: finalTitle ? 'ai' : currentMetadata.titleSource || 'scraped',
          embeddingProvider: embeddingProvenance.provider || currentMetadata.embeddingProvider,
          embeddingModel: embeddingProvenance.model || currentMetadata.embeddingModel,
          embeddingStored,
          enrichedAt: new Date().toISOString(),
          enrichmentTiming: {
            startedAt: timing.startedAt,
            estimatedTotalMs: timing.estimatedTotalMs,
            platform: timing.platform,
            scrapeMs,
            classifyMs,
            totalMs,
            completedAt: Date.now(),
          },
        },
      },
    })

    logger.info(
      { cardId, totalMs, scrapeMs, classifyMs, enrichmentSource },
      'Enrichment pipeline complete'
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown enrichment error'
    logger.error(
      { cardId, err: error },
      `Enrichment pipeline failed: ${errorMessage}`
    )

    // Apply fallback tags so the card never gets stuck
    try {
      const fallbackCard = card || (await db.card.findUnique({ where: { id: cardId } }))
      if (fallbackCard) {
        const fallback = generateFallbackTags(
          fallbackCard.url || null,
          fallbackCard.content || null,
          fallbackCard.title || null,
          fallbackCard.imageUrl || null
        )

        const existingTags = Array.isArray(fallbackCard.tags)
          ? fallbackCard.tags
          : []
        const mergedTags = Array.from(
          new Set([...existingTags, ...fallback.tags])
        )

        await db.card.update({
          where: { id: cardId },
          data: {
            tags: mergedTags,
            type: fallback.type,
            metadata: {
              ...((fallbackCard.metadata as any) || {}),
              summary:
                (fallbackCard.metadata as any)?.summary || fallback.summary,
              processing: false,
              enrichmentStage: 'failed',
              enrichmentError: errorMessage,
              enrichmentFailedAt: new Date().toISOString(),
              tagsSource: 'fallback',
              enrichedAt: new Date().toISOString(),
            },
          },
        })

        logger.info(
          { cardId, tags: fallback.tags },
          'Fallback tags applied after enrichment failure'
        )
      }
    } catch (updateErr) {
      // Last resort: clear processing flag so card doesn't stay stuck
      logger.error(
        { cardId, err: updateErr },
        'Fallback tag application also failed'
      )
      try {
        await db.card.update({
          where: { id: cardId },
          data: {
            metadata: {
              processing: false,
              enrichmentStage: 'failed',
              enrichmentError: errorMessage,
              enrichmentFailedAt: new Date().toISOString(),
            },
          },
        })
      } catch {
        /* truly nothing left to do */
      }
    }
  }
}

// =============================================================================
// captureScreenshot MUTATION
// =============================================================================

export const captureScreenshot: MutationResolvers['captureScreenshot'] =
  async ({ url }) => {
    try {
      // Dynamic import — module may not exist yet
      const { captureWithPlaywright } = await import(
        'src/lib/scraper/screenshotPlaywright'
      )
      const result = await captureWithPlaywright(url)

      return {
        success: result.success,
        url: result.screenshotUrl || null,
        source: result.source || 'playwright',
        platform: result.platform || null,
        error: result.error || null,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Screenshot capture failed'
      logger.error({ url, err: error }, 'captureScreenshot failed')

      return {
        success: false,
        url: null,
        source: null,
        platform: null,
        error: errorMessage,
      }
    }
  }

// =============================================================================
// backfillEmbeddings MUTATION
// =============================================================================

export const backfillEmbeddings: MutationResolvers['backfillEmbeddings'] =
  async ({ limit = 100 }) => {
    const userId = context.currentUser!.id

    // Find cards without embeddings (no embeddingStored flag or old ones)
    const cards = await db.card.findMany({
      where: {
        userId,
        deletedAt: null,
        // Cards that either have no enrichment or have no embedding stored
        OR: [
          {
            metadata: {
              path: ['embeddingStored'],
              equals: false,
            },
          },
          {
            metadata: {
              path: ['embeddingStored'],
              equals: null as any,
            },
          },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })

    let processed = 0

    for (const card of cards) {
      try {
        const meta = (card.metadata as any) || {}
        const embeddingText = buildEmbeddingText({
          title: card.title,
          content: card.content,
          tags: card.tags,
          metadata: {
            summary: meta.summary,
            author: meta.authorName || meta.authorHandle || meta.author,
            platform: meta.platform,
            objects: meta.objects,
            ocrText: meta.ocrText,
            visualElements: meta.visualElements,
            texture: meta.texture,
            composition: meta.composition,
            colors: meta.colors,
            paletteType: meta.paletteType,
          },
        })

        if (!embeddingText || embeddingText.length < 5) continue

        const vector = await embedDocument(embeddingText)
        await storeEmbedding(card.id, vector)

        // Mark embedding as stored
        const provenance = getEmbeddingProvenance()
        await db.card.update({
          where: { id: card.id },
          data: {
            metadata: {
              ...meta,
              embeddingStored: true,
              embeddingProvider: provenance.provider,
              embeddingModel: provenance.model,
              embeddingBackfilledAt: new Date().toISOString(),
            },
          },
        })

        processed++
        logger.info(
          { cardId: card.id, processed },
          'Backfilled embedding'
        )
      } catch (err) {
        logger.warn(
          { cardId: card.id, err },
          'Failed to backfill embedding for card'
        )
      }
    }

    logger.info(
      { total: cards.length, processed },
      'Embedding backfill complete'
    )
    return processed
  }
