import { describe, expect, it } from 'vitest'

import {
  buildDailyTimeline,
  assignDailyWeekIds,
  deriveFridayWeeklyRows,
  filterRows,
  mapEffectiveRow,
  selectDailyWeek,
  selectWeeklyWindow,
} from './price-data'
import type { EffectivePriceRow } from './price-data'

const effectiveRow = (overrides: Partial<EffectivePriceRow> = {}): EffectivePriceRow => ({
  id: 'obs-1',
  run_id: 'run-1',
  product_id: 'product-1',
  product_name: 'iPhone 17 256GB',
  category: 'iPhone',
  capacity: '256GB',
  retailer_id: 'retailer-1',
  retailer_code: 'FPT',
  retailer_name: 'FPT',
  period_type: 'weekly',
  period_key: 'W11Q4FY26',
  period_start: '2026-09-06',
  observed_at: '2026-09-11T12:00:00+07:00',
  effective_price_vnd: 28_490_000,
  effective_in_stock: true,
  fetch_ok: true,
  effective_review_status: 'confirmed',
  confidence: 'VERIFIED_RENDER',
  risk_flags: [],
  source_method: 'fpt_structured_offer_price',
  latest_correction_id: null,
  corrected_at: null,
  ...overrides,
})

describe('price data domain', () => {
  it('maps corrected effective fields instead of raw observation fields', () => {
    const mapped = mapEffectiveRow(effectiveRow())

    expect(mapped).toMatchObject({
      id: 'obs-1',
      model: 'iPhone 17 256GB',
      partner: 'FPT',
      priceVnd: 28_490_000,
      stockStatus: 'in_stock',
      reviewStatus: 'confirmed',
      weekId: 'W11Q4FY26',
    })
  })

  it('applies Weekly period, category, model, and partner filters together', () => {
    const rows = [
      mapEffectiveRow(effectiveRow()),
      mapEffectiveRow(effectiveRow({ id: 'obs-2', retailer_code: 'MW', retailer_name: 'MW' })),
      mapEffectiveRow(effectiveRow({ id: 'obs-3', period_key: 'W10Q4FY26' })),
      mapEffectiveRow(effectiveRow({ id: 'obs-4', category: 'Mac', product_name: 'MacBook Air' })),
    ]

    expect(filterRows(rows, {
      granularity: 'weekly',
      period: 'W11Q4FY26',
      category: 'iPhone',
      model: 'iPhone 17 256GB',
      partner: 'FPT',
    }).map((row) => row.id)).toEqual(['obs-1'])
  })

  it('keeps at most 13 Weekly periods in the selected fiscal quarter', () => {
    const rows = Array.from({ length: 15 }, (_, index) => mapEffectiveRow(effectiveRow({
      id: `obs-${index + 1}`,
      period_key: `W${index + 1}Q4FY26`,
      period_start: `2026-${String(6 + Math.floor(index / 4)).padStart(2, '0')}-${String((index % 4) * 7 + 1).padStart(2, '0')}`,
    })))
    rows.push(mapEffectiveRow(effectiveRow({ id: 'prior-quarter', period_key: 'W13Q3FY26', period_start: '2026-06-20' })))

    expect(selectWeeklyWindow(rows, 'W15Q4FY26').map((row) => row.weekId)).toEqual(
      Array.from({ length: 13 }, (_, index) => `W${index + 3}Q4FY26`),
    )
  })

  it('selects the seven calendar days ending on the chosen Daily date', () => {
    const rows = Array.from({ length: 9 }, (_, index) => mapEffectiveRow(effectiveRow({
      id: `daily-${index}`,
      period_type: 'daily',
      period_key: `2026-09-${String(5 + index).padStart(2, '0')}`,
      period_start: `2026-09-${String(5 + index).padStart(2, '0')}`,
      observed_at: `2026-09-${String(5 + index).padStart(2, '0')}T11:00:00+07:00`,
    })))

    expect(selectDailyWeek(rows, '2026-09-13').map((row) => row.date)).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13',
    ])
  })

  it('assigns Daily rows to the matching Apple Week from Weekly period starts', () => {
    const weekly = [mapEffectiveRow(effectiveRow({ period_key: 'W11Q4FY26', period_start: '2026-09-06' }))]
    const daily = [mapEffectiveRow(effectiveRow({
      id: 'daily', period_type: 'daily', period_key: '2026-09-11', period_start: '2026-09-11',
    }))]

    expect(assignDailyWeekIds(daily, weekly)[0].weekId).toBe('W11Q4FY26')
  })

  it('carries the last successful Daily value across a failed fetch and marks it stale', () => {
    const rows = [
      mapEffectiveRow(effectiveRow({
        id: 'ok', period_type: 'daily', period_key: '2026-09-10', period_start: '2026-09-10',
        observed_at: '2026-09-10T11:00:00+07:00',
      })),
      mapEffectiveRow(effectiveRow({
        id: 'failed', period_type: 'daily', period_key: '2026-09-11', period_start: '2026-09-11',
        observed_at: '2026-09-11T11:00:00+07:00', effective_price_vnd: null,
        effective_in_stock: null, fetch_ok: false, effective_review_status: 'pending',
      })),
    ]

    expect(buildDailyTimeline(rows).at(-1)).toMatchObject({
      id: 'ok',
      date: '2026-09-11',
      observedDate: '2026-09-10',
      priceVnd: 28_490_000,
      stale: true,
    })
  })

  it('uses the Friday Daily snapshot as Weekly and keeps older fallback weeks', () => {
    const weekly = [
      mapEffectiveRow(effectiveRow({ id: 'fallback-w10', period_key: 'W10Q4FY26', period_start: '2026-08-30', effective_price_vnd: 18_900_000 })),
      mapEffectiveRow(effectiveRow({ id: 'fallback-w11', period_key: 'W11Q4FY26', period_start: '2026-09-06', effective_price_vnd: 18_500_000 })),
    ]
    const daily = buildDailyTimeline(assignDailyWeekIds([
      mapEffectiveRow(effectiveRow({
        id: 'thursday', run_id: 'daily-thursday', period_type: 'daily', period_key: '2026-09-10',
        period_start: '2026-09-10', observed_at: '2026-09-10T11:00:00+07:00', effective_price_vnd: 18_200_000,
      })),
      mapEffectiveRow(effectiveRow({
        id: 'friday', run_id: 'daily-friday', period_type: 'daily', period_key: '2026-09-11',
        period_start: '2026-09-11', observed_at: '2026-09-11T15:30:00+07:00', effective_price_vnd: 17_900_000,
      })),
      mapEffectiveRow(effectiveRow({
        id: 'saturday', run_id: 'daily-saturday', period_type: 'daily', period_key: '2026-09-12',
        period_start: '2026-09-12', observed_at: '2026-09-12T11:00:00+07:00', effective_price_vnd: 17_500_000,
      })),
    ], weekly))

    const derived = deriveFridayWeeklyRows(daily, weekly)

    expect(derived).toHaveLength(2)
    expect(derived.find((row) => row.weekId === 'W10Q4FY26')).toMatchObject({ id: 'fallback-w10', priceVnd: 18_900_000 })
    expect(derived.find((row) => row.weekId === 'W11Q4FY26')).toMatchObject({
      id: 'friday-weekly:friday', runId: 'daily-friday', granularity: 'weekly', periodKey: 'W11Q4FY26',
      weekId: 'W11Q4FY26', date: '2026-09-06', observedDate: '2026-09-11', priceVnd: 17_900_000,
    })
  })

  it('derives Apple Week IDs for Daily dates even before a Weekly crawl exists', () => {
    const daily = [mapEffectiveRow(effectiveRow({
      id: 'future-friday', period_type: 'daily', period_key: '2026-09-18', period_start: '2026-09-18',
      observed_at: '2026-09-18T11:00:00+07:00', effective_price_vnd: 17_700_000,
    }))]

    expect(assignDailyWeekIds(daily, [])[0].weekId).toBe('W12Q4FY26')
  })
})
