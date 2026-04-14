// Personal API token service.
//
// Called from two places:
//   1. The `apiTokens` GraphQL resolver (user from `context.currentUser`)
//   2. The `/functions/capture` serverless fn (user resolved from the token itself)
//
// Because of (2) the service accepts `userId` as an explicit parameter rather
// than reading `context.currentUser` like sibling services (cards, spaces).
// Do not "fix" this for consistency — the serverless path has no Redwood
// auth context available.
import crypto from 'crypto'

import type { ApiToken } from '@prisma/client'

import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'

const TOKEN_REGEX = /^byoa_([a-f0-9]{8})_([a-f0-9]{32})$/

function hashSecret(prefix: string, secret: string): string {
  return crypto.createHash('sha256').update(`${prefix}_${secret}`).digest('hex')
}

export type GenerateApiTokenArgs = {
  userId: string
  name: string
}

export type GeneratedApiToken = {
  token: ApiToken
  plaintext: string
}

export async function generateApiToken({
  userId,
  name,
}: GenerateApiTokenArgs): Promise<GeneratedApiToken> {
  const prefix = crypto.randomBytes(4).toString('hex') // 8 hex chars
  const secret = crypto.randomBytes(16).toString('hex') // 32 hex chars
  const tokenHash = hashSecret(prefix, secret)
  const plaintext = `byoa_${prefix}_${secret}`

  const token = await db.apiToken.create({
    data: {
      userId,
      name,
      prefix,
      tokenHash,
      scopes: ['cards:write'],
    },
  })

  return { token, plaintext }
}

export async function verifyApiToken(plaintext: string): Promise<ApiToken | null> {
  const match = plaintext.match(TOKEN_REGEX)
  if (!match) return null

  const [, prefix, secret] = match
  const tokenHash = hashSecret(prefix, secret)

  const token = await db.apiToken.findFirst({
    where: { prefix, tokenHash, revokedAt: null },
  })

  if (!token) return null

  // Fire-and-forget `lastUsedAt` update. `verifyApiToken` is on the hot path
  // of /functions/capture, and `lastUsedAt` is best-effort telemetry, not
  // audit-grade — awaiting it would add a round-trip to every request.
  // `void` makes "deliberately not awaited" explicit for future linters.
  void db.apiToken
    .update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // swallow — non-critical
    })

  return token
}

export type RevokeApiTokenArgs = {
  id: string
  userId: string
}

export async function revokeApiToken({
  id,
  userId,
}: RevokeApiTokenArgs): Promise<ApiToken> {
  const existing = await db.apiToken.findFirst({ where: { id, userId } })
  if (!existing) {
    throw new Error('Token not found')
  }
  return db.apiToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  })
}

export type ListApiTokensArgs = {
  userId: string
}

export async function listApiTokens({ userId }: ListApiTokensArgs): Promise<ApiToken[]> {
  return db.apiToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
}

// Redwood auto-wires the `Query.apiTokens` field to this exported name.
// The null-check and try/catch are the `graphql-resolver-robustness`
// contract: the Settings page must never render a non-null-field error,
// even if the request arrives before `context.currentUser` is populated
// or if the Prisma query throws.
export const apiTokens = async (): Promise<ApiToken[]> => {
  const currentUser = context.currentUser
  if (!currentUser) {
    logger.error(
      { event: 'apiTokens.no_current_user' },
      'apiTokens resolver hit with no current user'
    )
    return []
  }
  try {
    return await listApiTokens({ userId: currentUser.id })
  } catch (err) {
    logger.error(
      { err, event: 'apiTokens.service_failure' },
      'apiTokens service threw'
    )
    return []
  }
}
