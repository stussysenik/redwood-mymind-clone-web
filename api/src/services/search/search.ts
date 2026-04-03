import type { QueryResolvers } from 'types/graphql'

import { Prisma } from '@prisma/client'

import { getEmbeddingAvailability } from 'src/lib/ai/embeddings'
import { querySemanticSimilar } from 'src/lib/ai/vectorStore'
import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'
import { normalizeTag, stripGeneratedTagNoise } from 'src/lib/semantic'

const normalizeSearchToken = (value: string) => value.trim().replace(/^#+/, '')
const normalizeTagToken = (value: string) => normalizeTag(normalizeSearchToken(value))

type SearchCardsArgs = {
  query?: string | null
  type?: string | null
  tag?: string | null
  limit?: number | null
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
  const platform = typeof metadata?.platform === 'string' ? metadata.platform : null

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

function computeKeywordScore(row: SearchRow): number {
  const textRank = Number(row.text_rank || 0)
  return (
    (row.exact_title_match ? 10 : 0) +
    (row.exact_tag_match ? 8 : 0) +
    (row.title_prefix_match ? 4 : 0) +
    (row.title_like_match ? 2 : 0) +
    (row.content_like_match ? 1 : 0) +
    textRank * 12
  )
}

function buildKeywordWhereSql(
  userId: string,
  type: string | null | undefined,
  normalizedFilterTag: string | null
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`user_id = ${userId}`,
    Prisma.sql`deleted_at IS NULL`,
    Prisma.sql`archived_at IS NULL`,
  ]

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

export const searchCardsForUser = async (
  userId: string,
  { query, type, tag, limit = 50 }: SearchCardsArgs
) => {
  const hasSearchQuery = !!query?.trim()
  const effectiveLimit = Math.min(Math.max(limit ?? 50, 1), 100)

  const where: any = {
    userId,
    deletedAt: null,
    archivedAt: null,
  }

  if (type) {
    where.type = type
  }

  if (tag) {
    where.tags = { has: normalizeTagToken(tag) }
  }

  let cards
  let total = 0
  let appliedSemanticCount = 0

  if (hasSearchQuery) {
    const searchQuery = normalizeSearchToken(query)
    const likePattern = `%${searchQuery}%`
    const titlePrefixPattern = `${searchQuery}%`
    const normalizedQueryTag = normalizeTagToken(searchQuery)
    const normalizedFilterTag = tag ? normalizeTagToken(tag) : null
    const keywordCandidateLimit = Math.min(Math.max(effectiveLimit * 4, 32), 120)
    const embeddingAvailability = getEmbeddingAvailability()
    const keywordWhereSql = buildKeywordWhereSql(
      userId,
      type,
      normalizedFilterTag
    )

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
        card: ReturnType<typeof mapSearchRow>
        keywordScore: number
        semanticScore: number
      }
    >()

    for (const row of keywordRows) {
      const card = mapSearchRow(row)
      rankedCards.set(card.id, {
        card,
        keywordScore: computeKeywordScore(row),
        semanticScore: 0,
      })
    }

    let semanticCount = 0
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

        let fetchedSemanticCards: Array<ReturnType<typeof mapSearchRow>> = []
        if (missingSemanticIds.length > 0) {
          const semanticCards = await db.card.findMany({
            where: {
              userId,
              deletedAt: null,
              archivedAt: null,
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
          fetchedSemanticCards = semanticCards as Array<ReturnType<typeof mapSearchRow>>
        }

        const fetchedById = new Map(
          fetchedSemanticCards.map((card) => [card.id, card])
        )

        for (const match of semanticMatches) {
          const existing = rankedCards.get(match.id)
          if (existing) {
            existing.semanticScore = Math.max(existing.semanticScore, match.score)
            appliedSemanticCount += 1
            continue
          }

          const card = fetchedById.get(match.id)
          if (!card) {
            continue
          }

          rankedCards.set(match.id, {
            card,
            keywordScore: 0,
            semanticScore: match.score,
          })
          appliedSemanticCount += 1
        }
      } catch (error) {
        logger.warn(
          { query: searchQuery, err: error },
          'Semantic search failed, falling back to keyword ranking'
        )
      }
    }

    cards = Array.from(rankedCards.values())
      .map((entry) => ({
        card: entry.card,
        totalScore: entry.keywordScore + entry.semanticScore * 8,
        createdAt: entry.card.createdAt,
      }))
      .sort((left, right) => {
        if (right.totalScore !== left.totalScore) {
          return right.totalScore - left.totalScore
        }

        return (
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
        )
      })
      .slice(0, effectiveLimit)
      .map((entry) => entry.card)
    total = rankedCards.size

    logger.info(
      {
        query: searchQuery,
        type: type || null,
        tag: normalizedFilterTag,
        keywordCount: keywordRows.length,
        semanticCount,
        embeddingConfigured: embeddingAvailability.configured,
        embeddingReason: embeddingAvailability.reason,
      },
      'searchCards ranked results'
    )
  } else {
    cards = await db.card.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: effectiveLimit,
    })
    total = cards.length
  }

  return {
    cards,
    total,
    mode: hasSearchQuery
      ? appliedSemanticCount > 0
        ? 'semantic-hybrid'
        : 'search'
      : 'browse',
  }
}

export const searchCards: QueryResolvers['searchCards'] = async ({
  query,
  type,
  tag,
  limit = 50,
}) =>
  searchCardsForUser(context.currentUser!.id, {
    query,
    type,
    tag,
    limit,
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

  const sourceTags: string[] = (sourceCard.tags as string[]) || []
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
            1 - POWER(c.embedding <-> s.embedding, 2) / 2 AS embedding_sim,
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
            END AS tag_jaccard
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
          0.6 * embedding_sim + 0.4 * tag_jaccard AS hybrid_score
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
          1 - POWER(c.embedding <-> s.embedding, 2) / 2 AS embedding_sim
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
          END AS tag_jaccard
        FROM cards c
        WHERE c.user_id = ${userId}
          AND c.id != ${cardId}::uuid
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
        ORDER BY tag_jaccard DESC
        LIMIT ${limit}
      `
    } else {
      return []
    }

    return rows.map((row) => ({
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
  } catch (error) {
    logger.error({ cardId, err: error }, 'similarCards hybrid query failed')
    return []
  }
}
