import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'
import { Sentry } from 'src/lib/sentry'
import { detectPlatform } from 'src/lib/platforms'
import { createEnrichmentTiming } from 'src/lib/enrichmentTiming'
import { buildEmbeddingText } from 'src/lib/pinecone'
import { buildMicrolinkScreenshotUrl } from 'src/lib/scraper/fallbackPreview'
import {
  classifyContent,
  generateFallbackTags,
} from 'src/lib/ai/classificationPipeline'
import {
  normalizeTag,
  normalizeTagList,
  sanitizeGeneratedTags,
  stripGeneratedTagNoise,
} from 'src/lib/semantic'
import {
  extractTitleWithDSPy,
  generateSummaryWithDSPy,
  generateTagsWithDSPy,
  cleanMovieTitle,
  isMoviePlatform,
  type DSPyPlatform,
} from 'src/lib/ai/dspyClient'
import {
  embedDocument,
  getEmbeddingAvailability,
  getEmbeddingCompatibility,
  getEmbeddingProvenance,
} from 'src/lib/ai/embeddings'
import { extractStoredLocalClassification } from 'src/lib/ai/localClassification'
import {
  buildHeuristicSourceTitle,
  isWeakTitle,
  pickBestTitleCandidate,
  toPersistedTitleSource,
} from 'src/lib/ai/titleOptimization'
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
  mediaTypes?: Array<'image' | 'video'>
  videoPositions?: number[]
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
  previewSource?:
    | 'instagram-api'
    | 'twitter-api'
    | 'scraper'
    | 'playwright'
    | 'microlink'
    | 'user-upload'
    | 'unknown'
  previewAspectRatio?: string
  engagement?: {
    likes?: number
    retweets?: number
    replies?: number
    views?: number
  }
  sourcePayloadBytes?: number
  sourcePayloadKind?: 'html' | 'rendered-html' | 'api-json' | 'text'
  sourceTextBytes?: number
  sourceTextKind?:
    | 'api-text'
    | 'compressed-visible-html'
    | 'rendered-visible-html'
    | 'browser-acquired-text'
  sourceTextCoverageTarget?: number
  sourceEvidenceKinds?: string[]
  blockerSignals?: string[]
  renderedNetworkResponseCount?: number
  renderedNetworkTextBytes?: number
  recoverySource?: 'rendered-html' | 'aggressive-browser'
  recoveryReason?: string
  aggressiveRecoveryAttempted?: boolean
  aggressiveRecoveryReason?: string
  aggressiveRecoveryApplied?: boolean
}

type CardSnapshot = {
  title: string | null
  content: string | null
  imageUrl: string | null
  url: string | null
  metadata?: Record<string, unknown> | null
}

const REPAIRABLE_AI_TAG_SOURCES = new Set([
  'dspy',
  'glm',
  'fallback',
  'kimi',
  'glm-content',
  'local-ai',
  'rule-based',
])

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

type GeneratedTagOptions = Parameters<typeof sanitizeGeneratedTags>[1]

function buildGeneratedTagOptions(args: {
  contentType: string
  platform: string
  url: string | null | undefined
  metadata: Record<string, unknown>
}): GeneratedTagOptions {
  return {
    contentType: args.contentType as Parameters<
      typeof sanitizeGeneratedTags
    >[1]['contentType'],
    platform: args.platform,
    url: args.url || null,
    authorHandle:
      pickText(args.metadata.authorHandle) ||
      pickText(args.metadata.author) ||
      null,
    authorName: pickText(args.metadata.authorName) || null,
  }
}

export function mergeGeneratedCardTags(args: {
  currentTags: string[]
  nextTags: string[]
  metadata: Record<string, unknown>
  contentType: string
  platform: string
  url: string | null | undefined
}): string[] {
  const generatedTagOptions = buildGeneratedTagOptions({
    contentType: args.contentType,
    platform: args.platform,
    url: args.url,
    metadata: args.metadata,
  })
  const currentSource = pickText(args.metadata.tagsSource)
  const existingTags = REPAIRABLE_AI_TAG_SOURCES.has(currentSource || '')
    ? sanitizeGeneratedTags(args.currentTags, generatedTagOptions)
    : normalizeTagList(args.currentTags)
  const nextTags = normalizeTagList(args.nextTags)

  return Array.from(new Set([...existingTags, ...nextTags]))
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => pickText(item))
    .filter((item): item is string => !!item)
}

function toMediaTypeArray(value: unknown): Array<'image' | 'video'> {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (item): item is 'image' | 'video' => item === 'image' || item === 'video'
  )
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (item): item is number => typeof item === 'number' && Number.isFinite(item)
  )
}

function textByteLength(value: string | null): number {
  return value ? Buffer.byteLength(value, 'utf8') : 0
}

function uniqueTextByteLength(values: Array<string | null | undefined>): number {
  const uniqueValues = Array.from(
    new Set(
      values
        .map((value) => pickText(value))
        .filter((value): value is string => !!value)
    )
  )

  return uniqueValues.reduce((total, value) => total + textByteLength(value), 0)
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function resolveSavedPreviewKind(
  previewSource: string | null,
  currentImageUrl: string | null,
  scrapedImageUrl: string | null
): 'source-media' | 'fallback-screenshot' | 'existing-card-image' | 'none' {
  if (previewSource === 'microlink' || previewSource === 'playwright') {
    return 'fallback-screenshot'
  }

  if (previewSource) {
    return 'source-media'
  }

  if (!currentImageUrl && scrapedImageUrl) {
    return 'source-media'
  }

  if (currentImageUrl) {
    return 'existing-card-image'
  }

  return 'none'
}

function isGenericTitle(title: string | null): boolean {
  if (!title) {
    return true
  }

  const normalized = title.trim().toLowerCase()
  return (
    normalized === 'link' ||
    normalized === 'saved link' ||
    normalized === 'saved item'
  )
}

function getExtractionMetrics(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (
    metadata?.extractionMetrics &&
    typeof metadata.extractionMetrics === 'object' &&
    !Array.isArray(metadata.extractionMetrics)
  ) {
    return metadata.extractionMetrics as Record<string, unknown>
  }

  return {}
}

export function shouldEscalateScrapeAcquisition(args: {
  card: CardSnapshot
  update: ScrapedCardUpdate
}): string | null {
  const extractionMetrics = getExtractionMetrics(args.update.metadata)
  const blockerSignals = toStringArray(extractionMetrics.blockerSignals)
  const sourceEvidenceKinds = toStringArray(extractionMetrics.sourceEvidenceKinds)
  const coverageTargetMet = pickBoolean(extractionMetrics.coverageTargetMet)

  if (pickBoolean(extractionMetrics.aggressiveRecoveryAttempted)) {
    return null
  }

  if (
    blockerSignals.length > 0 &&
    (!sourceEvidenceKinds.includes('rendered-network') ||
      coverageTargetMet === false ||
      args.update.analysisContent.trim().length < 240)
  ) {
    return 'blocker-signals'
  }

  if (coverageTargetMet === false) {
    return 'low-coverage'
  }

  const candidateTitle =
    pickText(args.update.title) ||
    pickText(args.update.metadata.scrapedTitle) ||
    pickText(args.card.title)

  if (isGenericTitle(candidateTitle) || args.update.analysisContent.trim().length < 160) {
    return 'weak-analysis-content'
  }

  return null
}

export function isScrapedUpdateMateriallyBetter(
  candidate: ScrapedCardUpdate,
  baseline: ScrapedCardUpdate
): boolean {
  const candidateMetrics = getExtractionMetrics(candidate.metadata)
  const baselineMetrics = getExtractionMetrics(baseline.metadata)
  const candidateCoverage = pickNumber(candidateMetrics.textCoverageRatio) || 0
  const baselineCoverage = pickNumber(baselineMetrics.textCoverageRatio) || 0
  const candidateBlockers = toStringArray(candidateMetrics.blockerSignals).length
  const baselineBlockers = toStringArray(baselineMetrics.blockerSignals).length
  const candidateTitle =
    pickText(candidate.title) || pickText(candidate.metadata.scrapedTitle)
  const baselineTitle =
    pickText(baseline.title) || pickText(baseline.metadata.scrapedTitle)

  return (
    candidateCoverage > baselineCoverage + 0.05 ||
    candidateBlockers < baselineBlockers ||
    (isGenericTitle(baselineTitle) && !isGenericTitle(candidateTitle)) ||
    (!baseline.analysisImageUrl && !!candidate.analysisImageUrl)
  )
}

export function annotateAggressiveRecoveryMetrics(
  update: ScrapedCardUpdate,
  args: {
    attempted: boolean
    reason?: string | null
    applied: boolean
  }
): ScrapedCardUpdate {
  if (!args.attempted) {
    return update
  }

  const currentExtractionMetrics = getExtractionMetrics(update.metadata)

  return {
    ...update,
    metadata: {
      ...update.metadata,
      extractionMetrics: {
        ...currentExtractionMetrics,
        aggressiveRecoveryAttempted: true,
        aggressiveRecoveryReason:
          args.reason || pickText(currentExtractionMetrics.aggressiveRecoveryReason),
        aggressiveRecoveryApplied: args.applied,
      },
    },
  }
}

function isModuleResolutionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ('code' in error
      ? (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
      : /Cannot find module|ERR_MODULE_NOT_FOUND/.test(error.message))
  )
}

async function importScraperModule() {
  try {
    return await import('../../lib/scraper/scraper.js')
  } catch (error) {
    if (!isModuleResolutionError(error)) {
      throw error
    }

    return import('../../lib/scraper/' + 'scraper')
  }
}

export function buildScrapedCardUpdate(
  card: CardSnapshot,
  scraped?: ScrapedCardData | null
): ScrapedCardUpdate {
  const currentMetadata = (card.metadata as Record<string, unknown>) || {}
  const currentExtractionMetrics = getExtractionMetrics(currentMetadata)
  const currentTitle = pickText(card.title)
  const currentContent = pickText(card.content)
  const currentImageUrl = pickText(card.imageUrl)
  const currentImages = toStringArray(currentMetadata.images)
  const currentMediaTypes = toMediaTypeArray(currentMetadata.mediaTypes)
  const currentVideoPositions = toNumberArray(currentMetadata.videoPositions)
  const currentHashtags = toStringArray(currentMetadata.hashtags)
  const currentMentions = toStringArray(currentMetadata.mentions)

  const scrapedTitle = pickText(scraped?.title)
  const scrapedContent = pickText(scraped?.content)
  const scrapedDescription = pickText(scraped?.description)
  const directScrapedImageUrl =
    pickText(scraped?.imageUrl) || pickText(scraped?.images?.[0])
  const scrapedImages = toStringArray(scraped?.images)
  const scrapedMediaTypes = toMediaTypeArray(scraped?.mediaTypes)
  const scrapedVideoPositions = toNumberArray(scraped?.videoPositions)
  const fallbackPreviewUrl =
    !directScrapedImageUrl && !currentImageUrl
      ? buildMicrolinkScreenshotUrl(scraped?.url || card.url)
      : null
  const scrapedImageUrl = directScrapedImageUrl || fallbackPreviewUrl
  const extractedTitleBytes = textByteLength(scrapedTitle)
  const extractedDescriptionBytes = textByteLength(scrapedDescription)
  const extractedContentBytes = textByteLength(scrapedContent)
  const uniqueExtractedTextBytes = uniqueTextByteLength([
    scrapedTitle,
    scrapedDescription,
    scrapedContent,
  ])
  const sourcePayloadBytes =
    pickNumber(scraped?.sourcePayloadBytes) ??
    pickNumber(currentExtractionMetrics.sourcePayloadBytes)
  const sourceTextBytes =
    pickNumber(scraped?.sourceTextBytes) ??
    pickNumber(currentExtractionMetrics.sourceTextBytes)
  const sourceTextCoverageTarget =
    pickNumber(scraped?.sourceTextCoverageTarget) ??
    pickNumber(currentExtractionMetrics.sourceTextCoverageTarget) ??
    0.8
  const sourcePayloadKind =
    pickText(scraped?.sourcePayloadKind) ||
    pickText(currentExtractionMetrics.sourcePayloadKind)
  const sourceTextKind =
    pickText(scraped?.sourceTextKind) ||
    pickText(currentExtractionMetrics.sourceTextKind)
  const sourceEvidenceKinds =
    toStringArray(scraped?.sourceEvidenceKinds).length > 0
      ? toStringArray(scraped?.sourceEvidenceKinds)
      : toStringArray(currentExtractionMetrics.sourceEvidenceKinds)
  const blockerSignals =
    toStringArray(scraped?.blockerSignals).length > 0
      ? toStringArray(scraped?.blockerSignals)
      : toStringArray(currentExtractionMetrics.blockerSignals)
  const renderedNetworkResponseCount =
    pickNumber(scraped?.renderedNetworkResponseCount) ??
    pickNumber(currentExtractionMetrics.renderedNetworkResponseCount)
  const renderedNetworkTextBytes =
    pickNumber(scraped?.renderedNetworkTextBytes) ??
    pickNumber(currentExtractionMetrics.renderedNetworkTextBytes)
  const aggressiveRecoveryAttempted =
    pickBoolean(scraped?.aggressiveRecoveryAttempted) ??
    pickBoolean(currentExtractionMetrics.aggressiveRecoveryAttempted)
  const aggressiveRecoveryReason =
    pickText(scraped?.aggressiveRecoveryReason) ||
    pickText(currentExtractionMetrics.aggressiveRecoveryReason)
  const aggressiveRecoveryApplied =
    pickBoolean(scraped?.aggressiveRecoveryApplied) ??
    pickBoolean(currentExtractionMetrics.aggressiveRecoveryApplied)
  const coverageDenominatorBytes = sourceTextBytes ?? sourcePayloadBytes
  const textCoverageRatio =
    coverageDenominatorBytes && uniqueExtractedTextBytes > 0
      ? Number((uniqueExtractedTextBytes / coverageDenominatorBytes).toFixed(4))
      : undefined
  const payloadTextDensityRatio =
    sourcePayloadBytes && uniqueExtractedTextBytes > 0
      ? Number((uniqueExtractedTextBytes / sourcePayloadBytes).toFixed(4))
      : undefined
  const coverageTargetMet =
    typeof textCoverageRatio === 'number'
      ? textCoverageRatio >= sourceTextCoverageTarget
      : undefined

  const shouldPromoteTitle =
    !!scrapedTitle && (!currentTitle || isGenericTitle(currentTitle))
  const shouldPromoteImage = !!scrapedImageUrl && !currentImageUrl

  const mergedImages = scrapedImages.length > 0 ? scrapedImages : currentImages
  const mergedMediaTypes =
    scrapedMediaTypes.length > 0 ? scrapedMediaTypes : currentMediaTypes
  const mergedVideoPositions =
    scrapedVideoPositions.length > 0
      ? scrapedVideoPositions
      : currentVideoPositions
  const imageCount = Math.max(
    typeof currentMetadata.slideCount === 'number'
      ? currentMetadata.slideCount
      : 0,
    mergedImages.length,
    mergedMediaTypes.length,
    scrapedImageUrl ? 1 : 0,
    currentImageUrl ? 1 : 0
  )

  const metadata: Record<string, unknown> = {
    ...currentMetadata,
    scrapedAt: new Date().toISOString(),
    sourceDomain:
      scraped?.domain ||
      (currentMetadata.sourceDomain as string | undefined) ||
      undefined,
    sourceUrl:
      scraped?.url ||
      card.url ||
      (currentMetadata.sourceUrl as string | undefined) ||
      undefined,
    scrapedTitle: scrapedTitle || currentMetadata.scrapedTitle || undefined,
    scrapedDescription:
      scrapedDescription || currentMetadata.scrapedDescription || undefined,
    scrapedImageUrl:
      scrapedImageUrl || currentMetadata.scrapedImageUrl || undefined,
    images: mergedImages,
    mediaTypes: mergedMediaTypes,
    videoPositions: mergedVideoPositions,
    isCarousel:
      mergedImages.length > 1
        ? true
        : (currentMetadata.isCarousel as boolean | undefined) || undefined,
    slideCount: imageCount || undefined,
    carouselExtracted:
      mergedImages.length > 1
        ? true
        : (currentMetadata.carouselExtracted as boolean | undefined) ||
          undefined,
    carouselExtractedAt:
      mergedImages.length > 1
        ? new Date().toISOString()
        : (currentMetadata.carouselExtractedAt as string | undefined) ||
          undefined,
    author:
      pickText(scraped?.author) ||
      (currentMetadata.author as string | undefined) ||
      undefined,
    authorName:
      pickText(scraped?.authorName) ||
      (currentMetadata.authorName as string | undefined) ||
      undefined,
    authorHandle:
      pickText(scraped?.authorHandle) ||
      (currentMetadata.authorHandle as string | undefined) ||
      undefined,
    authorAvatar:
      pickText(scraped?.authorAvatar) ||
      (currentMetadata.authorAvatar as string | undefined) ||
      undefined,
    publishedAt:
      pickText(scraped?.publishedAt) ||
      (currentMetadata.publishedAt as string | undefined) ||
      undefined,
    hashtags: scraped?.hashtags?.length
      ? toStringArray(scraped.hashtags)
      : currentHashtags,
    mentions: scraped?.mentions?.length
      ? toStringArray(scraped.mentions)
      : currentMentions,
    engagement: scraped?.engagement || currentMetadata.engagement || undefined,
    previewSource:
      scraped?.previewSource ||
      (fallbackPreviewUrl ? 'microlink' : undefined) ||
      (currentMetadata.previewSource as string | undefined) ||
      undefined,
    previewAspectRatio:
      pickText(scraped?.previewAspectRatio) ||
      (currentMetadata.previewAspectRatio as string | undefined) ||
      undefined,
    needsMobileScreenshot:
      scraped?.needsMobileScreenshot ??
      currentMetadata.needsMobileScreenshot ??
      undefined,
    extractionMetrics: {
      sourceDomain:
        scraped?.domain ||
        (currentMetadata.sourceDomain as string | undefined) ||
        undefined,
      sourceUrl:
        scraped?.url ||
        card.url ||
        (currentMetadata.sourceUrl as string | undefined) ||
        undefined,
      extractedTextBytes: {
        title: extractedTitleBytes,
        description: extractedDescriptionBytes,
        content: extractedContentBytes,
        total:
          extractedTitleBytes +
          extractedDescriptionBytes +
          extractedContentBytes,
        uniqueTotal: uniqueExtractedTextBytes,
      },
      sourcePayloadBytes,
      sourcePayloadKind,
      sourceTextBytes,
      sourceTextKind,
      sourceEvidenceKinds:
        sourceEvidenceKinds.length > 0 ? sourceEvidenceKinds : undefined,
      blockerSignals: blockerSignals.length > 0 ? blockerSignals : undefined,
      renderedNetworkResponseCount,
      renderedNetworkTextBytes,
      textCoverageRatio,
      payloadTextDensityRatio,
      sourceTextCoverageTarget,
      coverageTargetMet,
      extractedImageCount:
        mergedImages.length || (scrapedImageUrl || currentImageUrl ? 1 : 0),
      hashtagCount: scraped?.hashtags?.length || 0,
      mentionCount: scraped?.mentions?.length || 0,
      recoverySource:
        pickText(scraped?.recoverySource) ||
        pickText(currentExtractionMetrics.recoverySource),
      recoveryReason:
        pickText(scraped?.recoveryReason) ||
        pickText(currentExtractionMetrics.recoveryReason),
      aggressiveRecoveryAttempted,
      aggressiveRecoveryReason,
      aggressiveRecoveryApplied,
      savedPreviewSource:
        pickText(scraped?.previewSource) ||
        (fallbackPreviewUrl ? 'microlink' : null) ||
        pickText(currentMetadata.previewSource),
      savedPreviewKind: resolveSavedPreviewKind(
        pickText(scraped?.previewSource) ||
          (fallbackPreviewUrl ? 'microlink' : null) ||
          pickText(currentMetadata.previewSource),
        currentImageUrl,
        scrapedImageUrl
      ),
    },
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
// =============================================================================
// graphData LRU CACHE
// In-process cache keyed on (userId, spaceId, tag, minWeight).
// Max 50 entries, 120 s TTL. Invalidated on card mutations via clearGraphCache.
// =============================================================================

interface GraphDataResult {
  nodes: {
    id: string
    title: string | null
    imageUrl: string | null
    type: string
    tags: string[]
    colors: string[]
    connections: number
  }[]
  links: {
    source: string
    target: string
    sharedTags: string[]
    weight: number
  }[]
}

interface CacheEntry {
  value: GraphDataResult
  expiresAt: number
}

const GRAPH_CACHE_TTL_MS = 120_000
const GRAPH_CACHE_MAX = 50

// Hard ceiling on the enrichment pipeline. If scrape/classify/DSPy hangs for
// longer than this, the pipeline throws and the fallback catch flips the card
// to `processing: false` so the UI never stays stuck on "retrieving tags".
const ENRICHMENT_PIPELINE_TIMEOUT_MS = 3 * 60 * 1000

const _graphCache = new Map<string, CacheEntry>()
const _graphCacheOrder: string[] = []

function _graphCacheKey(
  userId: string,
  spaceId: string | null | undefined,
  tag: string | null | undefined,
  minWeight: number
): string {
  return `${userId}:${spaceId ?? ''}:${tag ?? ''}:${minWeight}`
}

function _graphCacheGet(key: string): GraphDataResult | null {
  const entry = _graphCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    _graphCache.delete(key)
    const idx = _graphCacheOrder.indexOf(key)
    if (idx !== -1) _graphCacheOrder.splice(idx, 1)
    return null
  }
  // Move to end (most recently used)
  const idx = _graphCacheOrder.indexOf(key)
  if (idx !== -1) _graphCacheOrder.splice(idx, 1)
  _graphCacheOrder.push(key)
  return entry.value
}

function _graphCacheSet(key: string, value: GraphDataResult): void {
  if (_graphCache.has(key)) {
    const idx = _graphCacheOrder.indexOf(key)
    if (idx !== -1) _graphCacheOrder.splice(idx, 1)
  } else if (_graphCache.size >= GRAPH_CACHE_MAX) {
    // Evict LRU
    const lru = _graphCacheOrder.shift()
    if (lru) _graphCache.delete(lru)
  }
  _graphCache.set(key, { value, expiresAt: Date.now() + GRAPH_CACHE_TTL_MS })
  _graphCacheOrder.push(key)
}

/** Invalidate all cached graph results for a user. Call after any card mutation. */
export function clearGraphCache(userId: string): void {
  const prefix = `${userId}:`
  for (const key of [..._graphCache.keys()]) {
    if (key.startsWith(prefix)) {
      _graphCache.delete(key)
      const idx = _graphCacheOrder.indexOf(key)
      if (idx !== -1) _graphCacheOrder.splice(idx, 1)
    }
  }
}

// =============================================================================
// graphData RESOLVER
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

  // Return cached result if available
  const cacheKey = _graphCacheKey(userId, spaceId, tag, minWeight)
  const cached = _graphCacheGet(cacheKey)
  if (cached) return cached

  // Fetch cards for graph
  const where: any = {
    userId,
    deletedAt: null,
    archivedAt: null,
  }

  if (tag) {
    const normalizedTag = normalizeTag(tag.replace(/^#+/, ''))
    if (normalizedTag) {
      where.tags = { has: normalizedTag }
    }
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

  const cardsWithVisibleTags = cards.map((card) => {
    const metadata = ((card.metadata as Record<string, unknown> | null) ||
      {}) as Record<string, unknown>
    const visibleTags = stripGeneratedTagNoise(card.tags || [], {
      ...buildGeneratedTagOptions({
        contentType: card.type,
        platform: pickText(metadata.platform) || detectPlatform(card.url),
        url: card.url,
        metadata,
      }),
    })

    return {
      ...card,
      tags: visibleTags,
    }
  })

  // Build graph nodes
  const nodes = cardsWithVisibleTags.map((card) => ({
    id: card.id,
    title: card.title,
    imageUrl: card.imageUrl,
    type: card.type,
    tags: card.tags || [],
    colors: ((card.metadata as any)?.colors as string[]) || [],
    connections: 0,
  }))

  // Build graph links using an inverted tag index — O(n·k + E) instead of O(n²)
  // Step 1: build tag → [cardId] index
  const tagIndex = new Map<string, string[]>()
  for (const card of cardsWithVisibleTags) {
    for (const t of card.tags || []) {
      const bucket = tagIndex.get(t)
      if (bucket) {
        bucket.push(card.id)
      } else {
        tagIndex.set(t, [card.id])
      }
    }
  }

  // Step 2: enumerate card pairs per tag bucket, accumulate shared tags
  const pairShared = new Map<string, Set<string>>()
  for (const [tag, ids] of tagIndex) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]
        const b = ids[j]
        const key = a < b ? `${a}::${b}` : `${b}::${a}`
        const tags = pairShared.get(key)
        if (tags) {
          tags.add(tag)
        } else {
          pairShared.set(key, new Set([tag]))
        }
      }
    }
  }

  // Step 3: emit links that meet minWeight threshold
  const links: {
    source: string
    target: string
    sharedTags: string[]
    weight: number
  }[] = []

  for (const [key, tagSet] of pairShared) {
    if (tagSet.size >= minWeight) {
      const sep = key.indexOf('::')
      links.push({
        source: key.slice(0, sep),
        target: key.slice(sep + 2),
        sharedTags: [...tagSet],
        weight: tagSet.size,
      })
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

  const result: GraphDataResult = { nodes: nodesWithConnections, links }
  _graphCacheSet(cacheKey, result)
  return result
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
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new Error(
            `Enrichment pipeline timed out after ${Math.round(
              ENRICHMENT_PIPELINE_TIMEOUT_MS / 1000
            )}s`
          )
        ),
      ENRICHMENT_PIPELINE_TIMEOUT_MS
    )
  })

  const runPipeline = async () => {
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
      (!contentToAnalyze ||
        contentToAnalyze.trim().length < 160 ||
        !card.imageUrl ||
        !card.title ||
        isGenericTitle(card.title))

    if (shouldScrape) {
      const scrapeStart = Date.now()
      try {
        const { scrapeUrl } = await importScraperModule()
        const scraped = await scrapeUrl(card.url)
        let scrapedUpdate = buildScrapedCardUpdate(card, scraped)
        const aggressiveRecoveryReason = shouldEscalateScrapeAcquisition({
          card,
          update: scrapedUpdate,
        })
        let aggressiveRecoveryApplied = false

        if (aggressiveRecoveryReason) {
          try {
            const aggressiveScraped = await scrapeUrl(card.url, {
              aggressiveBrowserAcquisition: true,
              recoveryReason: aggressiveRecoveryReason,
            })
            const aggressiveBaseCard = {
              ...card,
              title: scrapedUpdate.title ?? card.title,
              content: scrapedUpdate.content ?? card.content,
              imageUrl: scrapedUpdate.imageUrl ?? card.imageUrl,
              metadata: scrapedUpdate.metadata,
            }
            const aggressiveUpdate = buildScrapedCardUpdate(
              aggressiveBaseCard,
              aggressiveScraped
            )

            if (isScrapedUpdateMateriallyBetter(aggressiveUpdate, scrapedUpdate)) {
              scrapedUpdate = aggressiveUpdate
              aggressiveRecoveryApplied = true
            }
          } catch (aggressiveScrapeErr) {
            logger.warn(
              { cardId, err: aggressiveScrapeErr, aggressiveRecoveryReason },
              'Aggressive browser acquisition failed'
            )
          }
        }

        scrapedUpdate = annotateAggressiveRecoveryMetrics(scrapedUpdate, {
          attempted: !!aggressiveRecoveryReason,
          reason: aggressiveRecoveryReason,
          applied: aggressiveRecoveryApplied,
        })
        if (aggressiveRecoveryReason) {
          logger.info(
            { cardId, aggressiveRecoveryReason, aggressiveRecoveryApplied },
            'Aggressive browser acquisition evaluated'
          )
        }
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
    const localClassification = extractStoredLocalClassification(currentMetadata)
    const shouldUseLocalClassification = !!localClassification
    const classifyStart = Date.now()
    const classification = shouldUseLocalClassification
      ? localClassification
      : await classifyContent(
          card.url,
          contentToAnalyze,
          analysisImageUrl,
          imageCount
        )
    const classifyMs = Date.now() - classifyStart
    logger.info(
      {
        cardId,
        classifyMs,
        type: classification.type,
        source: shouldUseLocalClassification ? 'local-ai' : 'glm',
      },
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
    let summarySource: 'dspy' | 'glm' | 'fallback' | 'local-ai' =
      shouldUseLocalClassification ? 'local-ai' : 'glm'
    let tagsSource: 'dspy' | 'glm' | 'fallback' | 'local-ai' =
      shouldUseLocalClassification ? 'local-ai' : 'glm'

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

    const shouldRunRemoteRefinement =
      !!dspyPlatform &&
      !!contentToAnalyze &&
      (!shouldUseLocalClassification ||
        process.env.ENABLE_REMOTE_REFINEMENT_FOR_LOCAL_CLASSIFICATION ===
          'true')

    if (shouldRunRemoteRefinement && dspyPlatform) {
      try {
        const [dspySummary, dspyTags] = await Promise.all([
          generateSummaryWithDSPy(contentToAnalyze, dspyPlatform, {
            author: currentMetadata.authorHandle || currentMetadata.authorName,
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

    const generatedTagOptions = buildGeneratedTagOptions({
      contentType: classification.type,
      platform: detectedPlatform,
      url: card.url,
      metadata: currentMetadata,
    })

    finalTags = sanitizeGeneratedTags(finalTags, generatedTagOptions)

    // 7. Generate embedding and store it
    const hadStoredEmbedding = currentMetadata.embeddingStored === true
    const embeddingAvailability = getEmbeddingAvailability()
    const embeddingCompatibility = getEmbeddingCompatibility()
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
    let embeddingDimension =
      typeof currentMetadata.embeddingDimension === 'number'
        ? currentMetadata.embeddingDimension
        : (embeddingCompatibility.configuredDimension ?? undefined)

    if (!embeddingAvailability.configured) {
      logger.info(
        {
          cardId,
          reason: embeddingAvailability.reason,
          compatibility: embeddingCompatibility,
        },
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
        embeddingDimension = provenance.dimension || embeddingDimension
        logger.info(
          {
            cardId,
            provider: embeddingProvider,
            model: embeddingModel,
            dimension: embeddingDimension,
          },
          'Embedding stored via pgvector'
        )
      } catch (embErr) {
        embeddingStatus = 'failed'
        embeddingError = getErrorMessage(
          embErr,
          'Embedding generation/storage failed'
        )
        logger.warn(
          {
            cardId,
            err: embErr,
            reason: embeddingError,
            compatibility: embeddingCompatibility,
          },
          'Embedding generation/storage failed'
        )
      }
    }

    // 8. Determine final title
    const shouldUpdateTitle = !currentMetadata.titleEditedAt
    let finalTitle: string | undefined
    let titleTraceCandidates: ReturnType<typeof pickBestTitleCandidate>['candidates'] = []
    let selectedTitleSource: string | null = null

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
        !!card.title && !isWeakTitle(card.title)

      let dspyTitleCandidate: { title: string; confidence: number } | null = null
      const titleOptimizationContent = [
        pickText(currentMetadata.scrapedTitle),
        pickText(currentMetadata.scrapedDescription),
        contentToAnalyze,
        finalSummary,
      ]
        .filter((value): value is string => !!value)
        .join('\n\n')

      if (
        dspyPlatform &&
        titleOptimizationContent.length > 20 &&
        (!existingTitleIsGood || isWeakTitle(classification.title))
      ) {
        try {
          dspyTitleCandidate = await extractTitleWithDSPy(
            titleOptimizationContent,
            pickText(currentMetadata.authorHandle) ||
              pickText(currentMetadata.authorName) ||
              pickText(currentMetadata.author) ||
              '',
            dspyPlatform
          )
        } catch (titleErr) {
          logger.warn({ cardId, err: titleErr }, 'DSPy title optimization failed')
        }
      }

      const titleSelection = pickBestTitleCandidate([
        {
          title: card.title,
          source: 'existing',
        },
        {
          title: pickText(currentMetadata.scrapedTitle),
          source: 'scraped',
        },
        {
          title: localClassification?.title,
          source: 'local-ai',
        },
        {
          title: classification.title,
          source: shouldUseLocalClassification ? 'local-ai' : 'classification',
        },
        {
          title: dspyTitleCandidate?.title,
          source: 'dspy',
          confidence: dspyTitleCandidate?.confidence,
        },
        {
          title: buildHeuristicSourceTitle({
            content: titleOptimizationContent,
            summary: finalSummary,
            url: card.url,
            author:
              pickText(currentMetadata.authorHandle) ||
              pickText(currentMetadata.authorName) ||
              pickText(currentMetadata.author),
          }),
          source: 'heuristic',
        },
      ])

      titleTraceCandidates = titleSelection.candidates
      selectedTitleSource = titleSelection.selected?.source || null

      if (hasExplicitTitle && existingTitleIsGood) {
        if (isMoviePlatform(detectedPlatform) && card.title) {
          const cleaned = cleanMovieTitle(card.title)
          finalTitle = cleaned.title
        }
        // else keep existing title (don't set finalTitle)
      } else {
        finalTitle = titleSelection.selected?.title || classification.title
      }
    }

    // 9. Merge tags
    const currentTags = Array.isArray(card.tags) ? card.tags : []
    const mergedTags = mergeGeneratedCardTags({
      currentTags,
      nextTags: finalTags,
      metadata: currentMetadata,
      contentType: classification.type,
      platform: detectedPlatform,
      url: card.url,
    })

    // 10. Calculate total timing
    const totalMs = Date.now() - timing.startedAt
    const sourceSet = new Set([summarySource, tagsSource])
    const uniformSource = Array.from(sourceSet)[0] as
      | typeof summarySource
      | typeof tagsSource
    const enrichmentSource =
      sourceSet.size > 1
        ? 'mixed'
        : uniformSource === 'dspy'
          ? 'dspy'
          : uniformSource === 'local-ai'
            ? 'local-ai'
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
          platform: classification.platform || currentMetadata.platform,
          processing: false,
          enrichmentError: null,
          enrichmentFailedAt: null,
          enrichmentStage: 'complete',
          enrichmentSource,
          tagsSource,
          summarySource,
          titleSource: finalTitle
            ? toPersistedTitleSource(
                (selectedTitleSource as
                  | Parameters<typeof toPersistedTitleSource>[0]
                  | null) ||
                  (shouldUseLocalClassification ? 'local-ai' : 'classification')
              )
            : currentMetadata.titleSource || 'scraped',
          titleDiagnostics:
            titleTraceCandidates.length > 0
              ? {
                  selected: finalTitle || card.title || classification.title,
                  selectedSource:
                    selectedTitleSource ||
                    (finalTitle ? currentMetadata.titleSource : 'existing'),
                  candidates: titleTraceCandidates.slice(0, 5),
                }
              : currentMetadata.titleDiagnostics,
          embeddingProvider,
          embeddingModel,
          embeddingDimension,
          embeddingStored,
          embeddingStatus,
          embeddingError,
          embeddingCompatibilityStatus: embeddingCompatibility.status,
          embeddingCompatibilityReason:
            embeddingError || embeddingCompatibility.reason,
          embeddingExpectedDimension: embeddingCompatibility.expectedDimension,
          embeddingConfiguredDimension:
            embeddingCompatibility.configuredDimension,
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
  }

  try {
    await Promise.race([runPipeline(), timeoutPromise])
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
      const fallbackCard =
        card || (await db.card.findUnique({ where: { id: cardId } }))
      if (fallbackCard) {
        const fallback = generateFallbackTags(
          fallbackCard.url || null,
          fallbackCard.content || null,
          fallbackCard.title || null,
          fallbackCard.imageUrl || null
        )
        const fallbackMetadata =
          (fallbackCard.metadata as Record<string, unknown>) || {}
        const fallbackTagOptions = buildGeneratedTagOptions({
          contentType: fallback.type,
          platform:
            pickText(fallbackMetadata.platform) ||
            detectPlatform(fallbackCard.url),
          url: fallbackCard.url || null,
          metadata: fallbackMetadata,
        })
        const sanitizedFallbackTags = sanitizeGeneratedTags(
          fallback.tags,
          fallbackTagOptions
        )

        const existingTags = Array.isArray(fallbackCard.tags)
          ? fallbackCard.tags
          : []
        const mergedTags = mergeGeneratedCardTags({
          currentTags: existingTags,
          nextTags: sanitizedFallbackTags,
          metadata: fallbackMetadata,
          contentType: fallback.type,
          platform:
            pickText(fallbackMetadata.platform) ||
            detectPlatform(fallbackCard.url),
          url: fallbackCard.url || null,
        })

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
          { cardId, tags: sanitizedFallbackTags },
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
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

// =============================================================================
// captureScreenshot MUTATION
// =============================================================================

export const captureScreenshot: MutationResolvers['captureScreenshot'] =
  async ({ url }) => {
    try {
      // Use the emitted JS extension so the built ESM bundle resolves cleanly.
      const { captureWithPlaywright } =
        await import('../../lib/scraper/screenshotPlaywright.js')
      const result = await captureWithPlaywright(url)

      return {
        success: result.success,
        url: null,
        source: 'playwright',
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
    const embeddingCompatibility = getEmbeddingCompatibility()

    if (!embeddingAvailability.configured) {
      logger.info(
        {
          userId,
          limit,
          reason: embeddingAvailability.reason,
          compatibility: embeddingCompatibility,
        },
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
              embeddingDimension: provenance.dimension,
              embeddingCompatibilityStatus: embeddingCompatibility.status,
              embeddingCompatibilityReason: null,
              embeddingExpectedDimension:
                embeddingCompatibility.expectedDimension,
              embeddingConfiguredDimension:
                embeddingCompatibility.configuredDimension,
              vectorBackend: 'supabase',
              embeddingBackfilledAt: new Date().toISOString(),
            },
          },
        })

        processed++
        logger.info({ cardId: card.id, processed }, 'Backfilled embedding')
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
              embeddingCompatibilityStatus: embeddingCompatibility.status,
              embeddingCompatibilityReason:
                errorMessage || embeddingCompatibility.reason,
              embeddingExpectedDimension:
                embeddingCompatibility.expectedDimension,
              embeddingConfiguredDimension:
                embeddingCompatibility.configuredDimension,
            },
          },
        })
        logger.warn(
          {
            cardId: card.id,
            err,
            reason: errorMessage,
            compatibility: embeddingCompatibility,
          },
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
