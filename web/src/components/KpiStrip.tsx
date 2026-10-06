import type { Granularity, PriceRow } from '../domain/price-data'
import { priceChange } from '../domain/price-data'
import { compactPrice } from './PriceMatrix'

interface KpiStripProps {
  rows: PriceRow[]
  priorRows: PriceRow[]
  allPartnerCount: number
  granularity: Granularity
}

export function KpiStrip({ rows, priorRows, allPartnerCount, granularity }: KpiStripProps) {
  const models = [...new Set(rows.map((row) => row.model))]
  const activePartners = [...new Set(rows.filter((row) => row.priceVnd != null).map((row) => row.partner))]
  const outOfStock = new Set(rows.filter((row) => row.stockStatus === 'oos').map((row) => row.model)).size
  const changes = rows.filter((row) => {
    const previous = priorRows.find((candidate) => candidate.model === row.model && candidate.partner === row.partner)
    return priceChange(row, previous)
  }).map((row) => priceChange(row, priorRows.find((candidate) => candidate.model === row.model && candidate.partner === row.partner))!)
  let largestGap = 0
  let gapModel = ''
  for (const model of models) {
    const values = rows.filter((row) => row.model === model && row.priceVnd != null).map((row) => row.priceVnd as number)
    const gap = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0
    if (gap > largestGap) { largestGap = gap; gapModel = model }
  }
  const cards = [
    { icon: '◌', label: 'Model check', value: String(models.length), note: `${outOfStock} model có OOS` },
    { icon: '◉', label: 'Partner có giá', value: `${activePartners.length}/${allPartnerCount}`, note: `${rows.filter((row) => row.priceVnd != null).length.toLocaleString('vi-VN')} check có giá` },
    { icon: '↕', label: granularity === 'daily' ? 'Thay đổi ngày' : 'Thay đổi tuần', value: String(changes.length), note: changes.length ? `${changes.filter((change) => change.kind === 'decrease').length} giảm · ${changes.filter((change) => change.kind === 'increase').length} tăng · ${changes.filter((change) => change.delta == null).length} tồn kho` : 'Không có thay đổi' },
    { icon: '⇄', label: 'Chênh lệch lớn nhất', value: largestGap ? compactPrice(largestGap) : '—', note: gapModel || 'Cần ít nhất 2 Partner có giá' },
  ]
  return <section className="section kpis" aria-label="Chỉ số tổng quan">{cards.map((card) => (
    <article className="kpi" key={card.label}><span className="kpi-icon" aria-hidden="true">{card.icon}</span><div className="kpi-label">{card.label}</div><div className="kpi-value">{card.value}</div><div className="kpi-note">{card.note}</div></article>
  ))}</section>
}
