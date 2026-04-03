import { db } from 'api/src/lib/db'
import { detectPlatform } from 'api/src/lib/platforms'
import {
  normalizeCardType,
  sanitizeGeneratedTags,
} from 'api/src/lib/semantic'

type RepairArgs = {
  apply: boolean
  userId: string | null
  limit: number | null
}

type RepairCandidate = {
  id: string
  userId: string
  type: string
  url: string | null
  tags: string[]
  metadata: Record<string, unknown>
}

function parseArgs(argv: string[]): RepairArgs {
  let apply = false
  let userId: string | null = null
  let limit: number | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--apply') {
      apply = true
      continue
    }

    if (value === '--user-id') {
      userId = argv[index + 1] || null
      index += 1
      continue
    }

    if (value === '--limit') {
      const parsed = Number.parseInt(argv[index + 1] || '', 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed
      }
      index += 1
    }
  }

  return { apply, userId, limit }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

function buildRepairTags(card: RepairCandidate): string[] {
  const metadata = isRecord(card.metadata) ? card.metadata : {}
  const authorHandle =
    pickString(metadata.authorHandle) || pickString(metadata.author)
  const authorName = pickString(metadata.authorName)
  const platform =
    pickString(metadata.platform) || detectPlatform(card.url).toLowerCase()

  return sanitizeGeneratedTags(card.tags, {
    contentType: normalizeCardType(card.type),
    platform,
    url: card.url,
    authorHandle,
    authorName,
  })
}

export default async () => {
  const { apply, userId, limit } = parseArgs(process.argv.slice(2))

  const cards = await db.card.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      ...(userId ? { userId } : {}),
      NOT: {
        tags: {
          isEmpty: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
      userId: true,
      type: true,
      url: true,
      tags: true,
      metadata: true,
    },
  })

  const repairs = cards
    .map((card) => {
      const nextTags = buildRepairTags({
        ...card,
        tags: card.tags || [],
        metadata: isRecord(card.metadata) ? card.metadata : {},
      })

      return {
        id: card.id,
        userId: card.userId,
        before: card.tags || [],
        after: nextTags,
      }
    })
    .filter((repair) => !arraysEqual(repair.before, repair.after))

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          scanned: cards.length,
          repairable: repairs.length,
          sample: repairs.slice(0, 20),
        },
        null,
        2
      )
    )
    return
  }

  for (const repair of repairs) {
    await db.card.update({
      where: { id: repair.id },
      data: {
        tags: repair.after,
      },
    })
  }

  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        scanned: cards.length,
        repaired: repairs.length,
        sample: repairs.slice(0, 20),
      },
      null,
      2
    )
  )
}
