import { describe, expect, it } from 'vitest'

import type { EffectivePriceRow } from '../domain/price-data'
import { loadDashboardData, type DashboardFixture } from './data-source'

const row = (overrides: Partial<EffectivePriceRow> = {}): EffectivePriceRow => ({
  id: 'weekly', run_id: 'run-weekly', product_id: 'product-1', product_name: 'iPhone 17 128GB',
  category: 'iPhone', capacity: '128GB', retailer_id: 'retailer-1', retailer_code: 'FPT',
  retailer_name: 'FPT', period_type: 'weekly', period_key: 'W11Q4FY26', period_start: '2026-09-06',
  observed_at: '2026-09-06T12:00:00+07:00', effective_price_vnd: 16_990_000,
  effective_in_stock: true, fetch_ok: true, effective_review_status: 'confirmed', confidence: 'high',
  risk_flags: [], source_method: 'test', latest_correction_id: null, corrected_at: null, ...overrides,
})

describe('dashboard data source', () => {
  it('uses the generated fixture without credentials and preserves pending failures separately from stale display rows', async () => {
    const fixture: DashboardFixture = {
      generatedAt: '2026-09-11T00:00:00+07:00',
      effectiveRows: [
        row(),
        row({ id: 'daily-ok', run_id: 'run-daily', period_type: 'daily', period_key: '2026-09-10', period_start: '2026-09-10', observed_at: '2026-09-10T11:00:00+07:00' }),
        row({ id: 'daily-failed', run_id: 'run-daily-failed', period_type: 'daily', period_key: '2026-09-11', period_start: '2026-09-11', observed_at: '2026-09-11T11:00:00+07:00', effective_price_vnd: null, effective_in_stock: null, fetch_ok: false, effective_review_status: 'pending' }),
      ],
      health: [{ check_name: 'retry_unresolved', healthy: false, detail: { unresolved_runs: 1 } }],
      runs: [], products: [], retailers: [], productLinks: [], priceOverrides: [],
    }

    const snapshot = await loadDashboardData(null, fixture)

    expect(snapshot.source).toBe('fixture')
    expect(snapshot.weeklyRows).toHaveLength(1)
    expect(snapshot.dailyRows.at(-1)).toMatchObject({ id: 'daily-ok', date: '2026-09-11', stale: true })
    expect(snapshot.pendingRows.map((item) => item.id)).toEqual(['daily-failed'])
    expect(snapshot.health[0].healthy).toBe(false)
  })
})
