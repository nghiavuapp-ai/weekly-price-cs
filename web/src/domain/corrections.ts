import type { ReviewStatus } from './price-data'

export interface CorrectionDraft {
  observationId: string
  correctedPrice: string
  correctedInStock: boolean | null
  reviewDecision: ReviewStatus
  note: string
}

export interface CorrectionPayload {
  observation_id: string
  corrected_price: number | null
  corrected_in_stock: boolean | null
  review_decision: ReviewStatus
  note: string
}

export type CorrectionResult =
  | { ok: true, value: CorrectionPayload }
  | { ok: false, error: string }

function parsePrice(value: string): number | null {
  const normalized = value.replace(/[^0-9-]/g, '')
  if (!normalized) return null
  const price = Number(normalized)
  return Number.isSafeInteger(price) && price > 0 ? price : null
}

export function validateCorrection(draft: CorrectionDraft): CorrectionResult {
  const note = draft.note.trim()
  if (!note) return { ok: false, error: 'Vui lòng nhập ghi chú audit.' }
  if (!draft.observationId) return { ok: false, error: 'Chưa chọn observation cần xử lý.' }

  const correctedPrice = parsePrice(draft.correctedPrice)
  if (draft.correctedPrice.trim() && correctedPrice == null) {
    return { ok: false, error: 'Giá sửa phải là số nguyên lớn hơn 0.' }
  }
  if (draft.correctedInStock === true && correctedPrice == null) {
    return { ok: false, error: 'Sản phẩm còn hàng phải có giá lớn hơn 0.' }
  }
  if (draft.reviewDecision === 'pending' && correctedPrice == null && draft.correctedInStock == null) {
    return { ok: false, error: 'Giữ Pending cần sửa giá hoặc tồn kho.' }
  }

  return {
    ok: true,
    value: {
      observation_id: draft.observationId,
      corrected_price: correctedPrice,
      corrected_in_stock: draft.correctedInStock,
      review_decision: draft.reviewDecision,
      note,
    },
  }
}
