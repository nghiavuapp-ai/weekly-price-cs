import { useState } from 'react'
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
  const [activePeriod, setActivePeriod] = useState<string | null>(null)
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
        {values.length ? <div className="chart-stage"><svg viewBox="0 0 1000 310" role="img" aria-label={`Biểu đồ ${model}`}>
          {[0, 1, 2, 3, 4].map((index) => <line key={index} x1="60" x2="940" y1={30 + index * 58} y2={30 + index * 58} stroke="#e3ebe4" />)}
          {activePeriod && <line data-testid="chart-active-guide" className="chart-active-guide" x1={x(activePeriod)} x2={x(activePeriod)} y1="18" y2="282" />}
          {partners.map((partner) => {
            const points = periods.flatMap((period) => {
              const row = rows.find((candidate) => candidate.partner === partner && (granularity === 'weekly' ? candidate.weekId : candidate.date) === period && candidate.priceVnd != null)
              return row ? [`${x(period)},${y(row.priceVnd as number)}`] : []
            })
            return points.length > 1 ? <polyline key={partner} fill="none" stroke={colors[partner] ?? '#60776c'} strokeWidth="3" points={points.join(' ')} /> : null
          })}
          {rows.filter((row) => row.priceVnd != null).map((row) => {
            const period = granularity === 'weekly' ? row.weekId as string : row.date
            return <circle key={row.id} cx={x(period)} cy={y(row.priceVnd as number)} r={row.stale ? 6 : 5} fill={row.stale ? '#fff' : colors[row.partner] ?? '#60776c'} stroke={colors[row.partner] ?? '#60776c'} strokeWidth={row.stale ? 3 : 1.5} />
          })}
          {periods.map((period) => <text key={period} x={x(period)} y="300" textAnchor="middle" fill="#667b70" fontSize="11">{granularity === 'weekly' ? period.replace(/Q\dFY\d+/, '') : period.slice(5)}</text>)}
        </svg><div className="chart-hover-layer">{periods.map((period, index) => {
          const periodRows = partners.map((partner) => rows.find((row) => row.partner === partner && (granularity === 'weekly' ? row.weekId : row.date) === period))
          const width = Math.min(10, Math.max(4, 88 / Math.max(periods.length, 1)))
          return <button type="button" key={period} className={`chart-period-hit${activePeriod === period ? ' active' : ''}`}
            style={{ left: `${x(period) / 10}%`, width: `${width}%` }} aria-label={`Xem giá ${period}`}
            onMouseEnter={() => setActivePeriod(period)} onMouseLeave={() => setActivePeriod(null)}
            onFocus={() => setActivePeriod(period)} onBlur={() => setActivePeriod(null)} onClick={() => setActivePeriod(period)}>
            {activePeriod === period && <span className={`chart-period-tooltip${index >= periods.length - 2 ? ' align-right' : ''}`} role="tooltip">
              <strong>{period}</strong>
              {periodRows.map((row, partnerIndex) => <span className="chart-tooltip-row" key={partners[partnerIndex]}>
                <i className="dot" style={{ background: colors[partners[partnerIndex]] ?? '#60776c' }} />
                <span>{row?.partnerName ?? partners[partnerIndex]}</span>
                <b>{!row ? '—' : row.stockStatus === 'oos' ? 'OOS' : compactPrice(row.priceVnd)}</b>
              </span>)}
            </span>}
          </button>
        })}</div></div> : <div className="chart-empty">Không có giá hợp lệ cho model này.</div>}
      </div>
      {granularity === 'weekly' && <div className="drill-actions">{periods.filter((period) => dailyWeeks.has(period)).map((period) => <button type="button" key={period} onClick={() => onDrillDown(period)} aria-label={`Xem Daily ${model} · ${period}`}>Xem Daily · {period}</button>)}</div>}
    </section>
  )
}
