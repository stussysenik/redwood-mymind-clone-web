export const SEARCH_SIGNAL_WEIGHTS = {
  exactTitle: 10,
  exactTag: 8,
  titlePrefix: 4,
  titleLike: 2,
  contentLike: 1,
  textRankMultiplier: 12,
  semanticSignalMultiplier: 8,
  similarSemanticWeight: 0.6,
  similarTagWeight: 0.4,
} as const

export type RetrievalSignalName = 'keyword' | 'tag' | 'semantic'

export interface RetrievalReason {
  signal: RetrievalSignalName
  label: string
  score: number
}

export interface RetrievalSignals {
  keyword: number
  tag: number
  semantic: number
  total: number
}

type KeywordSignalRow = {
  text_rank?: number | string | null
  exact_title_match?: boolean | null
  title_prefix_match?: boolean | null
  title_like_match?: boolean | null
  content_like_match?: boolean | null
  exact_tag_match?: boolean | null
}

function withTotal(signals: Omit<RetrievalSignals, 'total'>): RetrievalSignals {
  return {
    ...signals,
    total: signals.keyword + signals.tag + signals.semantic,
  }
}

export function buildKeywordAndTagSignals(row: KeywordSignalRow): {
  signals: RetrievalSignals
  reasons: RetrievalReason[]
} {
  const textRank = Number(row.text_rank || 0)
  const reasons: RetrievalReason[] = []

  let keyword = 0
  let tag = 0

  if (row.exact_title_match) {
    keyword += SEARCH_SIGNAL_WEIGHTS.exactTitle
    reasons.push({
      signal: 'keyword',
      label: 'exact-title-match',
      score: SEARCH_SIGNAL_WEIGHTS.exactTitle,
    })
  }

  if (row.title_prefix_match) {
    keyword += SEARCH_SIGNAL_WEIGHTS.titlePrefix
    reasons.push({
      signal: 'keyword',
      label: 'title-prefix-match',
      score: SEARCH_SIGNAL_WEIGHTS.titlePrefix,
    })
  }

  if (row.title_like_match) {
    keyword += SEARCH_SIGNAL_WEIGHTS.titleLike
    reasons.push({
      signal: 'keyword',
      label: 'title-like-match',
      score: SEARCH_SIGNAL_WEIGHTS.titleLike,
    })
  }

  if (row.content_like_match) {
    keyword += SEARCH_SIGNAL_WEIGHTS.contentLike
    reasons.push({
      signal: 'keyword',
      label: 'content-like-match',
      score: SEARCH_SIGNAL_WEIGHTS.contentLike,
    })
  }

  if (textRank > 0) {
    const textRankScore = textRank * SEARCH_SIGNAL_WEIGHTS.textRankMultiplier
    keyword += textRankScore
    reasons.push({
      signal: 'keyword',
      label: 'full-text-rank',
      score: Number(textRankScore.toFixed(4)),
    })
  }

  if (row.exact_tag_match) {
    tag += SEARCH_SIGNAL_WEIGHTS.exactTag
    reasons.push({
      signal: 'tag',
      label: 'exact-tag-match',
      score: SEARCH_SIGNAL_WEIGHTS.exactTag,
    })
  }

  return {
    signals: withTotal({
      keyword,
      tag,
      semantic: 0,
    }),
    reasons,
  }
}

export function addSemanticSignal(
  currentSignals: RetrievalSignals,
  semanticScore: number,
  reasons: RetrievalReason[]
): {
  signals: RetrievalSignals
  reasons: RetrievalReason[]
} {
  const semantic = Math.max(
    currentSignals.semantic,
    semanticScore * SEARCH_SIGNAL_WEIGHTS.semanticSignalMultiplier
  )
  const nextReasons = reasons.filter(
    (reason) =>
      !(reason.signal === 'semantic' && reason.label === 'semantic-similarity')
  )

  if (semanticScore > 0) {
    nextReasons.push({
      signal: 'semantic',
      label: 'semantic-similarity',
      score: Number(semantic.toFixed(4)),
    })
  }

  return {
    signals: withTotal({
      keyword: currentSignals.keyword,
      tag: currentSignals.tag,
      semantic,
    }),
    reasons: nextReasons,
  }
}

export function summarizeReasons(reasons: RetrievalReason[]): string[] {
  return reasons.map((reason) => `${reason.label}:${reason.score}`)
}
