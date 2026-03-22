/**
 * MyMind Clone - TypeScript Type Definitions
 *
 * Core types shared across the RedwoodJS web side.
 * These mirror the source app's types exactly.
 */

// =============================================================================
// CARD TYPES
// =============================================================================

export type CardType =
  | 'article'
  | 'image'
  | 'note'
  | 'product'
  | 'book'
  | 'video'
  | 'audio'
  | 'social'
  | 'movie'
  | 'website'

export interface CardMetadata {
  summary?: string
  colors?: string[]
  images?: string[]
  objects?: string[]
  ocrText?: string
  texture?: string
  composition?: string
  visualElements?: string[]
  paletteType?: string
  price?: string
  author?: string
  authorName?: string
  authorHandle?: string
  authorAvatar?: string
  readingTime?: number
  publishedAt?: string

  // Platform-specific
  platform?: string
  duration?: string
  viewCount?: string
  subreddit?: string
  upvotes?: string
  comments?: string
  rating?: string
  year?: string
  director?: string

  // Processing state
  processing?: boolean
  enrichmentError?: string
  enrichmentFailedAt?: string
  enrichedAt?: string
  note?: string
  note_updated_at?: string
  titleEditedAt?: string
  summaryEditedAt?: string

  // Carousel
  isCarousel?: boolean
  slideCount?: number
  carouselPending?: boolean
  carouselExtracted?: boolean
  carouselExtractedAt?: string
  carouselExtractionFailed?: boolean
  carouselExtractionError?: string

  // Enrichment provenance
  enrichmentStage?:
    | 'pending'
    | 'queued'
    | 'scraping'
    | 'fetching'
    | 'analyzing'
    | 'classifying'
    | 'extracting'
    | 'finalizing'
    | 'complete'
    | 'fallback'
    | 'failed'
  enrichmentSource?: 'dspy' | 'glm' | 'fallback' | 'mixed'
  enrichmentConfidence?: number
  tagsSource?: 'dspy' | 'glm' | 'fallback'
  summarySource?: 'dspy' | 'glm' | 'fallback'
  titleSource?: 'scraped' | 'dspy' | 'glm' | 'fallback'
  embeddingProvider?: string
  embeddingModel?: string
  vectorBackend?: 'supabase' | 'pinecone'
  previewSource?:
    | 'instagram-api'
    | 'twitter-api'
    | 'scraper'
    | 'playwright'
    | 'microlink'
    | 'user-upload'
    | 'unknown'
  previewAspectRatio?: string

  // Social engagement
  engagement?: {
    likes?: number | string
    retweets?: number | string
    views?: number | string
    comments?: number | string
    replies?: number | string
  }

  // Media persistence
  mediaTypes?: ('image' | 'video')[]
  videoPositions?: number[]
  mediaPersisted?: boolean
  originalCdnUrls?: string[]

  // Enrichment timing
  enrichmentTiming?: {
    startedAt?: number
    estimatedTotalMs?: number
    platform?: string
    scrapeMs?: number
    classifyMs?: number
    totalMs?: number
    completedAt?: number
    stageUpdatedAt?: number
  }
}

export interface Card {
  id: string
  userId: string
  type: CardType
  title: string | null
  content: string | null
  url: string | null
  imageUrl: string | null
  metadata: CardMetadata
  tags: string[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  archivedAt: string | null
}

// =============================================================================
// SPACE TYPES
// =============================================================================

export interface Space {
  id: string
  userId: string
  name: string
  query: string | null
  isSmart: boolean
  createdAt: string
}

export interface SpaceWithCount extends Space {
  cardCount: number
}

// =============================================================================
// AI TYPES
// =============================================================================

export interface ClassificationResult {
  type: CardType
  title: string
  tags: string[]
  summary: string
  platform?: string
}

export interface ImageAnalysisResult {
  colors: string[]
  objects: string[]
  ocrText: string | null
  texture?: string
  composition?: string
  visualElements?: string[]
  paletteType?: string
}

// =============================================================================
// API TYPES
// =============================================================================

export type SaveSource =
  | 'ios-share-extension'
  | 'web-share-api'
  | 'chrome-extension'
  | 'manual'

export interface SaveCardRequest {
  url?: string
  type?: CardType
  title?: string
  content?: string
  imageUrl?: string
  tags?: string[]
  source?: SaveSource
  clientClassification?: {
    type: CardType
    title: string
    tags: string[]
    summary: string
    source: 'local-ai'
  }
}
