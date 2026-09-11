import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import fixture from './data/fixture.json'
import { insertCorrection, saveConfig, signInAdmin, type ConfigTable } from './data/admin-repository'
import { loadDashboardData, type DashboardFixture, type DashboardSnapshot } from './data/data-source'
import type { CorrectionPayload } from './domain/corrections'
import type { Granularity } from './domain/price-data'
import { downloadWorkbook } from './export/download'
import { adminEmail, createConfiguredClient } from './lib/supabase'
import { withFutureJwtRetry } from './lib/auth-retry'
import { AdminPanel } from './components/AdminPanel'
import { Dashboard } from './components/Dashboard'

const client = createConfiguredClient()

export default function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [error, setError] = useState('')
  const [adminOpen, setAdminOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const sourceFixture = fixture as DashboardFixture
  const load = useCallback(async () => {
    try {
      setSnapshot(await withFutureJwtRetry(() => loadDashboardData(client, sourceFixture)))
      setError('')
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu.'); setSnapshot(await loadDashboardData(null, sourceFixture)) }
  }, [])
  useEffect(() => {
    void load()
    if (!client) return
    void client.auth.getSession().then(({ data }) => setSession(data.session))
    const auth = client.auth.onAuthStateChange((_event, next) => { setSession(next); void load() })
    const channel = client.channel('price-dashboard').on('postgres_changes', { event: '*', schema: 'public' }, () => void load()).subscribe()
    return () => { auth.data.subscription.unsubscribe(); void client.removeChannel(channel) }
  }, [load])
  const actions = useMemo(() => ({
    signIn: async (password: string) => { if (!client) throw new Error('Chưa kết nối Supabase.'); await signInAdmin(client, adminEmail, password) },
    signOut: async () => { if (client) await client.auth.signOut(); setAdminOpen(false) },
    correction: async (payload: CorrectionPayload) => { if (!client) throw new Error('Chưa kết nối Supabase.'); await insertCorrection(client, payload); await load() },
    config: async (table: ConfigTable, values: Record<string, unknown>, id?: string) => { if (!client) throw new Error('Chưa kết nối Supabase.'); await saveConfig(client, table, values, id); await load() },
    export: async (granularity: Granularity) => { if (snapshot) await downloadWorkbook(granularity, snapshot) },
  }), [snapshot, load])
  if (!snapshot) return <main className="loading"><span className="spinner" />Đang tải dữ liệu…</main>
  return <>
    {error && <div className="offline-banner">Đang dùng dữ liệu dự phòng: {error}</div>}
    <Dashboard snapshot={snapshot} onExport={(value) => void actions.export(value)} onOpenAdmin={() => setAdminOpen(true)} />
    <AdminPanel open={adminOpen} authenticated={Boolean(session)} snapshot={snapshot} onClose={() => setAdminOpen(false)}
      onSignIn={actions.signIn} onSignOut={actions.signOut} onCorrection={actions.correction} onConfigMutation={actions.config} />
  </>
}
