import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PriceRow } from '../domain/price-data'
import type { DashboardSnapshot } from '../data/data-source'
import { Dashboard } from './Dashboard'

const priceRow = (overrides: Partial<PriceRow> = {}): PriceRow => ({
  id: 'weekly-fpt', runId: 'run-weekly', productId: 'product-1', retailerId: 'retailer-fpt',
  model: 'iPhone 17 128GB', category: 'iPhone', capacity: '128GB', partner: 'FPT', partnerName: 'FPT',
  granularity: 'weekly', periodKey: 'W11Q4FY26', weekId: 'W11Q4FY26', date: '2026-09-06',
  observedAt: '2026-09-06T12:00:00+07:00', observedDate: '2026-09-06', priceVnd: 16_990_000,
  stockStatus: 'in_stock', fetchOk: true, reviewStatus: 'confirmed', confidence: 'high', riskFlags: [],
  sourceMethod: 'test', correctionId: null, correctedAt: null, stale: false, ...overrides,
})

const snapshot: DashboardSnapshot = {
  source: 'fixture', generatedAt: '2026-09-11T00:00:00+07:00',
  weeklyRows: [
    priceRow({ id: 'weekly-old', periodKey: 'W10Q4FY26', weekId: 'W10Q4FY26', date: '2026-08-30', priceVnd: 17_490_000 }),
    priceRow(),
    priceRow({ id: 'weekly-mw', retailerId: 'retailer-mw', partner: 'MW', partnerName: 'MW', priceVnd: 16_490_000 }),
  ],
  dailyRows: [
    priceRow({ id: 'daily-fpt', runId: 'run-daily', granularity: 'daily', periodKey: '2026-09-10', weekId: 'W11Q4FY26', date: '2026-09-10', observedAt: '2026-09-10T11:00:00+07:00', observedDate: '2026-09-10', priceVnd: 16_790_000 }),
  ],
  pendingRows: [], health: [], runs: [], products: [], retailers: [], productLinks: [], priceOverrides: [], corrections: [],
}

describe('Dashboard', () => {
  it('opens on the latest Weekly matrix and drills a selected model into its available Daily week', async () => {
    const user = userEvent.setup()
    render(<Dashboard snapshot={snapshot} onExport={vi.fn()} onOpenAdmin={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Weekly Price' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tuần' })).toHaveValue('W11Q4FY26')
    expect(screen.getByText('16,49 tr')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'iPhone 17 128GB')
    expect(screen.getByRole('heading', { name: 'Diễn biến giá theo Partner' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Xem Daily iPhone 17 128GB · W11Q4FY26' }))
    expect(screen.getByRole('heading', { name: 'Daily Price' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Ngày' })).toHaveValue('2026-09-10')
    expect(screen.getByText('Chưa kiểm tra lại', { exact: false })).toBeInTheDocument()
  })
})
