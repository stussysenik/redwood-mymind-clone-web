/**
 * MyMind Clone - Enrichment Timing Utilities
 *
 * Provides estimated processing times for AI enrichment based on platform,
 * content type, and historical data. Used for real-time ETA display.
 *
 * @fileoverview Enrichment ETA calculation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface EnrichmentTiming {
  /** Timestamp when enrichment started */
  startedAt: number
  /** Platform being processed */
  platform: string
  /** Estimated total time in ms */
  estimatedTotalMs: number
  /** Time spent on scraping (if applicable) */
  scrapeMs?: number
  /** Time spent on AI classification */
  classifyMs?: number
  /** Time spent on image analysis */
  imageAnalysisMs?: number
  /** Total time taken (filled on completion) */
  totalMs?: number
  /** Timestamp when the current stage was set (ms since epoch) */
  stageUpdatedAt?: number
}

export interface EnrichmentStage {
  name: string
  label: string
  icon: string
  estimatedPercent: number // What % of total time this stage typically takes
}

// =============================================================================
// STAGE DEFINITIONS
// =============================================================================

/**
 * Enrichment processing stages with visual feedback
 */
export const ENRICHMENT_STAGES: EnrichmentStage[] = [
  {
    name: 'queued',
    label: 'Queued...',
    icon: '⏳',
    estimatedPercent: 5,
  },
  {
    name: 'fetching',
    label: 'Fetching content...',
    icon: '🔍',
    estimatedPercent: 15,
  },
  {
    name: 'analyzing',
    label: 'Analyzing with AI...',
    icon: '🧠',
    estimatedPercent: 45,
  },
  {
    name: 'extracting',
    label: 'Extracting insights...',
    icon: '✨',
    estimatedPercent: 25,
  },
  {
    name: 'finalizing',
    label: 'Finalizing...',
    icon: '📝',
    estimatedPercent: 10,
  },
]

// =============================================================================
// PLATFORM TIMING ESTIMATES
// =============================================================================

/**
 * Base estimated times (in ms) per platform.
 * These are based on typical processing times:
 * - oEmbed/API sources are faster
 * - Playwright scraping is slower
 * - AI analysis adds consistent overhead
 */
const PLATFORM_BASE_TIMES: Record<string, number> = {
  // Fast platforms (API-based, minimal scraping)
  youtube: 6000,
  twitter: 5000,
  reddit: 6000,

  // Medium platforms (JSON-LD extraction)
  imdb: 7000,
  letterboxd: 7000,
  goodreads: 8000,
  amazon: 8000,
  storygraph: 8000,
  wikipedia: 6000,

  // Slow platforms (complex scraping)
  instagram: 15000,
  tiktok: 12000,

  // Generic fallback
  generic: 10000,
}

/**
 * Additional time per 1000 characters of content
 */
const TIME_PER_1000_CHARS = 500 // 0.5s per 1000 chars

/**
 * Additional time if image analysis is needed
 */
const IMAGE_ANALYSIS_TIME = 3000

// =============================================================================
// ETA CALCULATION
// =============================================================================

/**
 * Estimates enrichment time based on platform and content characteristics.
 */
export function estimateEnrichmentTime(
  platform: string,
  contentLength: number = 0,
  hasImage: boolean = false,
  imageCount: number = 1
): number {
  const baseTime =
    PLATFORM_BASE_TIMES[platform.toLowerCase()] || PLATFORM_BASE_TIMES.generic

  const contentFactor =
    Math.floor(contentLength / 1000) * TIME_PER_1000_CHARS

  const imageFactor = hasImage
    ? IMAGE_ANALYSIS_TIME * Math.min(imageCount, 3)
    : 0

  return baseTime + contentFactor + imageFactor
}

/**
 * Resolves a server stage name to its index in ENRICHMENT_STAGES.
 * Returns -1 if not found.
 */
export function getStageIndex(stageName: string): number {
  return ENRICHMENT_STAGES.findIndex((s) => s.name === stageName)
}

/**
 * Gets the current stage and progress based on elapsed time.
 */
export function getEnrichmentProgress(
  elapsedMs: number,
  estimatedTotalMs: number
): {
  stage: EnrichmentStage
  stageIndex: number
  overallProgress: number
  stageProgress: number
  remainingMs: number
} {
  const overallProgress = Math.min(elapsedMs / estimatedTotalMs, 0.95)

  let accumulatedPercent = 0
  let stageIndex = 0
  let stageProgress = 0

  for (let i = 0; i < ENRICHMENT_STAGES.length; i++) {
    const stage = ENRICHMENT_STAGES[i]
    const stageEnd = accumulatedPercent + stage.estimatedPercent / 100

    if (overallProgress <= stageEnd) {
      stageIndex = i
      const stageStart = accumulatedPercent
      const stageRange = stage.estimatedPercent / 100
      stageProgress = (overallProgress - stageStart) / stageRange
      break
    }

    accumulatedPercent = stageEnd
    stageIndex = i
  }

  if (stageIndex >= ENRICHMENT_STAGES.length) {
    stageIndex = ENRICHMENT_STAGES.length - 1
  }

  const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs)

  return {
    stage: ENRICHMENT_STAGES[stageIndex],
    stageIndex,
    overallProgress,
    stageProgress: Math.min(stageProgress, 1),
    remainingMs,
  }
}

/**
 * Formats remaining time for display.
 */
export function formatRemainingTime(ms: number): string {
  if (ms < 1000) return 'Almost done...'
  if (ms < 5000) return 'A few seconds...'

  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `~${seconds}s remaining`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (remainingSeconds === 0) return `~${minutes}m remaining`
  return `~${minutes}m ${remainingSeconds}s remaining`
}

/**
 * Creates initial timing object when enrichment starts.
 */
export function createEnrichmentTiming(
  platform: string,
  contentLength: number = 0,
  hasImage: boolean = false,
  imageCount: number = 1
): EnrichmentTiming {
  return {
    startedAt: Date.now(),
    platform,
    estimatedTotalMs: estimateEnrichmentTime(
      platform,
      contentLength,
      hasImage,
      imageCount
    ),
  }
}

/**
 * Updates timing with actual measurements.
 */
export function updateEnrichmentTiming(
  timing: EnrichmentTiming,
  updates: Partial<
    Pick<
      EnrichmentTiming,
      'scrapeMs' | 'classifyMs' | 'imageAnalysisMs' | 'totalMs'
    >
  >
): EnrichmentTiming {
  return {
    ...timing,
    ...updates,
  }
}

// =============================================================================
// STUCK DETECTION
// =============================================================================

/**
 * Maximum time (ms) before considering enrichment "stuck".
 * After this time, we assume something went wrong and stop showing the loading indicator.
 * 2 minutes = 120,000 ms
 */
export const STUCK_TIMEOUT_MS = 2 * 60 * 1000

/**
 * Checks if a card's enrichment is stuck (processing for too long).
 */
export function isEnrichmentStuck(metadata: {
  processing?: boolean
  enrichmentTiming?: { startedAt?: number }
  enrichmentError?: string
  enrichmentFailedAt?: string
} | null | undefined): { stuck: boolean; failed: boolean; elapsedMs: number } {
  if (!metadata?.processing) {
    return { stuck: false, failed: false, elapsedMs: 0 }
  }

  const startedAt = metadata.enrichmentTiming?.startedAt
  const elapsedMs = startedAt ? Date.now() - startedAt : 0

  if (metadata.enrichmentError || metadata.enrichmentFailedAt) {
    return { stuck: true, failed: true, elapsedMs }
  }

  if (!startedAt) {
    return { stuck: false, failed: false, elapsedMs: 0 }
  }

  const stuck = elapsedMs > STUCK_TIMEOUT_MS

  return { stuck, failed: false, elapsedMs }
}

/**
 * Gets the processing state of a card for UI display.
 */
export type ProcessingState =
  | 'idle'
  | 'processing'
  | 'slow'
  | 'stuck'
  | 'failed'

/** Time (ms) after which processing is considered "slow" but not failed (2 minutes) */
export const SLOW_TIMEOUT_MS = 2 * 60 * 1000

export function getProcessingState(metadata: {
  processing?: boolean
  enrichmentTiming?: { startedAt?: number; estimatedTotalMs?: number }
  enrichmentError?: string
  enrichmentFailedAt?: string
} | null | undefined): ProcessingState {
  if (!metadata?.processing) {
    return 'idle'
  }

  if (metadata.enrichmentError || metadata.enrichmentFailedAt) {
    return 'failed'
  }

  const { stuck, elapsedMs } = isEnrichmentStuck(metadata)
  if (stuck) {
    return 'stuck'
  }

  const estimatedMs =
    metadata.enrichmentTiming?.estimatedTotalMs || 15000
  const slowThreshold = Math.max(SLOW_TIMEOUT_MS, estimatedMs * 2)
  if (elapsedMs > slowThreshold) {
    return 'slow'
  }

  return 'processing'
}
