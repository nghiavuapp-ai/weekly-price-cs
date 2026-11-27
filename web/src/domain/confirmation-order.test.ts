import { describe, expect, it } from 'vitest'
import { buildDailyTimeline, mapEffectiveRow, type EffectivePriceRow } from './price-data'
import { loadDashboardData, preferFreshSnapshot, type DashboardFixture } from '../data/data-source'

const observedAt = '2026-11-25T10:59:46+07:00'
const source = (overrides: Partial<EffectivePriceRow> = {}): EffectivePriceRow => ({
  id: 'primary', run_id: 'primary-run', product_id: 'iphone-pro-512',
  product_name: 'iPhone 18 Pro 512GB', category: 'iPhone', capacity: '512GB',
  retailer_id: 'fpt', retailer_code: 'FPT', retailer_name: 'FPT',
  period_type: 'daily', period_key: '2026-11-25', period_start: '2026-11-25',
  observed_at: observedAt, effective_price_vnd: null, effective_in_stock: false,
  fetch_ok: true, effective_review_status: 'confirmed', confidence: 'OOS_CONFIRMED',
  risk_flags: [], source_method: 'html_action:button', latest_correction_id: null,
  corrected_at: null, ...overrides,
})
const confirmed = source({
  id: 'confirmation', run_id: 'confirmation-run', effective_price_vnd: 45_490_000,
  effective_in_stock: true, confidence: 'USER_CONFIRMED', source_method: 'audited_correction',
})
const times = new Map([['confirmation-run', '2026-11-25T12:07:36+07:00']])

describe('Daily confirmations preserve the source clock without losing precedence', () => {
  it.each([false, true])('replaces an OOS at the same source clock regardless of row order: %s', (reverse) => {
    const rows = [source(), confirmed].map(mapEffectiveRow)
    const latest = buildDailyTimeline(reverse ? rows.reverse() : rows, times).at(-1)
    expect(latest).toMatchObject({ id: 'confirmation', priceVnd: 45_490_000, stockStatus: 'in_stock', observedAt })
  })

  it('allows a real observation after the confirmation to supersede it', () => {
    const live = source({ id: 'later-live', observed_at: '2026-11-25T13:00:00+07:00',
      effective_price_vnd: 45_390_000, effective_in_stock: true })
    expect(buildDailyTimeline([confirmed, live].map(mapEffectiveRow), times).at(-1)?.id).toBe('later-live')
  })

  it('orders successive confirmations by their own completion clocks', () => {
    const second = { ...confirmed, id: 'second-confirmation', run_id: 'second-run', effective_price_vnd: 45_290_000 }
    const clocks = new Map([...times, ['second-run', '2026-11-25T14:00:00+07:00']])
    expect(buildDailyTimeline([second, confirmed].map(mapEffectiveRow), clocks).at(-1)?.id).toBe('second-confirmation')
  })

  it('passes the separate confirmation clock through the dashboard loader', async () => {
    const fixture: DashboardFixture = {
      generatedAt: '2026-11-25T12:08:00+07:00', effectiveRows: [source(), confirmed],
      runs: [{ id: 'confirmation-run', parent_run_id: null, run_type: 'manual',
        started_at: times.get('confirmation-run')!, completed_at: times.get('confirmation-run')!,
        total_targets: 1, ok_count: 1, oos_count: 0, error_count: 0,
        change_count: 1, review_count: 0, status: 'success' }],
      health: [], products: [], retailers: [], productLinks: [], priceOverrides: [],
    }
    const result = await loadDashboardData(null, fixture)
    expect(result.dailyRows.at(-1)).toMatchObject({ id: 'confirmation', priceVnd: 45_490_000, observedAt })
  })
})

// Synthetic regression matching the missing confirmed cells reported 27/11.
describe('source completeness before choosing realtime', () => {
  it.each([null, 47_490_000])('retains a known result when same-day realtime omits its pair: %s', async (price) => {
    const base: DashboardFixture = { generatedAt: '', effectiveRows: [], health: [], runs: [],
      products: [], retailers: [], productLinks: [], priceOverrides: [] }
    const anchor = source({ id: 'anchor', product_id: 'other-product',
      period_key: '2026-11-27', period_start: '2026-11-27', observed_at: '2026-11-27T11:00:00+07:00' })
    const known = source({ id: 'known', period_key: '2026-11-18', period_start: '2026-11-18',
      observed_at: '2026-11-18T11:00:00+07:00', effective_price_vnd: price,
      effective_in_stock: price != null, source_method: 'audited_correction', confidence: 'USER_CONFIRMED' })
    const failed = source({ id: 'failed', period_key: '2026-11-27', period_start: '2026-11-27',
      fetch_ok: false, effective_in_stock: null })
    const fallback = await loadDashboardData(null, { ...base, source: 'static-fallback', effectiveRows: [known, failed, anchor] })
    const realtime = await loadDashboardData(null, { ...base, effectiveRows: [failed, anchor] })
    realtime.source = 'supabase'
    const selected = preferFreshSnapshot(realtime, fallback)
    expect(selected.source).toBe('static-fallback')
    expect(selected.dailyRows.find(r => r.productId === known.product_id && r.date === '2026-11-27'))
      .toMatchObject({ priceVnd: price, stockStatus: price == null ? 'oos' : 'in_stock',
        observedAt: known.observed_at, stale: true })
    const expectedWeek = selected.weeklyRows.find(r => r.productId === anchor.product_id)?.periodKey
    expect(selected.weeklyRows.find(r => r.productId === known.product_id)?.periodKey).toBe(expectedWeek)
    // Once realtime contains the same known pair, it is eligible again.
    expect(preferFreshSnapshot({ ...fallback, source: 'supabase' }, fallback).source).toBe('supabase')
  })
})
