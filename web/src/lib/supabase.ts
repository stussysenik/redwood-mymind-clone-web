import { createClient } from './supabase-browser'

export function getSupabaseBrowser() {
  return createClient()
}
