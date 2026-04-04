import type { QueryResolvers } from 'types/graphql'

import { Prisma } from '@prisma/client'

import {
  getEmbeddingAvailability,
  getEmbeddingCompatibility,
} from 'src/lib/ai/embeddings'
import { querySemanticSimilar } from 'src/lib/ai/vectorStore'
import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'
import { normalizeTag, stripGeneratedTagNoise } from 'src/lib/semantic'

import {
  SEARCH_SIGNAL_WEIGHTS,
  addSemanticSignal,
  buildKeywordAndTagSignals,
  summarizeReasons,
  type RetrievalReason,
  type RetrievalSignals,
} from './retrievalContract'

const normalizeSearchToken = (value: string) => value.trim().replace(/^#+/, '')
const normalizeTagToken = (value: string) =>
  normalizeTag(normalizeSearchToken(value))

type SearchCardsArgs = {
  query?: string | null
  type?: string | null
  tag?: string | null
  limit?: number | null
  mode?: string | null
}

type SearchRow = {
  id: string
  user_id: string
  type: string
  title: string | null
  content: string | null
  url: string | null
  image_url: string | null
  metadata: Record<string, unknown> | null
  tags: string[] | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  archived_at: Date | null
  text_rank?: number | string | null
  exact_title_match?: boolean | null
  title_prefix_match?: boolean | null
  title_like_match?: boolean | null
  content_like_match?: boolean | null
  exact_tag_match?: boolean | null
}

type SearchCardRecord = {
  id: string
  userId: string
  type: string
  title: string | null
  content: string | null
  url: string | null
  imageUrl: string | null
  metadata: Record<string, unknown>
  tags: string[]
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  archivedAt: Date | null
}

type SearchDiagnostics = {
  query: string | null
  normalizedQueryTag: string | null
  tagFilter: string | null
  embedding: ReturnType<typeof getEmbeddingCompatibility>
  candidateCounts: {
    keyword: number
    semantic: number
    ranked: number
  }
  skipped: Array<{
    stage: 'semantic'
    reason: string
    ids?: string[]
  }>
  results: Array<{
    rank: number
    id: string
    title: string | null
    url: string | null
    tags: string[]
    embeddingStatus: string | null
    embeddingProvider: string | null
    embeddingModel: string | null
    embeddingDimension: number | null
    signals: RetrievalSignals
    reasons: string[]
  }>
}

type SearchCardsDetailedResult = {
  cards: SearchCardRecord[]
  total: number
  mode: 'browse' | 'search' | 'semantic-hybrid'
  diagnostics: SearchDiagnostics | null
}

function getVisibleTags(
  tags: string[] | null | undefined,
  metadata: Record<string, unknown> | null,
  url: string | null
) {
  const authorHandle =
    typeof metadata?.authorHandle === 'string'
      ? metadata.authorHandle
      : typeof metadata?.author === 'string'
        ? metadata.author
        : null
  const authorName =
    typeof metadata?.authorName === 'string' ? metadata.authorName : null
  const platform =
    typeof metadata?.platform === 'string' ? metadata.platform : null

  return stripGeneratedTagNoise(tags || [], {
    platform,
    url,
    authorHandle,
    authorName,
  })
}

function mapSearchRow(row: SearchRow) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    content: row.content,
    url: row.url,
    imageUrl: row.image_url,
    metadata: row.metadata || {},
    tags: getVisibleTags(row.tags, row.metadata, row.url),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    archivedAt: row.archived_at,
  }
}

function mapCardRecord(card: {
  id: string
  userId: string
  type: string
  title: string | null
  content: string | null
  url: string | null
  imageUrl: string | null
  metadata: unknown
  tags: string[]
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  archivedAt: Date | null
}): SearchCardRecord {
  const metadata =
    card.metadata &&
    typeof card.metadata === 'object' &&
    !Array.isArray(card.metadata)
      ? (card.metadata as Record<string, unknown>)
      : {}

  return {
    ...card,
    metadata,
    tags: getVisibleTags(card.tags, metadata, card.url),
  }
}

function buildKeywordWhereSql(
  userId: string,
  type: string | null | undefined,
  normalizedFilterTag: string | null,
  mode?: string | null
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`user_id = ${userId}`,
  ]

  if (mode === 'ARCHIVE') {
    clauses.push(Prisma.sql`archived_at IS NOT NULL`)
    clauses.push(Prisma.sql`deleted_at IS NULL`)
  } else if (mode === 'TRASH') {
    clauses.push(Prisma.sql`deleted_at IS NOT NULL`)
  } else {
    clauses.push(Prisma.sql`archived_at IS NULL`)
    clauses.push(Prisma.sql`deleted_at IS NULL`)
  }

  if (type) {
    clauses.push(Prisma.sql`type = ${type}`)
  }

  if (normalizedFilterTag) {
    clauses.push(
      Prisma.sql`EXISTS (
        SELECT 1
        FROM unnest(tags) AS tag_filter_value
        WHERE lower(tag_filter_value) = ${normalizedFilterTag}
      )`
    )
  }

  return Prisma.join(clauses, ' AND ')
}

export const searchCardsForUserDetailed = async (
  userId: string,
  { query, type, tag, limit = 50, mode: searchMode }: SearchCardsArgs
): Promise<SearchCardsDetailedResult> => {
  const hasSearchQuery = !!query?.trim()
  const effectiveLimit = Math.min(Math.max(limit ?? 50, 1), 100)

  const where: any = {
    userId,
  }

  if (searchMode === 'ARCHIVE') {
    where.archivedAt = { not: null }
    where.deletedAt = null
  } else if (searchMode === 'TRASH') {
    where.deletedAt = { not: null }
  } else {
    where.deletedAt = null
    where.archivedAt = null
  }

  if (type) {
    where.type = type
  }

  if (tag) {
    where.tags = { has: normalizeTagToken(tag) }
  }

  let cards: SearchCardRecord[] = []
  let total = 0
  let mode: SearchCardsDetailedResult['mode'] = 'browse'
  let diagnostics: SearchDiagnostics | null = null

  if (hasSearchQuery) {
    const searchQuery = normalizeSearchToken(query)
    const likePattern = `%${searchQuery}%`
    const titlePrefixPattern = `${searchQuery}%`
    const normalizedQueryTag = normalizeTagToken(searchQuery)
    const normalizedFilterTag = tag ? normalizeTagToken(tag) : null
    const keywordCandidateLimit = Math.min(
      Math.max(effectiveLimit * 4, 32),
      120
    )
    const embeddingAvailability = getEmbeddingAvailability()
    const embeddingCompatibility = getEmbeddingCompatibility()
    const keywordWhereSql = buildKeywordWhereSql(
      userId,
      type,
      normalizedFilterTag,
      searchMode
    )
    const skipped: SearchDiagnostics['skipped'] = []

    const keywordRows = await db.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT
        *,
        ts_rank_cd(
          to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')),
          websearch_to_tsquery('english', ${searchQuery})
        ) AS text_rank,
        LOWER(COALESCE(title, '')) = LOWER(${searchQuery}) AS exact_title_match,
        COALESCE(title, '') ILIKE ${titlePrefixPattern} AS title_prefix_match,
        COALESCE(title, '') ILIKE ${likePattern} AS title_like_match,
        COALESCE(content, '') ILIKE ${likePattern} AS content_like_match,
        EXISTS (
          SELECT 1
          FROM unnest(tags) AS tag_value
          WHERE lower(tag_value) = ${normalizedQueryTag}
        ) AS exact_tag_match
      FROM cards
      WHERE ${keywordWhereSql}
        AND (
          to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, ''))
            @@ websearch_to_tsquery('english', ${searchQuery})
          OR COALESCE(title, '') ILIKE ${likePattern}
          OR COALESCE(content, '') ILIKE ${likePattern}
          OR EXISTS (
            SELECT 1
            FROM unnest(tags) AS tag_value
            WHERE lower(tag_value) = ${normalizedQueryTag}
          )
        )
      ORDER BY
        exact_title_match DESC,
        exact_tag_match DESC,
        title_prefix_match DESC,
        text_rank DESC,
        created_at DESC
      LIMIT ${keywordCandidateLimit}
    `)

    const rankedCards = new Map<
      string,
      {
        card: SearchCardRecord
        signals: RetrievalSignals
        reasons: RetrievalReason[]
      }
    >()

    for (const row of keywordRows) {
      const card = mapSearchRow(row)
      const { signals, reasons } = buildKeywordAndTagSignals(row)
      rankedCards.set(card.id, {
        card,
        signals,
        reasons,
      })
    }

    let semanticCount = 0
    let appliedSemanticCount = 0
    if (embeddingAvailability.configured) {
      try {
        const semanticMatches = await querySemanticSimilar(
          userId,
          searchQuery,
          Math.min(Math.max(effectiveLimit * 3, 24), 80)
        )
        semanticCount = semanticMatches.length

        const missingSemanticIds = semanticMatches
          .map((match) => match.id)
          .filter((id) => !rankedCards.has(id))

        let fetchedSemanticCards: SearchCardRecord[] = []
        if (missingSemanticIds.length > 0) {
          const semanticCards = await db.card.findMany({
            where: {
               ...where,
              ...(type ? { type } : {}),
              ...(normalizedFilterTag
                ? {
                    tags: {
                      has: normalizedFilterTag,
                    },
                  }
                : {}),
              id: {
                in: missingSemanticIds,
              },
            },
          })
          fetchedSemanticCards = semanticCards.map((card) =>
            mapCardRecord(card)
          )
        }

        const fetchedById = new Map(
          fetchedSemanticCards.map((card) => [card.id, card])
        )
        const unresolvedSemanticIds = missingSemanticIds.filter(
          (id) => !fetchedById.has(id)
        )

        if (unresolvedSemanticIds.length > 0) {
          skipped.push({
            stage: 'semantic',
            reason:
              normalizedFilterTag || type
                ? 'semantic matches were excluded by the current filters'
                : 'semantic matches could not be loaded as visible cards',
            ids: unresolvedSemanticIds,
          })
        }

        for (const match of semanticMatches) {
          const existing = rankedCards.get(match.id)
          if (existing) {
            const updated = addSemanticSignal(
              existing.signals,
              match.score,
              existing.reasons
            )
            existing.signals = updated.signals
            existing.reasons = updated.reasons
            appliedSemanticCount += 1
            continue
          }

          const card = fetchedById.get(match.id)
          if (!card) {
            continue
          }

          const updated = addSemanticSignal(
            {
              keyword: 0,
              tag: 0,
              semantic: 0,
              total: 0,
            },
            match.score,
            []
          )

          rankedCards.set(match.id, {
            card,
            signals: updated.signals,
            reasons: updated.reasons,
          })
          appliedSemanticCount += 1
        }
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : 'Semantic search failed during query execution'
        skipped.push({
          stage: 'semantic',
          reason,
        })
        logger.warn(
          { query: searchQuery, err: error },
          'Semantic search failed, falling back to keyword ranking'
        )
      }
    } else {
      skipped.push({
        stage: 'semantic',
        reason:
          embeddingCompatibility.reason || 'Semantic retrieval is unavailable',
      })
    }

    const rankedEntries = Array.from(rankedCards.values()).sort(
      (left, right) => {
        if (right.signals.total !== left.signals.total) {
          return right.signals.total - left.signals.total
        }

        return (
          new Date(right.card.createdAt).getTime() -
          new Date(left.card.createdAt).getTime()
        )
      }
    )

    const limitedEntries = rankedEntries.slice(0, effectiveLimit)
    cards = limitedEntries.map((entry) => entry.card)
    total = rankedCards.size
    mode = appliedSemanticCount > 0 ? 'semantic-hybrid' : 'search'
    diagnostics = {
      query: searchQuery,
      normalizedQueryTag,
      tagFilter: normalizedFilterTag,
      embedding: embeddingCompatibility,
      candidateCounts: {
        keyword: keywordRows.length,
        semantic: semanticCount,
        ranked: rankedCards.size,
      },
      skipped,
      results: limitedEntries.map((entry, index) => ({
        rank: index + 1,
        id: entry.card.id,
        title: entry.card.title,
        url: entry.card.url,
        tags: entry.card.tags,
        embeddingStatus:
          typeof entry.card.metadata.embeddingStatus === 'string'
            ? entry.card.metadata.embeddingStatus
            : null,
        embeddingProvider:
          typeof entry.card.metadata.embeddingProvider === 'string'
            ? entry.card.metadata.embeddingProvider
            : null,
        embeddingModel:
          typeof entry.card.metadata.embeddingModel === 'string'
            ? entry.card.metadata.embeddingModel
            : null,
        embeddingDimension:
          typeof entry.card.metadata.embeddingDimension === 'number'
            ? entry.card.metadata.embeddingDimension
            : null,
        signals: entry.signals,
        reasons: summarizeReasons(entry.reasons),
      })),
    }

    logger.info(
      {
        query: searchQuery,
        type: type || null,
        tag: normalizedFilterTag,
        keywordCount: keywordRows.length,
        semanticCount,
        embedding: embeddingCompatibility,
        topResults: diagnostics.results.slice(0, 5),
      },
      'searchCards ranked results'
    )
  } else {
    const browseCards = await db.card.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: effectiveLimit,
    })
    cards = browseCards.map((card) => mapCardRecord(card))
    total = cards.length
  }

  return {
    cards,
    total,
    mode,
    diagnostics,
  }
}

export const searchCardsForUser = async (
  userId: string,
  args: SearchCardsArgs
) => {
  const { cards, total, mode: resultMode } = await searchCardsForUserDetailed(userId, args)

  return {
    cards,
    total,
    mode: resultMode,
  }
}

export const searchCards: QueryResolvers['searchCards'] = async ({
  query,
  type,
  tag,
  limit = 50,
  mode,
}) =>
  searchCardsForUser(context.currentUser!.id, {
    query,
    type,
    tag,
    limit,
    mode,
  })

/**
 * Hybrid similar-cards query.
 *
 * Combines two signals with configurable weights:
 *   - Embedding cosine similarity via pgvector (<-> L2 distance, converted)
 *   - Tag overlap via Jaccard index (|intersection| / |union|)
 *
 * The raw SQL query handles the full scoring in Postgres so we only
 * transfer the final top-N rows over the wire.
 */
export const similarCards: QueryResolvers['similarCards'] = async ({
  cardId,
  limit = 6,
}) => {
  const userId = context.currentUser!.id

  const sourceCard = await db.card.findFirst({
    where: { id: cardId, userId },
  })

  if (!sourceCard) {
    throw new Error('Card not found')
  }

  const sourceTags = getVisibleTags(
    (sourceCard.tags as string[]) || [],
    (sourceCard.metadata as Record<string, unknown> | null) || {},
    sourceCard.url
  )
  const candidatePool = Math.max(limit * 4, 24)

  try {
    const hasEmbedding = await db.$queryRaw<{ has: boolean }[]>`
      SELECT (embedding IS NOT NULL) AS has
      FROM cards
      WHERE id = ${cardId}::uuid
      LIMIT 1
    `

    const sourceHasEmbedding = hasEmbedding.length > 0 && hasEmbedding[0].has
    let rows: any[]

    if (sourceHasEmbedding && sourceTags.length > 0) {
      rows = await db.$queryRaw<any[]>`
        WITH source AS (
          SELECT embedding, tags
          FROM cards
          WHERE id = ${cardId}::uuid
        ),
        candidates AS (
          SELECT
            c.id,
            c.user_id,
            c.type,
            c.title,
            c.content,
            c.url,
            c.image_url,
            c.metadata,
            c.tags,
            c.created_at,
            c.updated_at,
            c.deleted_at,
            c.archived_at,
            1 - POWER(c.embedding <-> s.embedding, 2) / 2 AS semantic_signal,
            CASE
              WHEN cardinality(c.tags) = 0 AND cardinality(s.tags) = 0 THEN 0.0
              ELSE (
                SELECT COUNT(*)::float
                FROM unnest(c.tags) ct
                WHERE ct = ANY(s.tags)
              ) / GREATEST(
                (
                  SELECT COUNT(DISTINCT val)::float
                  FROM (
                    SELECT unnest(c.tags) AS val
                    UNION
                    SELECT unnest(s.tags) AS val
                  ) u
                ),
                1.0
              )
            END AS tag_signal
          FROM cards c, source s
          WHERE c.user_id = ${userId}
            AND c.id != ${cardId}::uuid
            AND c.deleted_at IS NULL
            AND c.archived_at IS NULL
            AND c.embedding IS NOT NULL
          ORDER BY c.embedding <-> s.embedding
          LIMIT ${candidatePool}
        )
        SELECT *,
          ${SEARCH_SIGNAL_WEIGHTS.similarSemanticWeight} * semantic_signal +
          ${SEARCH_SIGNAL_WEIGHTS.similarTagWeight} * tag_signal AS hybrid_score
        FROM candidates
        ORDER BY hybrid_score DESC
        LIMIT ${limit}
      `
    } else if (sourceHasEmbedding) {
      rows = await db.$queryRaw<any[]>`
        WITH source AS (
          SELECT embedding
          FROM cards
          WHERE id = ${cardId}::uuid
        )
        SELECT
          c.id,
          c.user_id,
          c.type,
          c.title,
          c.content,
          c.url,
          c.image_url,
          c.metadata,
          c.tags,
          c.created_at,
          c.updated_at,
          c.deleted_at,
          c.archived_at,
          1 - POWER(c.embedding <-> s.embedding, 2) / 2 AS semantic_signal
        FROM cards c, source s
        WHERE c.user_id = ${userId}
          AND c.id != ${cardId}::uuid
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <-> s.embedding
        LIMIT ${limit}
      `
    } else if (sourceTags.length > 0) {
      rows = await db.$queryRaw<any[]>`
        SELECT
          c.id,
          c.user_id,
          c.type,
          c.title,
          c.content,
          c.url,
          c.image_url,
          c.metadata,
          c.tags,
          c.created_at,
          c.updated_at,
          c.deleted_at,
          c.archived_at,
          CASE
            WHEN cardinality(c.tags) = 0 THEN 0.0
            ELSE (
              SELECT COUNT(*)::float
              FROM unnest(c.tags) ct
              WHERE ct = ANY(${sourceTags}::text[])
            ) / GREATEST(
              (
                SELECT COUNT(DISTINCT val)::float
                FROM (
                  SELECT unnest(c.tags) AS val
                  UNION
                  SELECT unnest(${sourceTags}::text[]) AS val
                ) u
              ),
              1.0
            )
          END AS tag_signal
        FROM cards c
        WHERE c.user_id = ${userId}
          AND c.id != ${cardId}::uuid
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
        ORDER BY tag_signal DESC
        LIMIT ${limit}
      `
    } else {
      return []
    }

    const similarResults = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      content: row.content,
      url: row.url,
      imageUrl: row.image_url,
      metadata: row.metadata || {},
      tags: getVisibleTags(row.tags, row.metadata, row.url),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      archivedAt: row.archived_at,
    }))

    logger.info(
      {
        cardId,
        sourceTagCount: sourceTags.length,
        resultCount: similarResults.length,
        topResults: rows.slice(0, 5).map((row) => ({
          id: row.id,
          semanticSignal:
            typeof row.semantic_signal === 'number'
              ? row.semantic_signal
              : null,
          tagSignal: typeof row.tag_signal === 'number' ? row.tag_signal : null,
          hybridScore:
            typeof row.hybrid_score === 'number' ? row.hybrid_score : null,
        })),
      },
      'similarCards ranked results'
    )

    return similarResults
  } catch (error) {
    logger.error({ cardId, err: error }, 'similarCards hybrid query failed')
    return []
  }
}
