import type { SupabaseClient } from '@supabase/supabase-js'

import type { CorrectionPayload } from '../domain/corrections'

export type ConfigTable = 'products' | 'retailers' | 'product_links' | 'price_overrides'

export async function signInAdmin(client: SupabaseClient, email: string, password: string): Promise<void> {
  if (!email) throw new Error('Chưa cấu hình email quản trị.')
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Mật khẩu không đúng hoặc tài khoản chưa được cấp quyền.')
}

export async function insertCorrection(client: SupabaseClient, payload: CorrectionPayload): Promise<void> {
  const { error } = await client.from('price_corrections').insert(payload)
  if (error) throw new Error(error.message)
}

export async function saveConfig(
  client: SupabaseClient,
  table: ConfigTable,
  values: Record<string, unknown>,
  id?: string,
): Promise<void> {
  const request = id ? client.from(table).update(values).eq('id', id) : client.from(table).insert(values)
  const { error } = await request
  if (error) throw new Error(error.message)
}

