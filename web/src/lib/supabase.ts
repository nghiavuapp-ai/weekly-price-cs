import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createConfiguredClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  // Support both Supabase's current publishable-key name and the legacy anon-key
  // name used by existing Vercel projects during the migration.
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
}

export const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.trim() ?? ''
