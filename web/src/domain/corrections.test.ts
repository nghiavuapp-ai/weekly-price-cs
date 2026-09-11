import { describe, expect, it } from 'vitest'

import { validateCorrection } from './corrections'

describe('correction validation', () => {
  it('builds a confirmation decision without rewriting the observation', () => {
    expect(validateCorrection({
      observationId: 'obs-1',
      reviewDecision: 'confirmed',
      correctedPrice: '',
      correctedInStock: null,
      note: 'Đã đối chiếu CTA mua hàng.',
    })).toEqual({
      ok: true,
      value: {
        observation_id: 'obs-1',
        corrected_price: null,
        corrected_in_stock: null,
        review_decision: 'confirmed',
        note: 'Đã đối chiếu CTA mua hàng.',
      },
    })
  })

  it('accepts a corrected positive integer price and keeps the review Pending', () => {
    expect(validateCorrection({
      observationId: 'obs-1',
      reviewDecision: 'pending',
      correctedPrice: '27.990.000',
      correctedInStock: true,
      note: 'Giá hiển thị sau ưu đãi trực tiếp.',
    })).toMatchObject({
      ok: true,
      value: { corrected_price: 27_990_000, corrected_in_stock: true, review_decision: 'pending' },
    })
  })

  it('rejects an in-stock correction without a positive price', () => {
    expect(validateCorrection({
      observationId: 'obs-1',
      reviewDecision: 'confirmed',
      correctedPrice: '',
      correctedInStock: true,
      note: 'Đã kiểm tra.',
    })).toEqual({ ok: false, error: 'Sản phẩm còn hàng phải có giá lớn hơn 0.' })
  })

  it('rejects a Pending decision that makes no correction', () => {
    expect(validateCorrection({
      observationId: 'obs-1',
      reviewDecision: 'pending',
      correctedPrice: '',
      correctedInStock: null,
      note: 'Tiếp tục theo dõi.',
    })).toEqual({ ok: false, error: 'Giữ Pending cần sửa giá hoặc tồn kho.' })
  })

  it('requires an audit note for every review decision', () => {
    expect(validateCorrection({
      observationId: 'obs-1',
      reviewDecision: 'rejected',
      correctedPrice: '',
      correctedInStock: null,
      note: '   ',
    })).toEqual({ ok: false, error: 'Vui lòng nhập ghi chú audit.' })
  })
})
