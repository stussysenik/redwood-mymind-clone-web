/**
 * MyMind Clone - TypeScript Type Definitions
 *
 * Core types shared across the RedwoodJS web side.
 * These mirror the source app's types exactly.
 */

import type {
  AnyEnrichmentStage as SharedAnyEnrichmentStage,
  AnyTitleSource as SharedAnyTitleSource,
  CardType as SharedCardType,
  ClassificationResult as SharedClassificationResult,
  ClientClassification as SharedClientClassification,
  EnrichmentSource as SharedEnrichmentSource,
  PreviewSource as SharedPreviewSource,
  SummarySource as SharedSummarySource,
  TagSource as SharedTagSource,
  VectorBackend as SharedVectorBackend,
} from 'src/lib/semantic'
import {
  normalizeCardType,
  normalizeEnrichmentStage,
  normalizeTitleSource,
} from 'src/lib/semantic'

// =============================================================================
// CARD TYPES
// =============================================================================

export type CardType = SharedCardType

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
  colorPalette?: Array<{ hex: string; hsl: { h: number; s: number; l: number }; weight: number }>
  colorCategory?: 'warm' | 'cool' | 'monochrome' | 'vibrant' | 'muted' | 'mixed'
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
  enrichmentStage?: SharedAnyEnrichmentStage
  enrichmentSource?: SharedEnrichmentSource
  enrichmentConfidence?: number
  tagsSource?: SharedTagSource
  summarySource?: SharedSummarySource
  titleSource?: SharedAnyTitleSource
  embeddingProvider?: string
  embeddingModel?: string
  vectorBackend?: SharedVectorBackend
  previewSource?: SharedPreviewSource
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

export type ClassificationResult = SharedClassificationResult
export type ClientClassification = SharedClientClassification

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
  clientClassification?: ClientClassification
}

// =============================================================================
// DATABASE ROW TYPES (Supabase realtime)
// =============================================================================

export interface CardRow {
  id: string
  user_id: string
  type: string
  title: string | null
  content: string | null
  url: string | null
  image_url: string | null
  metadata: Record<string, unknown>
  tags: string[]
  created_at: string
  updated_at: string
  deleted_at: string | null
  archived_at: string | null
}

export function rowToCard(row: CardRow): Card {
  const metadata = (row.metadata || {}) as CardMetadata

  return {
    id: row.id,
    userId: row.user_id,
    type: normalizeCardType(row.type),
    title: row.title,
    content: row.content,
    url: row.url,
    imageUrl: row.image_url,
    metadata: {
      ...metadata,
      enrichmentStage:
        normalizeEnrichmentStage(metadata.enrichmentStage) ||
        metadata.enrichmentStage,
      titleSource:
        normalizeTitleSource(metadata.titleSource) || metadata.titleSource,
    },
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    archivedAt: row.archived_at,
  }
}
