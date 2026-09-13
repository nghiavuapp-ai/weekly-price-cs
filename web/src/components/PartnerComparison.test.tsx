import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PriceRow } from '../domain/price-data'
import { PartnerComparison } from './PartnerComparison'

const row: PriceRow = {
  id: 'price-1',
  runId: 'run-1',
  productId: 'iphone-17-pro-max-256',
  retailerId: 'fpt',
  observedDate: '2026-09-13',
  observedAt: '2026-09-13T09:00:00+07:00',
  granularity: 'daily',
  periodKey: '2026-09-13',
  weekId: 'W11Q4FY26',
  category: 'iPhone',
  model: 'iPhone 17 Pro Max 256GB',
  capacity: '256GB',
  partner: 'FPT',
  partnerName: 'FPT',
  priceVnd: 34_590_000,
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
}

describe('PartnerComparison', () => {
  it('uses five analytical columns and omits the status column', () => {
    render(<PartnerComparison rows={[row]} priorRows={[]} model={row.model} />)

    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
    expect(screen.queryByRole('columnheader', { name: /trạng thái/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Đã xác nhận')).not.toBeInTheDocument()
  })
})
