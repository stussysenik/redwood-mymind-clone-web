/**
 * Supabase Client (Web-side)
 *
 * Browser-safe client using the anonymous key.
 * Used for authentication and real-time subscriptions.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REDWOOD_ENV_SUPABASE_URL!
const supabaseAnonKey = process.env.REDWOOD_ENV_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
