/**
 * Vector Operations — pgvector raw SQL helpers
 *
 * Prisma can't natively handle the vector(1536) type,
 * so we call the existing PL/pgSQL functions via $queryRaw.
 */

import { Prisma } from '@prisma/client'

import { db } from './db'

/**
 * Store an embedding vector for a card.
 * Calls the store_card_embedding PL/pgSQL function in Supabase.
 */
export async function storeEmbedding(
  cardId: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(',')}]`
  await db.$queryRaw`
    SELECT store_card_embedding(
      ${cardId}::uuid,
      ${vectorStr}::vector(1536)
    )
  `
}

/**
 * Find semantically similar cards using vector cosine similarity.
 * Calls the match_cards PL/pgSQL function in Supabase.
 */
export async function matchCards(
  userId: string,
  queryEmbedding: number[],
  matchCount = 10,
  excludeId?: string
): Promise<{ id: string; similarity: number }[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`

  const results = await db.$queryRaw<{ id: string; similarity: number }[]>`
    SELECT id, similarity
    FROM match_cards(
      ${userId}::text,
      ${vectorStr}::vector(1536),
      ${matchCount}::int,
      ${excludeId ? Prisma.sql`${excludeId}::uuid` : Prisma.sql`NULL::uuid`}
    )
  `

  return results
}
