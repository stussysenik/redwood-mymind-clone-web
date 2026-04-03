import { db } from 'api/src/lib/db'
import { getEmbeddingAvailability } from 'api/src/lib/ai/embeddings'
import { searchCardsForUser } from 'api/src/services/search/search'

function parseArgs(argv: string[]) {
  const separatorIndex = argv.lastIndexOf('--')
  const effectiveArgv =
    separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv

  const queries: string[] = []
  let userId: string | null = null
  let tag: string | null = null
  let type: string | null = null
  let limit = 8

  for (let index = 0; index < effectiveArgv.length; index += 1) {
    const value = effectiveArgv[index]
    if (value === '--user-id') {
      userId = effectiveArgv[index + 1] || null
      index += 1
      continue
    }

    if (value === '--tag') {
      tag = effectiveArgv[index + 1] || null
      index += 1
      continue
    }

    if (value === '--type') {
      type = effectiveArgv[index + 1] || null
      index += 1
      continue
    }

    if (value === '--limit') {
      const parsed = Number.parseInt(effectiveArgv[index + 1] || '', 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed
      }
      index += 1
      continue
    }

    if (value.trim()) {
      queries.push(value)
    }
  }

  return { queries, userId, tag, type, limit }
}

async function resolveUserId(explicitUserId: string | null): Promise<string | null> {
  if (explicitUserId) {
    return explicitUserId
  }

  const latestCard = await db.card.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { userId: true },
  })

  return latestCard?.userId || null
}

export default async () => {
  const { queries, userId: requestedUserId, tag, type, limit } = parseArgs(
    process.argv.slice(2)
  )

  if (queries.length === 0) {
    console.error(
      'Usage: yarn rw exec diagnoseSearch -- [--user-id <uuid>] [--tag <tag>] [--type <type>] [--limit <n>] <query> [more queries]'
    )
    process.exitCode = 1
    return
  }

  const userId = await resolveUserId(requestedUserId)
  if (!userId) {
    console.error('Unable to resolve a user id for search diagnostics')
    process.exitCode = 1
    return
  }

  const embeddingAvailability = getEmbeddingAvailability()

  console.log(
    JSON.stringify(
      {
        userId,
        embeddingAvailability,
        tag,
        type,
        limit,
      },
      null,
      2
    )
  )

  for (const query of queries) {
    const result = await searchCardsForUser(userId, {
      query,
      limit,
      tag,
      type,
    })
    console.log(`\n=== ${JSON.stringify(query)} ===`)
    console.log(
      JSON.stringify(
        {
          mode: result.mode,
          total: result.total,
          cards: result.cards.map((card) => ({
            id: card.id,
            title: card.title,
            tags: card.tags,
            createdAt: card.createdAt,
            url: card.url,
          })),
        },
        null,
        2
      )
    )
  }
}
