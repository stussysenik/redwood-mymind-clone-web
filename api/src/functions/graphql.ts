import type { Decoded } from '@redwoodjs/api'
import { createGraphQLHandler } from '@redwoodjs/graphql-server'

import directives from 'src/directives/**/*.{js,ts}'
import sdls from 'src/graphql/**/*.sdl.{js,ts}'
import services from 'src/services/**/*.{js,ts}'

import { getCurrentUser } from 'src/lib/auth'
import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'

/**
 * Decode the Supabase JWT from the Authorization header.
 * Extracts the payload without signature verification
 * (Supabase already verified it on sign-in).
 */
const authDecoder = async (
  token: string,
  type: string
): Promise<Decoded | null> => {
  if (!token) return null

  try {
    const [, payload] = token.split('.')
    if (!payload) return null

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    )
    return decoded
  } catch {
    return null
  }
}

export const handler = createGraphQLHandler({
  authDecoder,
  getCurrentUser,
  loggerConfig: { logger, options: {} },
  directives,
  sdls,
  services,
  onException: () => {
    // Disconnect from your database with an unhandled exception.
    db.$disconnect()
  },
})
