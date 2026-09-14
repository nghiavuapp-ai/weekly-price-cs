import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PriceRow } from '../domain/price-data'
import { TrendChart } from './TrendChart'

const row = (overrides: Partial<PriceRow>): PriceRow => ({
  id: 'row', runId: 'run', productId: 'product', retailerId: 'retailer',
  model: 'iPhone 17 Pro Max 256GB', category: 'iPhone', capacity: '256GB',
  partner: 'FPT', partnerName: 'FPT', granularity: 'weekly', periodKey: 'W11Q4FY26',
  weekId: 'W11Q4FY26', date: '2026-09-06', observedAt: '2026-09-06T12:00:00+07:00',
  observedDate: '2026-09-06', priceVnd: 19_000_000, stockStatus: 'in_stock', fetchOk: true,
  reviewStatus: 'confirmed', confidence: 'high', riskFlags: [], sourceMethod: 'test',
  correctionId: null, correctedAt: null, stale: false, ...overrides,
})

describe('TrendChart', () => {
  it('keeps the active guide on the same x coordinate as the hovered data points', () => {
    const { container } = render(<TrendChart rows={[
      row({ id: 'fpt-w10', periodKey: 'W10Q4FY26', weekId: 'W10Q4FY26', priceVnd: 18_000_000 }),
      row({ id: 'fpt-w11', priceVnd: 19_000_000 }),
    ]} model="iPhone 17 Pro Max 256GB" granularity="weekly" dailyWeeks={new Set()} onDrillDown={() => undefined} />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Xem giá W11Q4FY26' }))

    const guide = screen.getByTestId('chart-active-guide')
    const point = [...container.querySelectorAll('circle')].find((circle) => circle.getAttribute('cx') === '940')
    expect(point).toBeDefined()
    expect(guide).toHaveAttribute('x1', point?.getAttribute('cx'))
    expect(guide).toHaveAttribute('x2', point?.getAttribute('cx'))
  })

  it('shows every Partner value together when hovering a weekly point', () => {
    render(<TrendChart rows={[
      row({ id: 'fpt-w10', partner: 'FPT', partnerName: 'FPT', periodKey: 'W10Q4FY26', weekId: 'W10Q4FY26', priceVnd: 18_000_000 }),
      row({ id: 'cps-w10', partner: 'CPS', partnerName: 'CPS', periodKey: 'W10Q4FY26', weekId: 'W10Q4FY26', priceVnd: 18_300_000 }),
      row({ id: 'fpt-w11', partner: 'FPT', partnerName: 'FPT', priceVnd: 19_000_000 }),
      row({ id: 'cps-w11', partner: 'CPS', partnerName: 'CPS', priceVnd: 18_500_000 }),
    ]} model="iPhone 17 Pro Max 256GB" granularity="weekly" dailyWeeks={new Set()} onDrillDown={() => undefined} />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Xem giá W11Q4FY26' }))
    const tooltip = screen.getByRole('tooltip')
    expect(within(tooltip).getByText('W11Q4FY26')).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('FPT19 tr')
    expect(tooltip).toHaveTextContent('CPS18,5 tr')
  })
})
