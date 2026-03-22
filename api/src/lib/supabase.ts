/**
 * Supabase Admin Client (API-side only)
 *
 * Uses the service role key to bypass RLS for server-side operations.
 * Used for: Auth admin, Storage operations, and direct DB access when needed.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.REDWOOD_ENV_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let _supabaseAdmin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    )
  }

  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return _supabaseAdmin
}

export const supabaseAdmin = (() => {
  try {
    return getSupabaseAdmin()
  } catch {
    console.warn('[Supabase] Admin client not initialized — check env vars')
    return null
  }
})()
