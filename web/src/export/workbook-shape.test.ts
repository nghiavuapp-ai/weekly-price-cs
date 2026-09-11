import { describe, expect, it } from 'vitest'

import type { PriceRow } from '../domain/price-data'
import { shapeDailyWorkbook, shapeWeeklyWorkbook } from './workbook-shape'

const priceRow = (overrides: Partial<PriceRow> = {}): PriceRow => ({
  id: 'obs-1', runId: 'run-1', productId: 'product-1', retailerId: 'retailer-1',
  model: 'iPhone 17 128GB', category: 'iPhone', capacity: '128GB', partner: 'FPT',
  partnerName: 'FPT', granularity: 'weekly', periodKey: 'W11Q4FY26', weekId: 'W11Q4FY26',
  date: '2026-09-06', observedAt: '2026-09-06T12:00:00+07:00', observedDate: '2026-09-06',
  priceVnd: 16_990_000, stockStatus: 'in_stock', fetchOk: true, reviewStatus: 'confirmed',
  confidence: 'high', riskFlags: [], sourceMethod: 'historical_workbook', correctionId: null,
  correctedAt: null, stale: false, ...overrides,
})

describe('Excel workbook shaping', () => {
  it('creates week-named Weekly sheets with stable partner columns', () => {
    const workbook = shapeWeeklyWorkbook([
      priceRow(),
      priceRow({ id: 'obs-2', retailerId: 'retailer-2', partner: 'MW', partnerName: 'MW', priceVnd: 16_490_000 }),
      priceRow({ id: 'obs-3', periodKey: 'W10Q4FY26', weekId: 'W10Q4FY26', date: '2026-08-30', priceVnd: 17_490_000 }),
    ])

    expect(workbook.map((sheet) => sheet.name)).toEqual(['W10Q4FY26', 'W11Q4FY26'])
    expect(workbook[1].headers).toEqual(['Model', 'Category', 'Capacity', 'FPT', 'MW'])
    expect(workbook[1].rows).toEqual([
      ['iPhone 17 128GB', 'iPhone', '128GB', 16_990_000, 16_490_000],
    ])
  })

  it('creates Daily Latest, Changes, and Run Log with established headers', () => {
    const workbook = shapeDailyWorkbook([
      priceRow({ granularity: 'daily', periodKey: '2026-09-10', weekId: 'W11Q4FY26', date: '2026-09-10' }),
      priceRow({ id: 'obs-2', granularity: 'daily', periodKey: '2026-09-11', weekId: 'W11Q4FY26', date: '2026-09-11' }),
    ], [])

    expect(workbook.map((sheet) => sheet.name)).toEqual(['Latest', 'Changes', 'Run Log'])
    expect(workbook[0].headers).toEqual([
      'Key', 'Model', 'Retailer', 'Current Value', 'Stock Status', 'Previous Value', 'Delta VND',
      'First Seen', 'Last Changed', 'Last Checked', 'Confidence', 'Risk Flags', 'Review Status',
      'Source Method', 'URL', 'Run ID',
    ])
    expect(workbook[1].headers).toEqual([
      'Event ID', 'Detected At', 'Model', 'Retailer', 'Change Type', 'Old Value', 'New Value',
      'Delta VND', 'Delta Percent', 'Confidence', 'Risk Flags', 'Review Status', 'Source Method',
      'URL', 'Run ID',
    ])
    expect(workbook[2].headers).toEqual([
      'Run ID', 'Parent Run ID', 'Run Type', 'Started At', 'Completed At', 'Total Targets', 'OK',
      'OOS', 'Errors', 'Changes', 'Review Needed', 'Status', 'Snapshot Path', 'Review Path', 'Backup Path',
    ])
  })

  it('records Daily price and stock transitions without treating the baseline as a change', () => {
    const workbook = shapeDailyWorkbook([
      priceRow({ granularity: 'daily', periodKey: '2026-09-10', date: '2026-09-10', observedAt: '2026-09-10T11:00:00+07:00' }),
      priceRow({ id: 'obs-2', granularity: 'daily', periodKey: '2026-09-11', date: '2026-09-11', observedAt: '2026-09-11T11:00:00+07:00', priceVnd: 15_990_000 }),
      priceRow({ id: 'obs-3', productId: 'product-2', model: 'iPhone 13 128GB', granularity: 'daily', periodKey: '2026-09-10', date: '2026-09-10', observedAt: '2026-09-10T11:00:00+07:00', priceVnd: 12_990_000 }),
      priceRow({ id: 'obs-4', productId: 'product-2', model: 'iPhone 13 128GB', granularity: 'daily', periodKey: '2026-09-11', date: '2026-09-11', observedAt: '2026-09-11T11:00:00+07:00', priceVnd: null, stockStatus: 'oos' }),
    ], [])

    expect(workbook[1].rows).toHaveLength(2)
    expect(workbook[1].rows.map((row) => row[4]).sort()).toEqual(['Price', 'Stock'])
    expect(workbook[1].rows.find((row) => row[4] === 'Price')?.slice(5, 9)).toEqual([
      16_990_000, 15_990_000, -1_000_000, -5.885815185403178,
    ])
  })
})
