/**
 * Supabase Auth Adapter for RedwoodJS
 *
 * Wraps @supabase/supabase-js auth methods in RedwoodJS's
 * createAuthentication() pattern. Provides useAuth() hook.
 */

import { createAuthentication } from '@redwoodjs/auth'

import { supabase } from './lib/supabaseClient'

function createSupabaseAuth() {
  return {
    type: 'custom' as const,
    client: supabase,

    login: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      return data.session?.access_token
    },

    signup: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      return data.session?.access_token
    },

    logout: async () => {
      await supabase.auth.signOut()
    },

    getToken: async () => {
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    },

    getUserMetadata: async () => {
      const { data } = await supabase.auth.getUser()
      return data.user
    },
  }
}

export const { AuthProvider, useAuth } = createAuthentication(
  createSupabaseAuth()
)
