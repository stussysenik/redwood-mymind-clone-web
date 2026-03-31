import type { QueryResolvers } from 'types/graphql'

import { db } from 'src/lib/db'

const normalizeSearchToken = (value: string) => value.trim().replace(/^#+/, '')
const normalizeTagToken = (value: string) =>
  normalizeSearchToken(value).toLowerCase()

export const searchCards: QueryResolvers['searchCards'] = async ({
  query,
  type,
  tag,
  limit = 50,
}) => {
  const userId = context.currentUser!.id

  // Build WHERE clause for filters
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

  if (query && query.trim()) {
    // Full-text search via raw SQL
    const searchQuery = normalizeSearchToken(query)
    const likePattern = `%${searchQuery}%`

    if (type) {
      cards = await db.$queryRaw<any[]>`
        SELECT * FROM cards
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND archived_at IS NULL
          AND type = ${type}
          AND (
            to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, ''))
            @@ plainto_tsquery('english', ${searchQuery})
            OR title ILIKE ${likePattern}
            OR content ILIKE ${likePattern}
            OR EXISTS (
              SELECT 1
              FROM unnest(tags) AS tag_value
              WHERE lower(tag_value) = ${normalizeTagToken(searchQuery)}
            )
          )
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    } else {
      cards = await db.$queryRaw<any[]>`
        SELECT * FROM cards
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND archived_at IS NULL
          AND (
            to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, ''))
            @@ plainto_tsquery('english', ${searchQuery})
            OR title ILIKE ${likePattern}
            OR content ILIKE ${likePattern}
            OR EXISTS (
              SELECT 1
              FROM unnest(tags) AS tag_value
              WHERE lower(tag_value) = ${normalizeTagToken(searchQuery)}
            )
          )
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    }

    cards = cards.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      content: row.content,
      url: row.url,
      imageUrl: row.image_url,
      metadata: row.metadata || {},
      tags: row.tags || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      archivedAt: row.archived_at,
    }))
  } else {
    cards = await db.card.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  return {
    cards,
    total: cards.length,
    mode: query ? 'search' : 'browse',
  }
}

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

  // Verify ownership and fetch the source card's tags
  const sourceCard = await db.card.findFirst({
    where: { id: cardId, userId },
  })

  if (!sourceCard) {
    throw new Error('Card not found')
  }

  const sourceTags: string[] = (sourceCard.tags as string[]) || []

  // ── Hybrid query ───────────────────────────────────────────────────
  // We fetch a generous candidate pool (4x limit) from the embedding
  // index first, then re-rank with the hybrid score. Cards without an
  // embedding are excluded since we can't compute cosine similarity.
  //
  // Cosine similarity from L2 distance (pgvector <-> operator):
  //   cosine_sim = 1 - (distance^2 / 2)
  //   (valid when vectors are normalised, which OpenAI embeddings are)
  //
  // Jaccard index for tag overlap:
  //   |A ∩ B| / |A ∪ B|  (0 when both tag sets are empty)

  const candidatePool = Math.max(limit * 4, 24)

  try {
    // If the source card has no embedding, fall back to tag-only ranking
    const hasEmbedding = await db.$queryRaw<{ has: boolean }[]>`
      SELECT (embedding IS NOT NULL) AS has
      FROM cards
      WHERE id = ${cardId}::uuid
      LIMIT 1
    `

    const sourceHasEmbedding = hasEmbedding.length > 0 && hasEmbedding[0].has

    let rows: any[]

    if (sourceHasEmbedding && sourceTags.length > 0) {
      // Full hybrid: embedding similarity + tag Jaccard
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
            1 - (c.embedding <-> s.embedding) / 2 AS embedding_sim,
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
      // Embedding only (source has no tags)
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
          1 - (c.embedding <-> s.embedding) / 2 AS embedding_sim
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
      // Tag-only fallback (source has no embedding)
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
      // No embedding and no tags -- nothing to match on
      return []
    }

    // Map snake_case DB columns to camelCase GraphQL fields
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      content: row.content,
      url: row.url,
      imageUrl: row.image_url,
      metadata: row.metadata || {},
      tags: row.tags || [],
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
