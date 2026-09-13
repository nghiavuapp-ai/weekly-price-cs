import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PriceRow } from '../domain/price-data'
import { PriceMatrix } from './PriceMatrix'

const makeRow = (overrides: Partial<PriceRow> = {}): PriceRow => ({
  id: 'price-1',
  runId: 'run-1',
  productId: 'iphone-15-128',
  retailerId: 'fpt',
  observedDate: '2026-09-13',
  observedAt: '2026-09-13T09:00:00+07:00',
  granularity: 'daily',
  periodKey: '2026-09-13',
  weekId: 'W11Q4FY26',
  category: 'iPhone',
  model: 'iPhone 15 128GB',
  capacity: '128GB',
  partner: 'FPT',
  partnerName: 'FPT',
  priceVnd: 19_000_000,
  stockStatus: 'in_stock',
  fetchOk: true,
  reviewStatus: 'confirmed',
  confidence: 'high',
  riskFlags: [],
  sourceMethod: 'test',
  correctionId: null,
  correctedAt: null,
  date: '2026-09-13',
  stale: false,
  ...overrides,
})

describe('PriceMatrix', () => {
  it('shows a no-percent tooltip for a numeric price increase versus the prior check', () => {
    render(
      <PriceMatrix
        rows={[makeRow()]}
        priorRows={[
          makeRow({
            observedDate: '2026-09-12',
            observedAt: '2026-09-12T09:00:00+07:00',
            periodKey: '2026-09-12',
            date: '2026-09-12',
            priceVnd: 18_000_000,
          }),
        ]}
        partners={['FPT']}
        periodLabel="13/09/2026"
        granularityLabel="Ngày"
      />,
    )

    const marker = screen.getByRole('button', { name: /FPT tăng 1 tr/i })
    fireEvent.mouseEnter(marker)

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Lần check trước · 12/09/2026')
    expect(tooltip).toHaveTextContent('18 tr → 19 tr')
    expect(tooltip).toHaveTextContent('↑ Tăng 1 tr')
    expect(tooltip).not.toHaveTextContent('%')
  })

  it('does not show a change marker for unchanged or first-observation prices', () => {
    render(
      <PriceMatrix
        rows={[
          makeRow({ riskFlags: ['WARN_WEEK_CHANGE'] }),
          makeRow({ model: 'iPhone 16 128GB', partner: 'CPS', priceVnd: 22_000_000 }),
        ]}
        priorRows={[
          makeRow({
            observedDate: '2026-09-12',
            observedAt: '2026-09-12T09:00:00+07:00',
            periodKey: '2026-09-12',
            date: '2026-09-12',
          }),
        ]}
        partners={['FPT', 'CPS']}
        periodLabel="13/09/2026"
        granularityLabel="Ngày"
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a green decrease in the tooltip', () => {
    render(
      <PriceMatrix
        rows={[makeRow({ priceVnd: 17_500_000 })]}
        priorRows={[makeRow({ periodKey: '2026-09-12', date: '2026-09-12', priceVnd: 18_000_000 })]}
        partners={['FPT']}
        periodLabel="13/09/2026"
        granularityLabel="Ngày"
      />,
    )

    fireEvent.mouseEnter(screen.getByRole('button', { name: /FPT giảm 0,5 tr/i }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('↓ Giảm 0,5 tr')
  })

  it('labels a weekly comparison by the prior week instead of its source timestamp', () => {
    render(<PriceMatrix
      rows={[makeRow({ granularity: 'weekly', periodKey: 'W11Q4FY26', weekId: 'W11Q4FY26' })]}
      priorRows={[makeRow({ granularity: 'weekly', periodKey: 'W10Q4FY26', weekId: 'W10Q4FY26', observedAt: '2026-08-30T12:00:00+07:00', priceVnd: 18_000_000 })]}
      partners={['FPT']} periodLabel="W11Q4FY26" granularityLabel="tuần" />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: /FPT tăng 1 tr/i }))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Lần check trước · W10Q4FY26')
    expect(tooltip).not.toHaveTextContent('30/08/2026')
  })
})
