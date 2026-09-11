import type { PriceRow } from '../domain/price-data'

export const compactPrice = (value: number | null) => value == null
  ? '—'
  : `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr`

interface PriceMatrixProps {
  rows: PriceRow[]
  partners: string[]
  periodLabel: string
  granularityLabel: string
}

export function PriceMatrix({ rows, partners, periodLabel, granularityLabel }: PriceMatrixProps) {
  const models = [...new Set(rows.map((row) => row.model))].sort((a, b) => a.localeCompare(b, 'vi'))
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
              const warning = row.reviewStatus === 'pending' || row.riskFlags.length > 0
              if (row.stockStatus === 'oos') return <td className={`oos${warning ? ' pending' : ''}`} key={partners[index]}>OOS{warning && <span className="warning-dot" title={row.riskFlags.join(', ') || 'Chờ duyệt'}>!</span>}{row.stale && <small>Chưa kiểm tra lại · {row.observedDate}</small>}</td>
              return <td className={`${row.priceVnd === lowest ? 'lowest ' : ''}${row.stale ? 'stale ' : ''}${warning ? 'pending' : ''}`} key={partners[index]}>{compactPrice(row.priceVnd)}{warning && <span className="warning-dot" title={row.riskFlags.join(', ') || 'Chờ duyệt'}>!</span>}{row.stale && <small>Chưa kiểm tra lại · {row.observedDate}</small>}</td>
            })}</tr>
          }) : <tr><td className="empty" colSpan={partners.length + 1}>Không có dữ liệu cho bộ lọc hiện tại.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  )
}
