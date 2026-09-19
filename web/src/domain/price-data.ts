export type Granularity = 'weekly' | 'daily'
export type ReviewStatus = 'pending' | 'confirmed' | 'rejected'
export type StockStatus = 'in_stock' | 'oos' | 'unknown'

export interface EffectivePriceRow {
  id: string
  run_id: string
  product_id: string
  product_name: string
  category: string
  capacity: string | null
  retailer_id: string
  retailer_code: string
  retailer_name: string
  period_type: Granularity
  period_key: string
  period_start: string
  observed_at: string
  effective_price_vnd: number | null
  effective_in_stock: boolean | null
  fetch_ok: boolean
  effective_review_status: ReviewStatus
  confidence: string | null
  risk_flags: string[]
  source_method: string | null
  latest_correction_id: string | null
  corrected_at: string | null
  stale?: boolean
}

export interface PriceRow {
  id: string
  runId: string
  productId: string
  retailerId: string
  model: string
  category: string
  capacity: string | null
  partner: string
  partnerName: string
  granularity: Granularity
  periodKey: string
  weekId: string | null
  date: string
  observedAt: string
  observedDate: string
  priceVnd: number | null
  stockStatus: StockStatus
  fetchOk: boolean
  reviewStatus: ReviewStatus
  confidence: string | null
  riskFlags: string[]
  sourceMethod: string | null
  correctionId: string | null
  correctedAt: string | null
  stale: boolean
}

export interface DashboardFilters {
  granularity: Granularity
  period: string
  category: string
  model: string
  partner: string
}

export function mapEffectiveRow(row: EffectivePriceRow): PriceRow {
  const isWeekly = row.period_type === 'weekly'
  const date = isWeekly ? row.period_start : row.period_key
  return {
    id: row.id,
    runId: row.run_id,
    productId: row.product_id,
    retailerId: row.retailer_id,
    model: row.product_name,
    category: row.category,
    capacity: row.capacity,
    partner: row.retailer_code,
    partnerName: row.retailer_name,
    granularity: row.period_type,
    periodKey: row.period_key,
    weekId: isWeekly ? row.period_key : null,
    date,
    observedAt: row.observed_at,
    observedDate: row.observed_at.slice(0, 10),
    priceVnd: row.effective_price_vnd,
    stockStatus: row.effective_in_stock === true
      ? 'in_stock'
      : row.effective_in_stock === false ? 'oos' : 'unknown',
    fetchOk: row.fetch_ok,
    reviewStatus: row.effective_review_status,
    confidence: row.confidence,
    riskFlags: row.risk_flags,
    sourceMethod: row.source_method,
    correctionId: row.latest_correction_id,
    correctedAt: row.corrected_at,
    stale: Boolean(row.stale),
  }
}

export function filterRows(rows: PriceRow[], filters: DashboardFilters): PriceRow[] {
  return rows.filter((row) => (
    row.granularity === filters.granularity
    && row.periodKey === filters.period
    && (filters.category === 'All' || row.category === filters.category)
    && (filters.model === 'All' || row.model === filters.model)
    && (filters.partner === 'All' || row.partner === filters.partner)
  ))
}

function weekParts(value: string): { week: number, quarter: number, year: number } | null {
  const match = /^W(\d+)Q(\d+)FY(\d+)$/.exec(value)
  return match ? { week: Number(match[1]), quarter: Number(match[2]), year: Number(match[3]) } : null
}

export function selectWeeklyWindow(rows: PriceRow[], selectedWeek: string): PriceRow[] {
  const selected = weekParts(selectedWeek)
  if (!selected) return []
  const periods = [...new Set(rows
    .filter((row) => {
      const current = weekParts(row.weekId ?? '')
      return row.granularity === 'weekly' && current?.quarter === selected.quarter
        && current.year === selected.year && current.week <= selected.week
    })
    .map((row) => row.weekId as string))]
    .sort((left, right) => (weekParts(left)?.week ?? 0) - (weekParts(right)?.week ?? 0))
    .slice(-13)
  const included = new Set(periods)
  return rows.filter((row) => row.weekId != null && included.has(row.weekId))
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function isoDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function appleWeekIdForDate(value: string): string {
  const anchor = parseLocalDate('2026-09-06')
  const date = parseLocalDate(value)
  const deltaWeeks = Math.floor((date.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000))
  const serial = 26 * 52 + 3 * 13 + 10 + deltaWeeks
  const fiscalYear = Math.floor(serial / 52)
  const fiscalWeek = serial - fiscalYear * 52
  const quarter = Math.floor(fiscalWeek / 13)
  const quarterWeek = fiscalWeek - quarter * 13
  return `W${quarterWeek + 1}Q${quarter + 1}FY${fiscalYear}`
}

export function selectDailyWeek(rows: PriceRow[], selectedDate: string): PriceRow[] {
  const end = parseLocalDate(selectedDate)
  const start = new Date(end)
  start.setDate(end.getDate() - 6)
  return rows
    .filter((row) => row.granularity === 'daily' && parseLocalDate(row.date) >= start && parseLocalDate(row.date) <= end)
    .sort((left, right) => left.date.localeCompare(right.date) || left.partner.localeCompare(right.partner))
}

export function buildDailyTimeline(rows: PriceRow[]): PriceRow[] {
  const dailyRows = rows.filter((row) => row.granularity === 'daily')
  const dates = [...new Set(dailyRows.map((row) => row.date))].sort()
  const latest = new Map<string, PriceRow>()
  const timeline: PriceRow[] = []

  for (const date of dates) {
    const today = dailyRows.filter((row) => row.date === date)
    const pairs = new Set([...latest.keys(), ...today.map((row) => `${row.productId}:${row.retailerId}`)])
    for (const pair of pairs) {
      const successful = today
        .filter((row) => `${row.productId}:${row.retailerId}` === pair && row.fetchOk)
        .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]
      if (successful) latest.set(pair, { ...successful, stale: false })
      const current = latest.get(pair)
      if (!current) continue
      const carried = !successful
      timeline.push({
        ...current,
        date,
        periodKey: date,
        stale: carried || current.observedDate !== date,
      })
    }
  }

  return timeline.sort((left, right) => left.date.localeCompare(right.date)
    || left.model.localeCompare(right.model, 'vi') || left.partner.localeCompare(right.partner))
}

export function deriveFridayWeeklyRows(dailyRows: PriceRow[], fallbackWeeklyRows: PriceRow[]): PriceRow[] {
  const fridayRows = dailyRows.filter((row) => row.granularity === 'daily' && parseLocalDate(row.date).getDay() === 5)
  const derivedWeeks = new Set(fridayRows.map((row) => row.weekId ?? appleWeekIdForDate(row.date)))
  const fallback = fallbackWeeklyRows.filter((row) => !row.weekId || !derivedWeeks.has(row.weekId))
  const derived = fridayRows.map((row): PriceRow => {
    const friday = parseLocalDate(row.date)
    const weekStart = new Date(friday)
    weekStart.setDate(friday.getDate() - friday.getDay())
    const weekId = row.weekId ?? appleWeekIdForDate(row.date)
    return {
      ...row,
      id: `friday-weekly:${row.id}`,
      granularity: 'weekly',
      periodKey: weekId,
      weekId,
      date: isoDate(weekStart),
      sourceMethod: `daily_friday_snapshot:${row.sourceMethod ?? 'unknown'}`,
    }
  })
  return [...fallback, ...derived].sort((left, right) => left.date.localeCompare(right.date)
    || left.model.localeCompare(right.model, 'vi') || left.partner.localeCompare(right.partner))
}

export function assignDailyWeekIds(dailyRows: PriceRow[], weeklyRows: PriceRow[]): PriceRow[] {
  const periods = [...new Map(weeklyRows
    .filter((row) => row.granularity === 'weekly' && row.weekId)
    .map((row) => [row.weekId as string, row.date])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))

  return dailyRows.map((row) => {
    const date = parseLocalDate(row.date)
    const match = periods.find(([, startValue]) => {
      const start = parseLocalDate(startValue)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return date >= start && date <= end
    })
    return { ...row, weekId: match?.[0] ?? appleWeekIdForDate(row.date) }
  })
}
