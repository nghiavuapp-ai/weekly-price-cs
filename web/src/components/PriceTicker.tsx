import { type Granularity, type PriceRow } from '../domain/price-data'
import { compactPrice } from './PriceMatrix'

interface PriceTickerProps { rows: PriceRow[]; priorRows: PriceRow[]; granularity: Granularity }
const keyFor = (row: PriceRow) => `${row.model}::${row.partner}`

export function PriceTicker({ rows, priorRows, granularity }: PriceTickerProps) {
  const priorByKey = new Map(priorRows.map((row) => [keyFor(row), row]))
  const updates = rows.flatMap((row) => {
    const prior = priorByKey.get(keyFor(row))
    if (!prior || row.stale) return []
    const partner = row.partnerName || row.partner
    if (row.stockStatus === 'oos' && prior.stockStatus !== 'oos') return [`${partner} · ${row.model}: chuyển OOS`]
    if (row.stockStatus === 'in_stock' && prior.stockStatus === 'oos') return [`${partner} · ${row.model}: có hàng trở lại`]
    if (row.priceVnd == null || prior.priceVnd == null || row.priceVnd === prior.priceVnd) return []
    const delta = row.priceVnd - prior.priceVnd
    return [`${partner} · ${row.model}: ${delta > 0 ? 'tăng' : 'giảm'} ${compactPrice(Math.abs(delta))}`]
  })
  const items = updates.length ? updates : [`Chưa có biến động giá ${granularity === 'daily' ? 'trong ngày' : 'trong tuần'} đang chọn`]
  return <section className="price-ticker" aria-label={`Điểm tin biến động giá ${granularity === 'daily' ? 'hàng ngày' : 'hàng tuần'}`}>
    <span className="ticker-label"><i aria-hidden="true">●</i> Price flash</span>
    <div className="ticker-window"><div className="ticker-track">{[...items, ...items].map((item, index) => <span className="ticker-item" key={`${item}-${index}`}>{item}</span>)}</div></div>
    <p className="sr-only">{items.join('. ')}</p>
  </section>
}
