import { z } from 'zod'

export const CARD_TYPE_VALUES = [
  'article',
  'image',
  'note',
  'product',
  'book',
  'video',
  'audio',
  'social',
  'movie',
  'website',
] as const

export const CardTypeSchema = z.enum(CARD_TYPE_VALUES)
export type CardType = z.infer<typeof CardTypeSchema>

export const AESTHETIC_VOCABULARY = [
  '3d',
  'aerial',
  'animated',
  'art-deco',
  'asymmetric',
  'atmospheric-depth',
  'bokeh',
  'brutalist',
  'brutalist-type',
  'card-based',
  'cinematic',
  'clinical',
  'cozy',
  'collage-aesthetic',
  'corporate',
  'dark-mode',
  'dense',
  'display-type',
  'duotone',
  'editorial',
  'film-grain',
  'flat',
  'flat-design',
  'full-bleed',
  'geometric',
  'glassmorphism',
  'glossy',
  'gradient-mesh',
  'grid-layout',
  'hand-crafted',
  'hand-drawn',
  'hand-lettered',
  'high-contrast',
  'indie',
  'interactive',
  'layered-depth',
  'light-mode',
  'liquid-glass',
  'lo-fi-texture',
  'long-exposure',
  'luxe',
  'macro',
  'matte',
  'maximalist',
  'minimalist',
  'monochrome',
  'monospace',
  'muted',
  'muted-palette',
  'natural-light',
  'neon',
  'neon-accent',
  'neubrutalism',
  'organic-texture',
  'parallax',
  'pastel',
  'pixel-art',
  'playful',
  'portrait',
  'raw',
  'retro',
  'retro-futurism',
  'saturated',
  'sans-serif',
  'scroll-driven',
  'serif',
  'single-column',
  'skeuomorphic',
  'split-screen',
  'static',
  'street-photo',
  'studio-lit',
  'swiss',
  'terminal-aesthetic',
  'textured',
  'typographic-focus',
  'vaporwave',
  'wabi-sabi',
  'whitespace-heavy',
  'y2k',
] as const

export type Aesthetic = (typeof AESTHETIC_VOCABULARY)[number]
export const AESTHETIC_SET = new Set<string>(AESTHETIC_VOCABULARY)

export const DEFAULT_AESTHETIC_BY_CARD_TYPE: Record<CardType, Aesthetic> = {
  article: 'editorial',
  image: 'studio-lit',
  note: 'raw',
  product: 'glossy',
  book: 'editorial',
  video: 'cinematic',
  audio: 'matte',
  social: 'raw',
  movie: 'cinematic',
  website: 'flat',
}

export const TYPE_FALLBACK_TAGS: Record<CardType, readonly string[]> = {
  article: ['reading-list', 'reference'],
  image: ['visual-inspiration', 'composition'],
  note: ['personal-note', 'idea-capture'],
  product: ['wishlist', 'design-object'],
  book: ['reading-list', 'literature'],
  video: ['watchlist', 'video-reference'],
  audio: ['listening-list', 'audio-reference'],
  social: ['conversation', 'public-note'],
  movie: ['cinema', 'watchlist'],
  website: ['web-reference', 'link-archive'],
}

export const BLOCKED_TAG_VALUES = [
  'a',
  'ai',
  'amazing',
  'an',
  'app',
  'article',
  'art',
  'artificial-intelligence',
  'artistic',
  'awesome',
  'beautiful',
  'behance',
  'best',
  'beginner',
  'bluesky',
  'book',
  'bookmark',
  'business',
  'clean',
  'code',
  'coding',
  'computer-science',
  'complex',
  'contemporary',
  'content',
  'cool',
  'creative',
  'cracked',
  'culture',
  'data',
  'data-science',
  'design',
  'development',
  'digital',
  'dribbble',
  'educational',
  'efficient',
  'elegant',
  'engineering',
  'exploratory',
  'explore',
  'facebook',
  'favorite',
  'film',
  'fun',
  'functional',
  'general',
  'github',
  'good',
  'google',
  'great',
  'helpful',
  'important',
  'information',
  'informative',
  'instagram',
  'interesting',
  'internet',
  'innovative',
  'inspiring',
  'letterboxd',
  'light',
  'link',
  'linkedin',
  'loading',
  'machine-learning',
  'mastodon',
  'media',
  'misc',
  'modern',
  'modernism',
  'music',
  'my',
  'netflix',
  'new',
  'news',
  'nice',
  'note',
  'old',
  'online',
  'open-source',
  'other',
  'page',
  'photo',
  'popular',
  'post',
  'precise',
  'premium',
  'programming',
  'project',
  'promotional',
  'quality',
  'random',
  'reading',
  'redirect',
  'reddit',
  'resource',
  'saved',
  'share',
  'sharing',
  'simple',
  'site',
  'slick',
  'social',
  'software',
  'solid',
  'some',
  'soundcloud',
  'stuff',
  'style',
  'technical',
  'technology',
  'tech',
  'the',
  'things',
  'thoughts',
  'threads',
  'tiktok',
  'tool',
  'top',
  'trending',
  'twitter',
  'unique',
  'update',
  'useful',
  'various',
  'video',
  'viral',
  'web',
  'website',
  'work',
  'x',
  'youtube',
] as const

export const BLOCKED_TAGS = new Set<string>(BLOCKED_TAG_VALUES)

export const TAG_LIMIT = 5
export const MIN_TAGS = 3

const RAW_CLASSIFICATION_RESULT_SCHEMA = z.object({
  type: z.string().trim().min(1),
  title: z.string().trim().min(1),
  tags: z.array(z.string()).default([]),
  summary: z.string().default(''),
  platform: z.string().trim().optional(),
})

export const ClassificationResultSchema = z.object({
  type: CardTypeSchema,
  title: z.string().trim().min(1).max(120),
  tags: z.array(z.string()).min(1).max(TAG_LIMIT),
  summary: z.string().trim().min(1).max(500),
  platform: z.string().trim().min(1).optional(),
})

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>

export const ClientClassificationSchema = ClassificationResultSchema.extend({
  source: z.literal('local-ai'),
})

export type ClientClassification = z.infer<typeof ClientClassificationSchema>

export const DSPyTagsResponseSchema = z.object({
  tags: z.object({
    primary: z.array(z.string()).default([]),
    contextual: z.array(z.string()).default([]),
    vibe: z.string().trim().optional().default(''),
  }),
  confidence: z.number().finite().min(0).max(1),
  reasoning: z.string().optional(),
})

export type DSPyTagsResponse = z.infer<typeof DSPyTagsResponseSchema>

export const ENRICHMENT_SOURCE_VALUES = ['dspy', 'glm', 'fallback', 'mixed'] as const
export const EnrichmentSourceSchema = z.enum(ENRICHMENT_SOURCE_VALUES)
export type EnrichmentSource = z.infer<typeof EnrichmentSourceSchema>

export const TAG_SOURCE_VALUES = ['dspy', 'glm', 'fallback'] as const
export const TagSourceSchema = z.enum(TAG_SOURCE_VALUES)
export type TagSource = z.infer<typeof TagSourceSchema>

export const SUMMARY_SOURCE_VALUES = ['dspy', 'glm', 'fallback'] as const
export const SummarySourceSchema = z.enum(SUMMARY_SOURCE_VALUES)
export type SummarySource = z.infer<typeof SummarySourceSchema>

export const TITLE_SOURCE_VALUES = ['scraped', 'dspy', 'glm', 'fallback'] as const
export const TitleSourceSchema = z.enum(TITLE_SOURCE_VALUES)
export type TitleSource = z.infer<typeof TitleSourceSchema>
export type LegacyTitleSource = 'ai'
export type AnyTitleSource = TitleSource | LegacyTitleSource

export const EMBEDDING_STATUS_VALUES = ['stored', 'skipped', 'failed'] as const
export const EmbeddingStatusSchema = z.enum(EMBEDDING_STATUS_VALUES)
export type EmbeddingStatus = z.infer<typeof EmbeddingStatusSchema>

export const VECTOR_BACKEND_VALUES = ['supabase', 'pinecone'] as const
export const VectorBackendSchema = z.enum(VECTOR_BACKEND_VALUES)
export type VectorBackend = z.infer<typeof VectorBackendSchema>

export const PREVIEW_SOURCE_VALUES = [
  'instagram-api',
  'twitter-api',
  'scraper',
  'playwright',
  'microlink',
  'user-upload',
  'unknown',
] as const
export const PreviewSourceSchema = z.enum(PREVIEW_SOURCE_VALUES)
export type PreviewSource = z.infer<typeof PreviewSourceSchema>

export const ENRICHMENT_STAGE_VALUES = [
  'queued',
  'scraping',
  'analyzing',
  'extracting',
  'finalizing',
  'complete',
  'failed',
] as const

export const EnrichmentStageSchema = z.enum(ENRICHMENT_STAGE_VALUES)
export type EnrichmentStage = z.infer<typeof EnrichmentStageSchema>

export const LEGACY_ENRICHMENT_STAGE_VALUES = [
  'pending',
  'processing',
  'fetching',
  'classifying',
  'fallback',
] as const

export type LegacyEnrichmentStage =
  (typeof LEGACY_ENRICHMENT_STAGE_VALUES)[number]
export type AnyEnrichmentStage = EnrichmentStage | LegacyEnrichmentStage

export const ENRICHMENT_PROGRESS_STAGES = [
  {
    name: 'queued',
    label: 'Queued',
    icon: '⏳',
    estimatedPercent: 5,
  },
  {
    name: 'scraping',
    label: 'Fetching content',
    icon: '🔍',
    estimatedPercent: 15,
  },
  {
    name: 'analyzing',
    label: 'Analyzing with AI',
    icon: '🧠',
    estimatedPercent: 35,
  },
  {
    name: 'extracting',
    label: 'Extracting insights',
    icon: '✨',
    estimatedPercent: 25,
  },
  {
    name: 'finalizing',
    label: 'Finalizing',
    icon: '📝',
    estimatedPercent: 20,
  },
] as const

export type EnrichmentProgressStage =
  (typeof ENRICHMENT_PROGRESS_STAGES)[number]['name']

export interface EnrichmentTiming {
  startedAt: number
  platform: string
  estimatedTotalMs: number
  scrapeMs?: number
  classifyMs?: number
  imageAnalysisMs?: number
  totalMs?: number
  completedAt?: number
  stageUpdatedAt?: number
}

export type ProcessingState =
  | 'idle'
  | 'processing'
  | 'slow'
  | 'stuck'
  | 'failed'

type EnrichmentMetadataLike = {
  processing?: boolean
  enrichmentStage?: string | null
  enrichmentTiming?: {
    startedAt?: number
    estimatedTotalMs?: number
  } | null
  enrichmentError?: string | null
  enrichmentFailedAt?: string | null
}

export const PLATFORM_HINTS: Record<
  string,
  { platform: string; guideline: string }
> = {
  'twitter.com': {
    platform: 'Twitter/X',
    guideline: "Focus: ideas, discourse. No 'twitter' tag.",
  },
  'x.com': {
    platform: 'Twitter/X',
    guideline: "Focus: ideas, discourse. No 'twitter' tag.",
  },
  'instagram.com': {
    platform: 'Instagram',
    guideline: "Focus: visual aesthetics, creator. No 'instagram' tag.",
  },
  'reddit.com': {
    platform: 'Reddit',
    guideline: "Focus: community topics. No 'reddit' tag.",
  },
  'youtube.com': {
    platform: 'YouTube',
    guideline: "Focus: creator, format, subject. No 'youtube' tag.",
  },
  'youtu.be': {
    platform: 'YouTube',
    guideline: "Focus: creator, format, subject. No 'youtube' tag.",
  },
  'github.com': {
    platform: 'GitHub',
    guideline: "Focus: tech stack, tools. No 'github' tag.",
  },
  'github.io': {
    platform: 'GitHub Pages',
    guideline: "Focus: tech stack, portfolio. No 'github' tag.",
  },
  'medium.com': {
    platform: 'Medium',
    guideline: "Focus: subject matter, expertise. No 'medium' tag.",
  },
  'substack.com': {
    platform: 'Substack',
    guideline: "Focus: subject matter, expertise. No 'substack' tag.",
  },
}

export function normalizeTag(tag: string): string {
  return tag
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[’'"`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeTagList(tags: string[]): string[] {
  const deduped: string[] = []
  const seen = new Set<string>()

  for (const tag of tags) {
    const normalized = normalizeTag(tag)
    if (!normalized || normalized.length < 2 || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    deduped.push(normalized)
  }

  return deduped
}

export function isAestheticTag(tag: string): boolean {
  return AESTHETIC_SET.has(normalizeTag(tag))
}

export function detectPlatformHint(url: string): {
  platform: string
  guideline: string
} {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    for (const [domain, hint] of Object.entries(PLATFORM_HINTS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return hint
      }
    }
  } catch {
    return {
      platform: 'General',
      guideline: 'Focus: core subject, key entities.',
    }
  }

  return {
    platform: 'General',
    guideline: 'Focus: core subject, key entities.',
  }
}

export function normalizeCardType(
  rawType: unknown,
  normalizer?: (type: string) => string
): CardType {
  const candidate = typeof rawType === 'string' ? rawType.trim().toLowerCase() : ''
  const mapped = normalizer?.(candidate) ?? mapCardType(candidate)
  const parsed = CardTypeSchema.safeParse(mapped)

  return parsed.success ? parsed.data : 'article'
}

function mapCardType(type: string): string {
  const typeMap: Record<string, CardType> = {
    article: 'article',
    blog: 'article',
    post: 'article',
    page: 'article',
    documentation: 'article',
    tutorial: 'article',
    image: 'image',
    photo: 'image',
    picture: 'image',
    screenshot: 'image',
    note: 'note',
    memo: 'note',
    thought: 'note',
    snippet: 'note',
    code: 'note',
    product: 'product',
    item: 'product',
    tool: 'product',
    software: 'product',
    app: 'product',
    book: 'book',
    ebook: 'book',
    pdf: 'book',
    document: 'book',
    video: 'video',
    youtube: 'video',
    vimeo: 'video',
    audio: 'audio',
    podcast: 'audio',
    music: 'audio',
    song: 'audio',
    social: 'social',
    twitter: 'social',
    instagram: 'social',
    reddit: 'social',
    linkedin: 'social',
    bluesky: 'social',
    mastodon: 'social',
    movie: 'movie',
    film: 'movie',
    imdb: 'movie',
    letterboxd: 'movie',
    website: 'website',
    link: 'website',
  }

  return typeMap[type] ?? 'article'
}

export function sanitizeTags(
  tags: string[],
  options: {
    contentType?: CardType
    maxTags?: number
    minTags?: number
    fallbackTags?: string[]
  } = {}
): string[] {
  const contentType = options.contentType ?? 'article'
  const maxTags = options.maxTags ?? TAG_LIMIT
  const minTags = options.minTags ?? MIN_TAGS
  const fallbackTags = options.fallbackTags ?? []

  const normalized = normalizeTagList(tags)
  const filtered = normalized.filter((tag) => !BLOCKED_TAGS.has(tag))
  const aesthetics = filtered.filter(isAestheticTag)
  const subjects = filtered.filter((tag) => !isAestheticTag(tag))

  const cleaned: string[] = [...subjects]
  const aesthetic =
    aesthetics[0] ?? DEFAULT_AESTHETIC_BY_CARD_TYPE[contentType] ?? 'editorial'

  const supplemental = normalizeTagList([
    ...fallbackTags,
    ...TYPE_FALLBACK_TAGS[contentType],
  ]).filter((tag) => !BLOCKED_TAGS.has(tag) && !isAestheticTag(tag))

  for (const tag of supplemental) {
    if (cleaned.length >= Math.max(0, minTags - 1)) {
      break
    }
    if (!cleaned.includes(tag)) {
      cleaned.push(tag)
    }
  }

  const limitedSubjects = cleaned.slice(0, Math.max(0, maxTags - 1))
  return normalizeTagList([...limitedSubjects, aesthetic]).slice(0, maxTags)
}

export function validateTags(tags: string[], contentType?: CardType): string[] {
  return sanitizeTags(tags, { contentType })
}

function extractInstagramShortcode(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url)
    if (!parsed.hostname.toLowerCase().includes('instagram.com')) {
      return null
    }

    const match = parsed.pathname.match(/^\/(?:p|reel|reels|tv)\/([^/?#]+)/i)
    return match?.[1] ? normalizeTag(match[1]) : null
  } catch {
    return null
  }
}

function addBlockedGeneratedTag(blocked: Set<string>, value: string | null | undefined) {
  if (!value) {
    return
  }

  const normalized = normalizeTag(value)
  if (normalized) {
    blocked.add(normalized)
  }
}

function inferGeneratedTagPlatform(
  explicitPlatform: string | null | undefined,
  url: string | null | undefined
): string {
  const normalizedPlatform = normalizeTag(explicitPlatform || '')
  if (normalizedPlatform) {
    return normalizedPlatform
  }

  if (!url) {
    return ''
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('instagram.com')) return 'instagram'
    if (hostname.includes('twitter.com')) return 'twitter'
    if (hostname.includes('x.com')) return 'x'
    if (hostname.includes('reddit.com')) return 'reddit'
    if (hostname.includes('tiktok.com')) return 'tiktok'
  } catch {
    return ''
  }

  return ''
}

type GeneratedTagContext = {
  contentType?: CardType
  platform?: string | null
  url?: string | null
  authorHandle?: string | null
  authorName?: string | null
}

function buildBlockedGeneratedTags(options: GeneratedTagContext): Set<string> {
  const blocked = new Set<string>()
  const platform = inferGeneratedTagPlatform(options.platform, options.url)

  if (platform === 'instagram') {
    addBlockedGeneratedTag(blocked, extractInstagramShortcode(options.url))
  }

  if (
    platform === 'instagram' ||
    platform === 'twitter' ||
    platform === 'twitter-x' ||
    platform === 'x' ||
    platform === 'reddit' ||
    platform === 'tiktok'
  ) {
    addBlockedGeneratedTag(blocked, options.authorHandle)
    addBlockedGeneratedTag(blocked, options.authorName)
  }

  return blocked
}

export function stripGeneratedTagNoise(
  tags: string[],
  options: GeneratedTagContext = {}
): string[] {
  const blocked = buildBlockedGeneratedTags(options)

  return normalizeTagList(tags).filter(
    (tag) => !BLOCKED_TAGS.has(tag) && !blocked.has(normalizeTag(tag))
  )
}

export function sanitizeGeneratedTags(
  tags: string[],
  options: GeneratedTagContext = {}
): string[] {
  const platform = inferGeneratedTagPlatform(options.platform, options.url)
  const fallbackTags: string[] = []

  if (platform === 'twitter' || platform === 'twitter-x' || platform === 'x') {
    fallbackTags.push('conversation', 'public-note')
  }

  if (platform === 'reddit') {
    fallbackTags.push('discussion', 'community')
  }

  if (platform === 'tiktok') {
    fallbackTags.push('short-form', 'visual-inspiration')
  }

  if (platform === 'instagram') {
    fallbackTags.push('composition', 'visual-inspiration')
  }

  const cleaned = stripGeneratedTagNoise(tags, options)
  return sanitizeTags(cleaned, {
    contentType: options.contentType,
    fallbackTags,
  })
}

export function buildClassificationResult(
  value: unknown,
  options: { normalizeType?: (type: string) => string } = {}
): ClassificationResult {
  const parsed = RAW_CLASSIFICATION_RESULT_SCHEMA.parse(value)
  const type = normalizeCardType(parsed.type, options.normalizeType)
  const title = parsed.title.trim().slice(0, 120)
  const summary = (parsed.summary.trim() || title).slice(0, 500)
  const tags = sanitizeTags(parsed.tags, { contentType: type })
  const platform = parsed.platform?.trim() || undefined

  return ClassificationResultSchema.parse({
    type,
    title,
    summary,
    tags,
    platform,
  })
}

export function buildClientClassification(value: unknown): ClientClassification {
  return ClientClassificationSchema.parse({
    ...buildClassificationResult(value),
    source: 'local-ai',
  })
}

export function flattenDSPyTags(
  value: unknown,
  contentType: CardType = 'article'
): { tags: string[]; confidence: number; reasoning?: string } {
  const parsed = DSPyTagsResponseSchema.parse(value)
  const rawTags = [
    ...parsed.tags.primary,
    ...parsed.tags.contextual,
    parsed.tags.vibe,
  ].filter(Boolean)

  return {
    tags: sanitizeTags(rawTags, { contentType }),
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
  }
}

export function normalizeTitleSource(source: string | null | undefined): TitleSource | undefined {
  if (!source) return undefined
  if (source === 'ai') return 'glm'

  const parsed = TitleSourceSchema.safeParse(source)
  return parsed.success ? parsed.data : undefined
}

export function normalizeEnrichmentStage(
  stage: string | null | undefined
): EnrichmentStage | undefined {
  if (!stage) return undefined

  switch (stage) {
    case 'pending':
    case 'processing':
      return 'queued'
    case 'fetching':
      return 'scraping'
    case 'classifying':
      return 'analyzing'
    case 'fallback':
      return 'complete'
    default: {
      const parsed = EnrichmentStageSchema.safeParse(stage)
      return parsed.success ? parsed.data : undefined
    }
  }
}

export function toProgressEnrichmentStage(
  stage: string | null | undefined
): EnrichmentProgressStage | undefined {
  const normalized = normalizeEnrichmentStage(stage)

  if (!normalized) return undefined
  if (normalized === 'complete' || normalized === 'failed') {
    return 'finalizing'
  }

  return normalized
}

export function isTerminalEnrichmentStage(
  stage: string | null | undefined
): boolean {
  const normalized = normalizeEnrichmentStage(stage)
  return normalized === 'complete' || normalized === 'failed'
}

const PLATFORM_BASE_TIMES: Record<string, number> = {
  youtube: 6000,
  twitter: 5000,
  reddit: 6000,
  imdb: 7000,
  letterboxd: 7000,
  goodreads: 8000,
  amazon: 8000,
  storygraph: 8000,
  wikipedia: 6000,
  instagram: 15000,
  tiktok: 12000,
  generic: 10000,
}

const TIME_PER_1000_CHARS = 500
const IMAGE_ANALYSIS_TIME = 3000

export function estimateEnrichmentTime(
  platform: string,
  contentLength = 0,
  hasImage = false,
  imageCount = 1
): number {
  const baseTime =
    PLATFORM_BASE_TIMES[platform.toLowerCase()] ?? PLATFORM_BASE_TIMES.generic
  const contentFactor = Math.floor(contentLength / 1000) * TIME_PER_1000_CHARS
  const imageFactor = hasImage
    ? IMAGE_ANALYSIS_TIME * Math.min(imageCount, 3)
    : 0

  return baseTime + contentFactor + imageFactor
}

export function getStageIndex(stageName: string): number {
  const progressStage = toProgressEnrichmentStage(stageName)
  if (!progressStage) return -1

  return ENRICHMENT_PROGRESS_STAGES.findIndex(
    (stage) => stage.name === progressStage
  )
}

export function getEnrichmentProgress(
  elapsedMs: number,
  estimatedTotalMs: number
): {
  stage: (typeof ENRICHMENT_PROGRESS_STAGES)[number]
  stageIndex: number
  overallProgress: number
  stageProgress: number
  remainingMs: number
} {
  const overallProgress = Math.min(elapsedMs / estimatedTotalMs, 0.95)
  let accumulatedPercent = 0
  let stageIndex = 0
  let stageProgress = 0

  for (let i = 0; i < ENRICHMENT_PROGRESS_STAGES.length; i++) {
    const stage = ENRICHMENT_PROGRESS_STAGES[i]
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

  if (stageIndex >= ENRICHMENT_PROGRESS_STAGES.length) {
    stageIndex = ENRICHMENT_PROGRESS_STAGES.length - 1
  }

  return {
    stage: ENRICHMENT_PROGRESS_STAGES[stageIndex],
    stageIndex,
    overallProgress,
    stageProgress: Math.min(stageProgress, 1),
    remainingMs: Math.max(0, estimatedTotalMs - elapsedMs),
  }
}

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

export function createEnrichmentTiming(
  platform: string,
  contentLength = 0,
  hasImage = false,
  imageCount = 1
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

export const STUCK_TIMEOUT_MS = 2 * 60 * 1000
export const SLOW_TIMEOUT_MS = 2 * 60 * 1000

export function isEnrichmentStuck(
  metadata: EnrichmentMetadataLike | null | undefined
): { stuck: boolean; failed: boolean; elapsedMs: number } {
  if (!metadata?.processing) {
    return { stuck: false, failed: false, elapsedMs: 0 }
  }

  const startedAt = metadata.enrichmentTiming?.startedAt
  const elapsedMs = startedAt ? Date.now() - startedAt : 0

  if (
    metadata.enrichmentError ||
    metadata.enrichmentFailedAt ||
    normalizeEnrichmentStage(metadata.enrichmentStage) === 'failed'
  ) {
    return { stuck: true, failed: true, elapsedMs }
  }

  if (!startedAt) {
    return { stuck: false, failed: false, elapsedMs: 0 }
  }

  return {
    stuck: elapsedMs > STUCK_TIMEOUT_MS,
    failed: false,
    elapsedMs,
  }
}

export function getProcessingState(
  metadata: EnrichmentMetadataLike | null | undefined
): ProcessingState {
  const stage = normalizeEnrichmentStage(metadata?.enrichmentStage)

  if (stage === 'failed' || metadata?.enrichmentError || metadata?.enrichmentFailedAt) {
    return 'failed'
  }

  if (!metadata?.processing || stage === 'complete') {
    return 'idle'
  }

  const { stuck, elapsedMs } = isEnrichmentStuck(metadata)
  if (stuck) {
    return 'stuck'
  }

  const estimatedMs = metadata.enrichmentTiming?.estimatedTotalMs || 15000
  const slowThreshold = Math.max(SLOW_TIMEOUT_MS, estimatedMs * 2)
  if (elapsedMs > slowThreshold) {
    return 'slow'
  }

  return 'processing'
}

export function hexToColorName(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))

  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }

  if (s < 0.1) {
    if (l < 0.15) return 'black'
    if (l < 0.35) return 'charcoal'
    if (l < 0.55) return 'gray'
    if (l < 0.75) return 'silver'
    if (l < 0.9) return 'light-gray'
    return 'white'
  }

  if (h < 15) return l < 0.4 ? 'maroon' : s > 0.6 ? 'red' : 'coral'
  if (h < 40) return l < 0.4 ? 'brown' : s > 0.6 ? 'orange' : 'peach'
  if (h < 55) return s > 0.6 ? 'gold' : 'tan'
  if (h < 75) return l < 0.4 ? 'olive' : 'yellow'
  if (h < 160) return l < 0.35 ? 'forest-green' : s > 0.5 ? 'green' : 'sage'
  if (h < 195) return s > 0.5 ? 'teal' : 'mint'
  if (h < 230) return l < 0.35 ? 'navy' : s > 0.5 ? 'blue' : 'steel-blue'
  if (h < 265) return l < 0.35 ? 'indigo' : 'purple'
  if (h < 295) return s > 0.5 ? 'violet' : 'lavender'
  if (h < 335) return l < 0.4 ? 'burgundy' : s > 0.6 ? 'magenta' : 'pink'
  return l < 0.4 ? 'maroon' : s > 0.6 ? 'red' : 'coral'
}
