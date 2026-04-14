import type { Prisma } from '@prisma/client'
import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import { db } from 'src/lib/db'

const MAX_FIRST = 50
const DEFAULT_FIRST = 10

type Kind = 'title' | 'description' | 'any'
type Resolution = 'accept' | 'reject' | 'edit' | 'skip'

function decodeCursor(cursor: string | null | undefined): Date | null {
  if (!cursor) return null
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8')
    const d = new Date(decoded)
    if (Number.isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

function encodeCursor(createdAt: Date): string {
  return Buffer.from(createdAt.toISOString(), 'utf8').toString('base64')
}

export const pendingEnrichmentReviewItems: QueryResolvers['pendingEnrichmentReviewItems'] =
  async ({ first, after, kind }) => {
    const userId = context.currentUser!.id
    const take = Math.min(Math.max(first ?? DEFAULT_FIRST, 1), MAX_FIRST)

    const where: Record<string, unknown> = {
      userId,
      resolvedAt: null,
    }
    if (kind && kind !== 'any') {
      where.kind = kind
    }
    const afterDate = decodeCursor(after)
    if (afterDate) {
      where.createdAt = { lt: afterDate }
    }

    const [rows, totalCount] = await Promise.all([
      db.enrichmentReviewItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
      }),
      db.enrichmentReviewItem.count({
        where: {
          userId,
          resolvedAt: null,
          ...(kind && kind !== 'any' ? { kind } : {}),
        },
      }),
    ])

    const hasNextPage = rows.length > take
    const slice = hasNextPage ? rows.slice(0, take) : rows
    const endCursor = slice.length > 0 ? encodeCursor(slice[slice.length - 1].createdAt) : null

    return {
      edges: slice.map((node) => ({ node, cursor: encodeCursor(node.createdAt) })),
      pageInfo: { hasNextPage, endCursor },
      totalCount,
    }
  }

export const resolveEnrichmentReviewItem: MutationResolvers['resolveEnrichmentReviewItem'] =
  async ({ id, resolution, editedValue }) => {
    const userId = context.currentUser!.id
    const resolvedAt = new Date()

    return db.$transaction(async (tx) => {
      const item = await tx.enrichmentReviewItem.findFirst({
        where: { id, userId },
      })
      if (!item) {
        throw new Error('Review item not found')
      }
      if (item.resolvedAt) {
        throw new Error('Review item already resolved')
      }

      // Ownership double-check via the card relation.
      const card = await tx.card.findFirst({
        where: { id: item.cardId, userId },
      })
      if (!card) {
        throw new Error('Card not found or not owned by user')
      }

      const res = resolution as Resolution
      const kind = item.kind as 'title' | 'description'

      if (res === 'accept') {
        await applyValueToCard(tx, card, kind, item.proposedValue)
      } else if (res === 'edit') {
        const value = (editedValue ?? '').trim()
        if (!value) {
          throw new Error('editedValue is required when resolution is edit')
        }
        await applyValueToCard(tx, card, kind, value, /* tombstone */ true)
      }
      // reject / skip: touch the review item only, never the card.

      return tx.enrichmentReviewItem.update({
        where: { id: item.id },
        data: {
          resolvedAt,
          resolution: res,
          editedValue: res === 'edit' ? editedValue : null,
        },
      })
    })
  }

async function applyValueToCard(
  tx: Prisma.TransactionClient,
  card: { id: string; metadata: unknown },
  kind: 'title' | 'description',
  value: string,
  markTombstone = false,
): Promise<void> {
  const now = new Date()
  if (kind === 'title') {
    await tx.card.update({
      where: { id: card.id },
      data: {
        title: value,
        titleConfidence: 1.0,
        ...(markTombstone ? { titleEditedAt: now } : {}),
      },
    })
    return
  }

  const existing =
    card.metadata && typeof card.metadata === 'object' && !Array.isArray(card.metadata)
      ? (card.metadata as Record<string, unknown>)
      : {}
  await tx.card.update({
    where: { id: card.id },
    data: {
      metadata: { ...existing, summary: value },
      descriptionConfidence: 1.0,
      ...(markTombstone ? { descriptionEditedAt: now } : {}),
    },
  })
}
