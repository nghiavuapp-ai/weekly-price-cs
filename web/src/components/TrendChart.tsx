import type { Granularity, PriceRow } from '../domain/price-data'
import { compactPrice } from './PriceMatrix'

const colors: Record<string, string> = { FPT: '#4568a9', VIETTEL: '#cb7a3d', CPS: '#8864aa', MW: '#075e48', SHOPDUNK: '#248d85' }

interface TrendChartProps {
  rows: PriceRow[]
  model: string
  granularity: Granularity
  dailyWeeks: Set<string>
  onDrillDown: (week: string) => void
}

export function TrendChart({ rows, model, granularity, dailyWeeks, onDrillDown }: TrendChartProps) {
  const periods = [...new Set(rows.map((row) => granularity === 'weekly' ? row.weekId : row.date).filter(Boolean) as string[])]
  const partners = [...new Set(rows.map((row) => row.partner))]
  const values = rows.flatMap((row) => row.priceVnd != null ? [row.priceVnd] : [])
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const range = Math.max(max - min, 300_000)
  const x = (period: string) => 60 + periods.indexOf(period) / Math.max(periods.length - 1, 1) * 880
  const y = (value: number) => 275 - (value - (min - range * 0.12)) / (range * 1.24) * 235
  return (
    <section className="section panel" aria-labelledby="trend-title">
      <div className="section-head"><div><h2 id="trend-title">{granularity === 'weekly' ? 'Diễn biến giá theo Partner' : 'Diễn biến giá theo ngày'}</h2><p>{model} · {periods.length}/{granularity === 'weekly' ? '13 tuần' : '7 ngày'}</p></div><div className="legend">{partners.map((partner) => <span key={partner}><i className="dot" style={{ background: colors[partner] ?? '#60776c' }} />{partner}</span>)}{granularity === 'daily' && <span>○ Chưa kiểm tra lại</span>}</div></div>
      <div className="chart-wrap">
        {values.length ? <svg viewBox="0 0 1000 310" role="img" aria-label={`Biểu đồ ${model}`}>
          {[0, 1, 2, 3, 4].map((index) => <line key={index} x1="60" x2="940" y1={30 + index * 58} y2={30 + index * 58} stroke="#e3ebe4" />)}
          {partners.map((partner) => {
            const points = periods.flatMap((period) => {
              const row = rows.find((candidate) => candidate.partner === partner && (granularity === 'weekly' ? candidate.weekId : candidate.date) === period && candidate.priceVnd != null)
              return row ? [`${x(period)},${y(row.priceVnd as number)}`] : []
            })
            return points.length > 1 ? <polyline key={partner} fill="none" stroke={colors[partner] ?? '#60776c'} strokeWidth="3" points={points.join(' ')} /> : null
          })}
          {rows.filter((row) => row.priceVnd != null).map((row) => {
            const period = granularity === 'weekly' ? row.weekId as string : row.date
            return <circle key={row.id} cx={x(period)} cy={y(row.priceVnd as number)} r={row.stale ? 6 : 5} fill={row.stale ? '#fff' : colors[row.partner] ?? '#60776c'} stroke={colors[row.partner] ?? '#60776c'} strokeWidth={row.stale ? 3 : 1.5}><title>{row.partner}: {compactPrice(row.priceVnd)}</title></circle>
          })}
          {periods.map((period) => <text key={period} x={x(period)} y="300" textAnchor="middle" fill="#667b70" fontSize="11">{granularity === 'weekly' ? period.replace(/Q\dFY\d+/, '') : period.slice(5)}</text>)}
        </svg> : <div className="chart-empty">Không có giá hợp lệ cho model này.</div>}
      </div>
      {granularity === 'weekly' && <div className="drill-actions">{periods.filter((period) => dailyWeeks.has(period)).map((period) => <button type="button" key={period} onClick={() => onDrillDown(period)} aria-label={`Xem Daily ${model} · ${period}`}>Xem Daily · {period}</button>)}</div>}
    </section>
  )
}
