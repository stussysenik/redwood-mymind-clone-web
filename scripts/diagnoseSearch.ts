import { db } from 'api/src/lib/db'
import { getEmbeddingAvailability } from 'api/src/lib/ai/embeddings'
import { searchCardsForUserDetailed } from 'api/src/services/search/search'

type SearchCase = {
  label: string
  query: string
}

function parseArgs(argv: string[]) {
  const separatorIndex = argv.lastIndexOf('--')
  const effectiveArgv =
    separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv

  const queries: string[] = []
  const cases: SearchCase[] = []
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

    if (value === '--case') {
      const rawCase = effectiveArgv[index + 1] || ''
      const separator = rawCase.includes('=') ? '=' : ':'
      const splitIndex = rawCase.indexOf(separator)
      if (splitIndex > 0) {
        const label = rawCase.slice(0, splitIndex).trim()
        const query = rawCase.slice(splitIndex + 1).trim()
        if (label && query) {
          cases.push({ label, query })
        }
      }
      index += 1
      continue
    }

    if (value.trim()) {
      queries.push(value)
    }
  }

  return { queries, cases, userId, tag, type, limit }
}

async function resolveUserId(
  explicitUserId: string | null
): Promise<string | null> {
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
  const {
    queries,
    cases,
    userId: requestedUserId,
    tag,
    type,
    limit,
  } = parseArgs(process.argv.slice(2))

  const searchCases =
    cases.length > 0
      ? cases
      : queries.map((query, index) => ({
          label: `query-${index + 1}`,
          query,
        }))

  if (searchCases.length === 0) {
    console.error(
      'Usage: yarn rw exec diagnoseSearch -- [--user-id <uuid>] [--tag <tag>] [--type <type>] [--limit <n>] [--case label=query] <query> [more queries]'
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

  const reports: Array<{
    label: string
    query: string
    mode: string
    total: number
    blindSpots: string[]
  }> = []

  for (const searchCase of searchCases) {
    const result = await searchCardsForUserDetailed(userId, {
      query: searchCase.query,
      limit,
      tag,
      type,
    })
    const blindSpots = (result.diagnostics?.skipped || []).map(
      (issue) => issue.reason
    )

    console.log(
      `\n=== ${searchCase.label}: ${JSON.stringify(searchCase.query)} ===`
    )
    console.log(
      JSON.stringify(
        {
          label: searchCase.label,
          query: searchCase.query,
          mode: result.mode,
          total: result.total,
          embedding: result.diagnostics?.embedding || null,
          blindSpots,
          cards:
            result.diagnostics?.results ||
            result.cards.map((card, index) => ({
              rank: index + 1,
              id: card.id,
              title: card.title,
              url: card.url,
              tags: card.tags,
            })),
        },
        null,
        2
      )
    )

    reports.push({
      label: searchCase.label,
      query: searchCase.query,
      mode: result.mode,
      total: result.total,
      blindSpots,
    })
  }

  const residualBlindSpots = Array.from(
    new Set(reports.flatMap((report) => report.blindSpots))
  )

  console.log('\n=== summary ===')
  console.log(
    JSON.stringify(
      {
        cases: reports,
        residualBlindSpots,
      },
      null,
      2
    )
  )
}
