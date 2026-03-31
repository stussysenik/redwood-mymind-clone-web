import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let browserClient: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  if (typeof window === 'undefined') {
    return null
  }

  const supabaseUrl = process.env.REDWOOD_ENV_SUPABASE_URL
  const supabaseAnonKey = process.env.REDWOOD_ENV_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  if (!browserClient) {
    browserClient = createSupabaseClient(supabaseUrl, supabaseAnonKey)
  }

  return browserClient
}
