import type { QueryResolvers } from 'types/graphql'

import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'
import { embedQuery } from 'src/lib/ai/embeddings'
import { matchCards } from 'src/lib/vectorOperations'

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
    where.tags = { has: tag }
  }

  let cards

  if (query && query.trim()) {
    // Full-text search via raw SQL
    const searchQuery = query.trim()
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
            OR ${searchQuery} = ANY(tags)
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
            OR ${searchQuery} = ANY(tags)
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

export const similarCards: QueryResolvers['similarCards'] = async ({
  cardId,
  text,
  topK = 5,
}) => {
  const userId = context.currentUser!.id

  if (!cardId && !text) {
    return { matches: [], cards: [] }
  }

  try {
    let queryEmbedding: number[] | null = null

    if (cardId) {
      // Fetch the card's existing embedding from pgvector via raw SQL
      const embeddingRows = await db.$queryRaw<
        { embedding: string }[]
      >`
        SELECT embedding::text
        FROM cards
        WHERE id = ${cardId}::uuid
          AND embedding IS NOT NULL
        LIMIT 1
      `

      if (embeddingRows.length > 0 && embeddingRows[0].embedding) {
        // Parse the vector string "[0.1,0.2,...]" into number[]
        const raw = embeddingRows[0].embedding
        queryEmbedding = raw
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(',')
          .map(Number)
      }

      // If no stored embedding, generate one from the card's content
      if (!queryEmbedding) {
        const card = await db.card.findFirst({
          where: { id: cardId, userId },
        })
        if (card) {
          const searchText =
            card.title ||
            card.content ||
            (card.metadata as any)?.summary ||
            ''
          if (searchText) {
            queryEmbedding = await embedQuery(searchText)
          }
        }
      }
    } else if (text) {
      // Generate embedding from the text query
      queryEmbedding = await embedQuery(text)
    }

    if (!queryEmbedding || queryEmbedding.length === 0) {
      logger.warn(
        { cardId, text: text?.slice(0, 50) },
        'similarCards: no embedding available'
      )
      return { matches: [], cards: [] }
    }

    // Use pgvector match_cards function for cosine similarity
    const vectorMatches = await matchCards(
      userId,
      queryEmbedding,
      topK + (cardId ? 1 : 0), // fetch extra if excluding self
      cardId || undefined
    )

    if (vectorMatches.length === 0) {
      return { matches: [], cards: [] }
    }

    // Fetch the matched cards from Prisma
    const matchedIds = vectorMatches.map((m) => m.id)
    const matchedCards = await db.card.findMany({
      where: {
        id: { in: matchedIds },
        userId,
        deletedAt: null,
      },
    })

    // Build matches array preserving similarity scores
    const matches = vectorMatches
      .filter((m) => matchedCards.some((c) => c.id === m.id))
      .slice(0, topK)
      .map((m) => ({
        cardId: m.id,
        score: m.similarity,
      }))

    // Sort cards to match the order of similarity scores
    const cardMap = new Map(matchedCards.map((c) => [c.id, c]))
    const orderedCards = matches
      .map((m) => cardMap.get(m.cardId))
      .filter(Boolean) as typeof matchedCards

    return { matches, cards: orderedCards }
  } catch (error) {
    logger.error(
      { cardId, text: text?.slice(0, 50), err: error },
      'similarCards failed'
    )
    return { matches: [], cards: [] }
  }
}
