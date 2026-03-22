import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'

export const spaces: QueryResolvers['spaces'] = async () => {
  const userId = context.currentUser!.id

  const spacesList = await db.space.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  // For each space, count matching cards via query/tag filter
  const results = await Promise.all(
    spacesList.map(async (s) => {
      let cardCount = 0
      if (s.query) {
        cardCount = await db.card.count({
          where: {
            userId,
            deletedAt: null,
            archivedAt: null,
            tags: { has: s.query },
          },
        })
      }
      return { ...s, cardCount, cards: [] }
    })
  )

  return results
}

export const space: QueryResolvers['space'] = async ({ id }) => {
  const userId = context.currentUser!.id

  const s = await db.space.findFirst({
    where: { id, userId },
  })

  if (!s) return null

  // Fetch cards matching this space's query/tag filter
  let cards: any[] = []
  if (s.query) {
    cards = await db.card.findMany({
      where: {
        userId,
        deletedAt: null,
        archivedAt: null,
        tags: { has: s.query },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  return { ...s, cardCount: cards.length, cards }
}

export const spaceSuggestions: QueryResolvers['spaceSuggestions'] = async () => {
  const userId = context.currentUser!.id

  const cards = await db.card.findMany({
    where: { userId, deletedAt: null, archivedAt: null },
    select: { tags: true },
  })

  const tagCounts: Record<string, number> = {}
  for (const card of cards) {
    for (const tag of card.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    }
  }

  const suggestions = Object.entries(tagCounts)
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({
      name: tag.charAt(0).toUpperCase() + tag.slice(1),
      tagFilter: [tag],
      cardCount: count,
    }))

  return suggestions
}

export const createSpace: MutationResolvers['createSpace'] = async ({
  input,
}) => {
  const userId = context.currentUser!.id

  const space = await db.space.create({
    data: {
      userId,
      name: input.name,
      query: input.query || null,
      isSmart: input.isSmart ?? false,
    },
  })

  return { ...space, cardCount: 0, cards: [] }
}

export const updateSpace: MutationResolvers['updateSpace'] = async ({
  id,
  input,
}) => {
  const userId = context.currentUser!.id
  const existing = await db.space.findFirst({
    where: { id, userId },
  })
  if (!existing) throw new Error('Space not found')

  const data: any = {}
  if (input.name !== undefined) data.name = input.name
  if (input.query !== undefined) data.query = input.query

  const space = await db.space.update({
    where: { id },
    data,
  })

  return { ...space, cardCount: 0, cards: [] }
}

export const deleteSpace: MutationResolvers['deleteSpace'] = async ({
  id,
}) => {
  const userId = context.currentUser!.id
  const existing = await db.space.findFirst({
    where: { id, userId },
  })
  if (!existing) throw new Error('Space not found')

  const space = await db.space.delete({ where: { id } })

  return { ...space, cardCount: 0, cards: [] }
}
