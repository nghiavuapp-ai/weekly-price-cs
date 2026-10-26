import { describe, expect, it, vi } from 'vitest'

import type { EffectivePriceRow } from '../domain/price-data'
import type { DashboardFixture } from './data-source'
import { fetchStaticFallback, mergeDashboardFixtures } from './static-fallback'


const row = (overrides: Partial<EffectivePriceRow> = {}): EffectivePriceRow => ({
  id: 'daily-fpt', run_id: 'run-daily', product_id: 'product-1', product_name: 'iPhone 18 Pro 256GB',
  category: 'iPhone', capacity: '256GB', retailer_id: 'retailer-fpt', retailer_code: 'FPT', retailer_name: 'FPT',
  period_type: 'daily', period_key: '2026-10-26', period_start: '2026-10-26',
  observed_at: '2026-10-26T10:57:28+07:00', effective_price_vnd: 41_990_000,
  effective_in_stock: true, fetch_ok: true, effective_review_status: 'confirmed', confidence: 'HTML_OK',
  risk_flags: [], source_method: 'test', latest_correction_id: null, corrected_at: null, ...overrides,
})

const fixture = (rows: EffectivePriceRow[], generatedAt = '2026-10-26T04:20:00Z'): DashboardFixture => ({
  generatedAt, effectiveRows: rows, health: [], runs: [], products: [], retailers: [],
  productLinks: [], priceOverrides: [], corrections: [],
})

describe('static Daily fallback', () => {
  it('fetches a valid schema with cache disabled', async () => {
    const payload = { schemaVersion: 1, ...fixture([row()]), sourceSha256ByRun: { 'daily-20261026-primary': 'a'.repeat(64) } }
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => payload })

    const result = await fetchStaticFallback('https://example.test/daily.json', fetcher as unknown as typeof fetch)

    expect(result?.effectiveRows).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledWith('https://example.test/daily.json', { cache: 'no-store' })
  })

  it.each([
    ['404', { ok: false, json: async () => ({}) }],
    ['malformed JSON', { ok: true, json: async () => { throw new Error('bad json') } }],
    ['wrong schema', { ok: true, json: async () => ({ schemaVersion: 2, ...fixture([row()]) }) }],
    ['duplicate conflict', { ok: true, json: async () => ({ schemaVersion: 1, ...fixture([row(), row({ effective_price_vnd: 1 })]) }) }],
  ])('returns null for %s', async (_name, response) => {
    const fetcher = vi.fn().mockResolvedValue(response)
    await expect(fetchStaticFallback('https://example.test/daily.json', fetcher as unknown as typeof fetch)).resolves.toBeNull()
  })

  it('merges new Daily rows over the same natural key and retains base history', () => {
    const weekly = row({ id: 'weekly-old', period_type: 'weekly', period_key: 'W01', period_start: '2026-10-18' })
    const staleDaily = row({ id: 'daily-stale', effective_price_vnd: 40_000_000 })
    const overlay = { schemaVersion: 1, ...fixture([row()]), sourceSha256ByRun: { 'daily-20261026-primary': 'a'.repeat(64) } }

    const merged = mergeDashboardFixtures(fixture([weekly, staleDaily], '2026-09-11T00:00:00Z'), overlay)

    expect(merged.source).toBe('static-fallback')
    expect(merged.generatedAt).toBe('2026-10-26T04:20:00Z')
    expect(merged.effectiveRows.map((item) => item.id)).toEqual(['weekly-old', 'daily-fpt'])
  })

  it('uses the bundled fixture unchanged when the overlay is absent', () => {
    const base = fixture([row({ id: 'base' })])
    expect(mergeDashboardFixtures(base, null)).toBe(base)
  })
})
