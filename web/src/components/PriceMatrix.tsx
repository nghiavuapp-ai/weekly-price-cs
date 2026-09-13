import { useState } from 'react'
import type { PriceRow } from '../domain/price-data'

export const compactPrice = (value: number | null) => value == null
  ? '—'
  : `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr`

interface PriceMatrixProps {
  rows: PriceRow[]
  priorRows: PriceRow[]
  partners: string[]
  periodLabel: string
  granularityLabel: string
}

function changeKey(model: string, partner: string) {
  return `${model}::${partner}`
}

function priorPeriodLabel(row: PriceRow) {
  if (row.granularity === 'weekly') return row.periodKey
  const [year, month, day] = row.periodKey.split('-')
  return year && month && day ? `${day}/${month}/${year}` : row.periodKey
}

export function PriceMatrix({ rows, priorRows, partners, periodLabel, granularityLabel }: PriceMatrixProps) {
  const [activeChange, setActiveChange] = useState<string | null>(null)
  const models = [...new Set(rows.map((row) => row.model))].sort((a, b) => a.localeCompare(b, 'vi'))
  const priorByModelPartner = new Map(priorRows.map((row) => [changeKey(row.model, row.partner), row]))
  return (
    <section className="section panel" aria-labelledby="matrix-title">
      <div className="section-head"><div><h2 id="matrix-title">Bảng giá</h2><p>So sánh giá cùng model giữa các Partner tại {granularityLabel} đang chọn.</p></div></div>
      <div className="matrix-meta">{models.length} model · {partners.length} Partner · {periodLabel}</div>
      <div className="scroll">
        <table className="matrix-table">
          <thead><tr><th>Base model</th>{partners.map((partner) => <th key={partner}>{partner}</th>)}</tr></thead>
          <tbody>{models.length ? models.map((model) => {
            const cells = partners.map((partner) => rows.find((row) => row.model === model && row.partner === partner))
            const lowest = Math.min(...cells.flatMap((row) => row?.priceVnd != null ? [row.priceVnd] : []), Number.POSITIVE_INFINITY)
            return <tr key={model}><td>{model}</td>{cells.map((row, index) => {
              if (!row) return <td className="missing" key={partners[index]}>—</td>
              const prior = priorByModelPartner.get(changeKey(row.model, row.partner))
              const delta = row.priceVnd != null && prior?.priceVnd != null ? row.priceVnd - prior.priceVnd : null
              const changed = delta != null && delta !== 0
              const key = changeKey(row.model, row.partner)
              const partnerLabel = row.partnerName || row.partner
              const changeLabel = changed ? `${partnerLabel} ${delta > 0 ? 'tăng' : 'giảm'} ${compactPrice(Math.abs(delta))} so với lần check trước` : ''
              const marker = changed && prior ? <button
                type="button"
                className="change-marker"
                aria-label={changeLabel}
                aria-describedby={activeChange === key ? `change-${row.id}` : undefined}
                onMouseEnter={() => setActiveChange(key)}
                onMouseLeave={() => setActiveChange(null)}
                onFocus={() => setActiveChange(key)}
                onBlur={() => setActiveChange(null)}
              >
                !
                {activeChange === key && <span className="change-tooltip" id={`change-${row.id}`} role="tooltip">
                  <strong>{partnerLabel}</strong>
                  <span>Lần check trước · {priorPeriodLabel(prior)}</span>
                  <span>{compactPrice(prior.priceVnd)} → {compactPrice(row.priceVnd)}</span>
                  <b className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '↑ Tăng' : '↓ Giảm'} {compactPrice(Math.abs(delta))}</b>
                </span>}
              </button> : null
              if (row.stockStatus === 'oos') return <td className="oos" key={partners[index]}>OOS{row.stale && <small>Chưa kiểm tra lại · {row.observedDate}</small>}</td>
              return <td className={`${row.priceVnd === lowest ? 'lowest ' : ''}${row.stale ? 'stale ' : ''}${changed ? 'price-changed ' : ''}`} key={partners[index]}>{compactPrice(row.priceVnd)}{marker}{row.stale && <small>Chưa kiểm tra lại · {row.observedDate}</small>}</td>
            })}</tr>
          }) : <tr><td className="empty" colSpan={partners.length + 1}>Không có dữ liệu cho bộ lọc hiện tại.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  )
}
