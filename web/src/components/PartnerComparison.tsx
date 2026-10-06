import type { PriceRow } from '../domain/price-data'
import { priceChange } from '../domain/price-data'
import { compactPrice } from './PriceMatrix'

export function PartnerComparison({ rows, priorRows, model }: { rows: PriceRow[], priorRows: PriceRow[], model: string }) {
  const sorted = [...rows].sort((left, right) => (left.priceVnd ?? Infinity) - (right.priceVnd ?? Infinity))
  const lowest = sorted.find((row) => row.priceVnd != null)?.priceVnd ?? null
  return <section className="section panel" aria-labelledby="compare-title">
    <div className="section-head"><div><h2 id="compare-title">So sánh Partner — {model}</h2><p>Xếp hạng theo giá bán lẻ</p></div><div className="legend">{sorted.filter((row) => row.priceVnd != null).length}/{sorted.length} Partner có giá</div></div>
    <div className="scroll"><table className="compare-table"><colgroup><col className="rank-column" /><col /><col /><col /><col /></colgroup><thead><tr><th>Hạng</th><th>Partner</th><th>Giá hiện tại</th><th>Chênh lệch so với thấp nhất</th><th>So với kỳ trước</th></tr></thead><tbody>{sorted.map((row, index) => {
      const prior = priorRows.find((candidate) => candidate.partner === row.partner)
      const delta = row.priceVnd != null && prior?.priceVnd != null ? row.priceVnd - prior.priceVnd : null
      const change = priceChange(row, prior)
      const gap = row.priceVnd != null && lowest != null ? row.priceVnd - lowest : null
      return <tr key={`${row.model}:${row.partner}`}><td>{row.priceVnd != null && row.stockStatus === 'in_stock' ? <span className="rank">{index + 1}</span> : '—'}</td><td>{row.partnerName}</td><td className={row.stale ? 'stale' : ''}>{row.stockStatus !== 'in_stock' || row.priceVnd == null ? 'OOS' : compactPrice(row.priceVnd)}</td><td className={gap && gap > 0 ? 'gap' : ''}>{gap == null ? '—' : gap === 0 ? 'Thấp nhất' : `+${compactPrice(gap)}`}</td><td className={change?.kind === 'restocked' ? 'down' : change?.kind === 'oos' ? 'up' : delta && delta > 0 ? 'up' : delta && delta < 0 ? 'down' : ''}>{change?.kind === 'restocked' ? 'Có hàng trở lại' : change?.kind === 'oos' ? 'Chuyển sang OOS' : delta == null ? '—' : delta === 0 ? 'Không đổi' : `${delta > 0 ? '↑' : '↓'} ${compactPrice(Math.abs(delta))}`}</td></tr>
    })}</tbody></table></div>
  </section>
}
