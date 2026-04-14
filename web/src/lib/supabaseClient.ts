/**
 * Supabase Client (Web-side) — Canonical Singleton
 *
 * Exactly one anon client per browser context, memoized on globalThis so
 * hot-module-reload in development does not double-instantiate. Every web
 * surface (auth adapter, realtime, components) MUST import from here.
 *
 * See `supabase-client-singleton` capability spec.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

declare global {
  // eslint-disable-next-line no-var
  var __byoa_supabase__: SupabaseClient | undefined
}

export function getSupabaseClient(): SupabaseClient {
  if (!globalThis.__byoa_supabase__) {
    const url = process.env.REDWOOD_ENV_SUPABASE_URL
    const key = process.env.REDWOOD_ENV_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error(
        'Supabase env vars missing: REDWOOD_ENV_SUPABASE_URL / REDWOOD_ENV_SUPABASE_ANON_KEY'
      )
    }
    globalThis.__byoa_supabase__ = createClient(url, key)
  }
  return globalThis.__byoa_supabase__
}

export const supabase = getSupabaseClient()
