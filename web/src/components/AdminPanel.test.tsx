import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { DashboardSnapshot } from '../data/data-source'
import { AdminPanel } from './AdminPanel'

const snapshot: DashboardSnapshot = {
  source: 'fixture', generatedAt: '', weeklyRows: [], dailyRows: [],
  pendingRows: [], health: [], runs: [], products: [], retailers: [], productLinks: [], priceOverrides: [],
  corrections: [],
}

describe('AdminPanel', () => {
  it('asks only for a password before authentication', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AdminPanel open authenticated={false} snapshot={snapshot} onClose={vi.fn()} onSignIn={onSignIn}
      onSignOut={vi.fn()} onCorrection={vi.fn()} onConfigMutation={vi.fn()} onExport={vi.fn()} />)

    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret-value')
    await user.click(screen.getByRole('button', { name: 'Mở khóa' }))
    expect(onSignIn).toHaveBeenCalledWith('secret-value')
  })

  it('shows pending review and configuration tools after authentication', () => {
    render(<AdminPanel open authenticated snapshot={snapshot} onClose={vi.fn()} onSignIn={vi.fn()}
      onSignOut={vi.fn()} onCorrection={vi.fn()} onConfigMutation={vi.fn()} onExport={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Quản trị Price Check' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Duyệt giá' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Danh mục crawl' })).toBeInTheDocument()
  })

  it('can create a product URL from the catalog tool', async () => {
    const onConfigMutation = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const configured = {
      ...snapshot,
      products: [{ id: 'product-1', name: 'iPhone 17', category: 'iPhone', capacity: '128GB', active: true }],
      retailers: [{ id: 'retailer-1', code: 'FPT', name: 'FPT Shop', active: true }],
    }
    render(<AdminPanel open authenticated snapshot={configured} onClose={vi.fn()} onSignIn={vi.fn()}
      onSignOut={vi.fn()} onCorrection={vi.fn()} onConfigMutation={onConfigMutation} onExport={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Danh mục crawl' }))
    await user.type(screen.getByLabelText('URL sản phẩm'), 'https://example.com/iphone-17')
    await user.click(screen.getByRole('button', { name: 'Thêm URL' }))
    expect(onConfigMutation).toHaveBeenCalledWith('product_links', {
      product_id: 'product-1', retailer_id: 'retailer-1', url: 'https://example.com/iphone-17', active: true,
    })
  })

  it('keeps the Daily Excel download inside the authenticated admin tool', async () => {
    const onExport = vi.fn()
    const user = userEvent.setup()
    render(<AdminPanel open authenticated snapshot={snapshot} onClose={vi.fn()} onSignIn={vi.fn()}
      onSignOut={vi.fn()} onCorrection={vi.fn()} onConfigMutation={vi.fn()} onExport={onExport} />)
    await user.click(screen.getByRole('button', { name: 'Tải Excel Daily' }))
    expect(onExport).toHaveBeenCalledWith('daily')
  })
})
