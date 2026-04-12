import crypto from 'crypto'

import type { ApiToken } from '@prisma/client'

import { db } from 'src/lib/db'

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

  // Fire-and-forget lastUsedAt update; do not block the caller and do not throw.
  db.apiToken
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
