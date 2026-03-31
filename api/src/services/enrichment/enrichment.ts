import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'
import { Sentry } from 'src/lib/sentry'
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
  getEmbeddingAvailability,
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

function normalizePlatformCandidate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (
    normalized === 'web' ||
    normalized === 'general' ||
    normalized === 'generic' ||
    normalized === 'article'
  ) {
    return 'unknown'
  }

  if (normalized === 'x' || normalized === 'twitter/x') {
    return 'twitter'
  }

  return normalized
}

function resolveEnrichmentPlatform(...candidates: unknown[]): string {
  const normalized = candidates
    .map((candidate) => normalizePlatformCandidate(candidate))
    .filter((candidate): candidate is string => !!candidate)

  const supported = normalized.find((candidate) => toDSPyPlatform(candidate))
  if (supported) {
    return supported
  }

  return normalized.find((candidate) => candidate !== 'unknown') || 'unknown'
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const trimmed = error.message.trim()
    return trimmed || fallback
  }

  return fallback
}

type ScrapedCardData = {
  title?: string
  description?: string
  imageUrl?: string | null
  images?: string[]
  content?: string | null
  author?: string
  authorName?: string
  authorHandle?: string
  authorAvatar?: string
  publishedAt?: string
  domain?: string
  url?: string
  hashtags?: string[]
  mentions?: string[]
  needsMobileScreenshot?: boolean
  engagement?: {
    likes?: number
    retweets?: number
    replies?: number
    views?: number
  }
}

type CardSnapshot = {
  title: string | null
  content: string | null
  imageUrl: string | null
  url: string | null
  metadata?: Record<string, unknown> | null
}

export interface ScrapedCardUpdate {
  content?: string
  title?: string
  imageUrl?: string
  metadata: Record<string, unknown>
  analysisContent: string
  analysisImageUrl: string | null
  imageCount: number
}

function pickText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => pickText(item))
    .filter((item): item is string => !!item)
}

function isGenericTitle(title: string | null): boolean {
  if (!title) {
    return true
  }

  const normalized = title.trim().toLowerCase()
  return normalized === 'link' || normalized === 'saved link' || normalized === 'saved item'
}

function isModuleResolutionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (
      'code' in error
        ? (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
        : /Cannot find module|ERR_MODULE_NOT_FOUND/.test(error.message)
    )
  )
}

async function importScraperModule() {
  try {
    return await import('../../lib/scraper/scraper.js')
  } catch (error) {
    if (!isModuleResolutionError(error)) {
      throw error
    }

    return import('../../lib/scraper/scraper')
  }
}

export function buildScrapedCardUpdate(
  card: CardSnapshot,
  scraped?: ScrapedCardData | null
): ScrapedCardUpdate {
  const currentMetadata = ((card.metadata as Record<string, unknown>) || {})
  const currentTitle = pickText(card.title)
  const currentContent = pickText(card.content)
  const currentImageUrl = pickText(card.imageUrl)
  const currentImages = toStringArray(currentMetadata.images)
  const currentHashtags = toStringArray(currentMetadata.hashtags)
  const currentMentions = toStringArray(currentMetadata.mentions)

  const scrapedTitle = pickText(scraped?.title)
  const scrapedContent = pickText(scraped?.content)
  const scrapedDescription = pickText(scraped?.description)
  const scrapedImageUrl = pickText(scraped?.imageUrl) || pickText(scraped?.images?.[0])
  const scrapedImages = toStringArray(scraped?.images)

  const shouldPromoteTitle =
    !!scrapedTitle && (!currentTitle || isGenericTitle(currentTitle))
  const shouldPromoteImage = !!scrapedImageUrl && !currentImageUrl

  const mergedImages = scrapedImages.length > 0 ? scrapedImages : currentImages
  const imageCount = Math.max(
    typeof currentMetadata.slideCount === 'number' ? currentMetadata.slideCount : 0,
    mergedImages.length,
    scrapedImageUrl ? 1 : 0,
    currentImageUrl ? 1 : 0
  )

  const metadata: Record<string, unknown> = {
    ...currentMetadata,
    scrapedAt: new Date().toISOString(),
    sourceDomain:
      scraped?.domain || (currentMetadata.sourceDomain as string | undefined) || undefined,
    sourceUrl:
      scraped?.url || card.url || (currentMetadata.sourceUrl as string | undefined) || undefined,
    scrapedTitle: scrapedTitle || currentMetadata.scrapedTitle || undefined,
    scrapedDescription: scrapedDescription || currentMetadata.scrapedDescription || undefined,
    scrapedImageUrl: scrapedImageUrl || currentMetadata.scrapedImageUrl || undefined,
    images: mergedImages,
    author: pickText(scraped?.author) || (currentMetadata.author as string | undefined) || undefined,
    authorName:
      pickText(scraped?.authorName) || (currentMetadata.authorName as string | undefined) || undefined,
    authorHandle:
      pickText(scraped?.authorHandle) || (currentMetadata.authorHandle as string | undefined) || undefined,
    authorAvatar:
      pickText(scraped?.authorAvatar) || (currentMetadata.authorAvatar as string | undefined) || undefined,
    publishedAt:
      pickText(scraped?.publishedAt) || (currentMetadata.publishedAt as string | undefined) || undefined,
    hashtags: scraped?.hashtags?.length ? toStringArray(scraped.hashtags) : currentHashtags,
    mentions: scraped?.mentions?.length ? toStringArray(scraped.mentions) : currentMentions,
    engagement: scraped?.engagement || currentMetadata.engagement || undefined,
    needsMobileScreenshot:
      scraped?.needsMobileScreenshot ?? currentMetadata.needsMobileScreenshot ?? undefined,
  }

  const result: ScrapedCardUpdate = {
    metadata,
    analysisContent:
      scrapedContent ||
      scrapedTitle ||
      currentContent ||
      currentTitle ||
      card.url ||
      'Saved item',
    analysisImageUrl: scrapedImageUrl || currentImageUrl || null,
    imageCount,
  }

  if (scrapedContent) {
    result.content = scrapedContent
  }

  if (shouldPromoteTitle) {
    result.title = scrapedTitle || undefined
  }

  if (shouldPromoteImage) {
    result.imageUrl = scrapedImageUrl || undefined
  }

  return result
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
  const graphCardLimit = (() => {
    const raw = process.env.GRAPH_CARD_LIMIT
    if (raw === '0') {
      return undefined
    }

    const parsed = Number.parseInt(raw || '', 10)
    if (!Number.isFinite(parsed)) {
      return 1000
    }

    return Math.min(Math.max(parsed, 50), 5000)
  })()

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
      take: graphCardLimit,
      orderBy: { createdAt: 'desc' },
    })
  } else {
    cards = await db.card.findMany({
      where,
      take: graphCardLimit,
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
    stage: 'queued',
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

    let currentMetadata = (card.metadata as any) || {}

    // Initialize timing tracking
    const platform = detectPlatform(card.url)
    let imageCount = Math.max(
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
    const initialStage = card.url ? 'scraping' : 'analyzing'

    // 2. Set processing state
    await db.card.update({
      where: { id: cardId },
      data: {
        metadata: {
          ...currentMetadata,
          processing: true,
          enrichmentError: undefined,
          enrichmentFailedAt: undefined,
          enrichmentStage: initialStage,
          enrichmentTiming: {
            startedAt: timing.startedAt,
            estimatedTotalMs: timing.estimatedTotalMs,
            platform: timing.platform,
          },
        },
      },
    })

    // 3. Scrape URL when the card is thin or still missing key metadata
    let contentToAnalyze = card.content
    let analysisImageUrl = card.imageUrl
    let scrapeMs = 0

    const shouldScrape =
      !!card.url &&
      (
        !contentToAnalyze ||
        contentToAnalyze.trim().length < 160 ||
        !card.imageUrl ||
        !card.title ||
        isGenericTitle(card.title)
      )

    if (shouldScrape) {
      const scrapeStart = Date.now()
      try {
        const { scrapeUrl } = await importScraperModule()
        const scraped = await scrapeUrl(card.url)
        const scrapedUpdate = buildScrapedCardUpdate(card, scraped)
        contentToAnalyze = scrapedUpdate.analysisContent
        analysisImageUrl = scrapedUpdate.analysisImageUrl
        imageCount = scrapedUpdate.imageCount
        scrapeMs = Date.now() - scrapeStart

        const scrapePatch: Record<string, unknown> = {
          metadata: scrapedUpdate.metadata,
        }

        if (scrapedUpdate.content !== undefined) {
          scrapePatch.content = scrapedUpdate.content
        }
        if (scrapedUpdate.title !== undefined) {
          scrapePatch.title = scrapedUpdate.title
        }
        if (scrapedUpdate.imageUrl !== undefined) {
          scrapePatch.imageUrl = scrapedUpdate.imageUrl
        }

        await db.card.update({
          where: { id: cardId },
          data: scrapePatch,
        })

        card = {
          ...card,
          ...scrapePatch,
        }
        currentMetadata = scrapedUpdate.metadata
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
      analysisImageUrl,
      imageCount
    )
    const classifyMs = Date.now() - classifyStart
    logger.info(
      { cardId, classifyMs, type: classification.type },
      'Classification complete'
    )

    // 6. Try DSPy enrichment for supported platforms
    const detectedPlatform = resolveEnrichmentPlatform(
      classification.platform,
      currentMetadata.platform,
      platform
    )
    const dspyPlatform = toDSPyPlatform(detectedPlatform)

    let finalSummary = classification.summary
    let finalTags: string[] = Array.isArray(classification.tags)
      ? classification.tags
      : []
    let summarySource: 'dspy' | 'glm' | 'fallback' = 'glm'
    let tagsSource: 'dspy' | 'glm' | 'fallback' = 'glm'

    await db.card.update({
      where: { id: cardId },
      data: {
        metadata: {
          ...currentMetadata,
          processing: true,
          enrichmentStage: 'extracting',
          enrichmentTiming: {
            startedAt: timing.startedAt,
            estimatedTotalMs: timing.estimatedTotalMs,
            platform: timing.platform,
            scrapeMs,
            classifyMs,
            stageUpdatedAt: Date.now(),
          },
        },
      },
    })

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
            imageUrl: analysisImageUrl || undefined,
            imageCount,
            contentType: classification.type,
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
    const hadStoredEmbedding = currentMetadata.embeddingStored === true
    const embeddingAvailability = getEmbeddingAvailability()
    let embeddingStored = hadStoredEmbedding
    let embeddingStatus: 'stored' | 'skipped' | 'failed' = hadStoredEmbedding
      ? 'stored'
      : embeddingAvailability.configured
        ? 'failed'
        : 'skipped'
    let embeddingError: string | null = hadStoredEmbedding
      ? null
      : embeddingAvailability.reason
    let vectorBackend =
      currentMetadata.vectorBackend === 'supabase' ||
      currentMetadata.vectorBackend === 'pinecone'
        ? currentMetadata.vectorBackend
        : undefined
    let embeddingProvider =
      typeof currentMetadata.embeddingProvider === 'string'
        ? currentMetadata.embeddingProvider
        : undefined
    let embeddingModel =
      typeof currentMetadata.embeddingModel === 'string'
        ? currentMetadata.embeddingModel
        : undefined

    if (!embeddingAvailability.configured) {
      logger.info(
        { cardId, reason: embeddingAvailability.reason },
        'Embedding skipped: provider unavailable'
      )
    } else {
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
        const provenance = getEmbeddingProvenance()
        embeddingStored = true
        embeddingStatus = 'stored'
        embeddingError = null
        vectorBackend = 'supabase'
        embeddingProvider = provenance.provider || embeddingProvider
        embeddingModel = provenance.model || embeddingModel
        logger.info({ cardId }, 'Embedding stored via pgvector')
      } catch (embErr) {
        embeddingStatus = 'failed'
        embeddingError = getErrorMessage(
          embErr,
          'Embedding generation/storage failed'
        )
        logger.warn(
          { cardId, err: embErr, reason: embeddingError },
          'Embedding generation/storage failed'
        )
      }
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
    const enrichmentSource =
      summarySource === 'dspy' && tagsSource === 'dspy'
        ? 'dspy'
        : summarySource === 'dspy' || tagsSource === 'dspy'
          ? 'mixed'
          : 'glm'

    await db.card.update({
      where: { id: cardId },
      data: {
        metadata: {
          ...currentMetadata,
          processing: true,
          enrichmentStage: 'finalizing',
          enrichmentTiming: {
            startedAt: timing.startedAt,
            estimatedTotalMs: timing.estimatedTotalMs,
            platform: timing.platform,
            scrapeMs,
            classifyMs,
            stageUpdatedAt: Date.now(),
          },
        },
      },
    })

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
          titleSource: finalTitle ? 'glm' : currentMetadata.titleSource || 'scraped',
          embeddingProvider,
          embeddingModel,
          embeddingStored,
          embeddingStatus,
          embeddingError,
          vectorBackend,
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
    Sentry.captureException(error, {
      tags: { service: 'enrichment', cardId },
      extra: { errorMessage, stage: 'pipeline' },
    })

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
      // Use the emitted JS extension so the built ESM bundle resolves cleanly.
      const { captureWithPlaywright } = await import(
        '../../lib/scraper/screenshotPlaywright.js'
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
    const embeddingAvailability = getEmbeddingAvailability()

    if (!embeddingAvailability.configured) {
      logger.info(
        { userId, limit, reason: embeddingAvailability.reason },
        'Embedding backfill skipped: provider unavailable'
      )
      return 0
    }

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
              embeddingStatus: 'stored',
              embeddingError: null,
              embeddingProvider: provenance.provider,
              embeddingModel: provenance.model,
              vectorBackend: 'supabase',
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
        const errorMessage = getErrorMessage(
          err,
          'Failed to backfill embedding'
        )
        const meta = (card.metadata as any) || {}
        await db.card.update({
          where: { id: card.id },
          data: {
            metadata: {
              ...meta,
              embeddingStored: meta.embeddingStored === true,
              embeddingStatus: 'failed',
              embeddingError: errorMessage,
            },
          },
        })
        logger.warn(
          { cardId: card.id, err, reason: errorMessage },
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
