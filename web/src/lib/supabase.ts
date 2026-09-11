import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createConfiguredClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
}

export const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.trim() ?? ''

