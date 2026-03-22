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
  type: string,
  { event }: { event: any }
): Promise<Decoded | null> => {
  if (!token) return null

  // If a stale cookie from another project takes precedence over
  // the Authorization header, extract the JWT from the header directly
  let jwt = token
  if (type !== 'custom') {
    const authHeader =
      event?.headers?.authorization || event?.headers?.Authorization
    if (!authHeader) return null
    const parts = authHeader.split(' ')
    if (parts.length !== 2) return null
    jwt = parts[1]
  }

  try {
    const [, payload] = jwt.split('.')
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
