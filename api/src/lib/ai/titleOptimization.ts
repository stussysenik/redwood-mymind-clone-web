export type TitleCandidateSource =
  | 'existing'
  | 'scraped'
  | 'classification'
  | 'local-ai'
  | 'dspy'
  | 'heuristic'

export type TitleCandidateInput = {
  title?: string | null
  source: TitleCandidateSource
  confidence?: number | null
}

export type RankedTitleCandidate = {
  title: string
  source: TitleCandidateSource
  confidence: number | null
  score: number
}

const GENERIC_TITLES = new Set([
  'untitled',
  'untitled note',
  'link',
  'saved link',
  'saved item',
  'website',
  'instagram post',
  'twitter post',
  'x post',
])

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripWrappingPunctuation(value: string): string {
  return value.replace(/^["'`]+|["'`]+$/g, '').trim()
}

function stripAuthorPrefix(value: string, author: string | null | undefined): string {
  if (!author) {
    return value
  }

  const normalizedAuthor = collapseWhitespace(author.replace(/^@/, ''))
  const authorVariants = [
    normalizedAuthor,
    normalizedAuthor.toLowerCase(),
    `@${normalizedAuthor}`,
    `@${normalizedAuthor.toLowerCase()}`,
  ]

  for (const variant of authorVariants) {
    if (value.toLowerCase().startsWith(variant.toLowerCase())) {
      return value.slice(variant.length).replace(/^[\s\-:|·]+/, '').trim()
    }
  }

  return value
}

export function normalizeTitleText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = stripWrappingPunctuation(collapseWhitespace(value))
  return normalized || null
}

export function isWeakTitle(value: string | null | undefined): boolean {
  const normalized = normalizeTitleText(value)
  if (!normalized) {
    return true
  }

  const lower = normalized.toLowerCase()
  if (GENERIC_TITLES.has(lower)) {
    return true
  }

  if (lower.startsWith('untitled')) {
    return true
  }

  if (/^https?:\/\//i.test(normalized)) {
    return true
  }

  if (normalized.length < 5) {
    return true
  }

  return false
}

function titleSourceScore(source: TitleCandidateSource): number {
  switch (source) {
    case 'dspy':
      return 18
    case 'scraped':
      return 14
    case 'local-ai':
      return 12
    case 'classification':
      return 10
    case 'heuristic':
      return 6
    case 'existing':
      return 4
  }
}

function scoreTitleCandidate(candidate: TitleCandidateInput): number {
  const title = normalizeTitleText(candidate.title)
  if (!title) {
    return Number.NEGATIVE_INFINITY
  }

  let score = titleSourceScore(candidate.source)
  score += Math.min(title.length, 90)

  if (!isWeakTitle(title)) {
    score += 100
  } else {
    score -= 100
  }

  if (title.length >= 16 && title.length <= 90) {
    score += 12
  }

  if (/[A-Za-z]/.test(title)) {
    score += 4
  }

  if (/[:\-|]/.test(title)) {
    score += 4
  }

  if (candidate.confidence) {
    score += candidate.confidence * 20
  }

  return score
}

export function buildHeuristicSourceTitle(args: {
  content?: string | null
  summary?: string | null
  url?: string | null
  author?: string | null
}): string | null {
  const textCandidate = normalizeTitleText(
    stripAuthorPrefix(
      args.content?.split('\n')[0] || args.summary?.split('\n')[0] || '',
      args.author
    )
  )

  if (textCandidate && !isWeakTitle(textCandidate)) {
    return textCandidate.slice(0, 90).trim()
  }

  if (args.url) {
    try {
      const parsed = new URL(args.url)
      const slug = parsed.pathname
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]+/g, ' ')
      const normalizedSlug = normalizeTitleText(slug)
      if (normalizedSlug && !isWeakTitle(normalizedSlug)) {
        return normalizedSlug.slice(0, 90).trim()
      }
    } catch {
      // Ignore invalid URLs and fall through
    }
  }

  return textCandidate || null
}

export function rankTitleCandidates(
  candidates: TitleCandidateInput[]
): RankedTitleCandidate[] {
  const deduped = new Map<string, RankedTitleCandidate>()

  for (const candidate of candidates) {
    const title = normalizeTitleText(candidate.title)
    if (!title) {
      continue
    }

    const ranked: RankedTitleCandidate = {
      title,
      source: candidate.source,
      confidence:
        typeof candidate.confidence === 'number' ? candidate.confidence : null,
      score: scoreTitleCandidate({ ...candidate, title }),
    }

    const existing = deduped.get(title.toLowerCase())
    if (!existing || ranked.score > existing.score) {
      deduped.set(title.toLowerCase(), ranked)
    }
  }

  return Array.from(deduped.values()).sort((left, right) => right.score - left.score)
}

export function pickBestTitleCandidate(
  candidates: TitleCandidateInput[]
): { selected: RankedTitleCandidate | null; candidates: RankedTitleCandidate[] } {
  const ranked = rankTitleCandidates(candidates)
  return {
    selected: ranked[0] || null,
    candidates: ranked,
  }
}

export function toPersistedTitleSource(
  source: TitleCandidateSource | null | undefined
): 'scraped' | 'dspy' | 'glm' | 'fallback' | 'local-ai' {
  switch (source) {
    case 'scraped':
      return 'scraped'
    case 'dspy':
      return 'dspy'
    case 'local-ai':
      return 'local-ai'
    case 'heuristic':
      return 'fallback'
    case 'classification':
      return 'glm'
    case 'existing':
    default:
      return 'scraped'
  }
}
