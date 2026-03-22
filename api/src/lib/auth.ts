/**
 * Auth — Supabase JWT verification for RedwoodJS
 *
 * Decodes the Supabase JWT from the Authorization header,
 * verifies the user exists, and returns the current user context.
 */

import type { Decoded } from '@redwoodjs/api'
import { AuthenticationError, ForbiddenError } from '@redwoodjs/graphql-server'

import { getSupabaseAdmin } from './supabase'

export interface CurrentUser {
  id: string
  email: string
}

/**
 * Called by RedwoodJS GraphQL server after decoding the JWT.
 * The decoded token contains the Supabase user payload (sub = user_id).
 */
export const getCurrentUser = async (
  decoded: Decoded
): Promise<CurrentUser> => {
  if (!decoded?.sub) {
    throw new AuthenticationError('Invalid token: no sub claim')
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.admin.getUserById(
    decoded.sub as string
  )

  if (error || !data?.user) {
    throw new AuthenticationError('User not found')
  }

  return {
    id: data.user.id,
    email: data.user.email ?? '',
  }
}

/**
 * Check if the current request is authenticated.
 */
export const isAuthenticated = (): boolean => {
  return !!context.currentUser
}

/**
 * Require authentication — throws if not logged in.
 */
export const requireAuth = ({ roles }: { roles?: string[] } = {}) => {
  if (!isAuthenticated()) {
    throw new AuthenticationError("You don't have permission to do that.")
  }

  if (roles && roles.length > 0) {
    throw new ForbiddenError("You don't have the required role.")
  }
}

/**
 * Check if user has a specific role.
 * (Supabase doesn't have built-in roles — always returns true for now)
 */
export const hasRole = ({ roles }: { roles: string[] }): boolean => {
  return roles !== undefined
}
