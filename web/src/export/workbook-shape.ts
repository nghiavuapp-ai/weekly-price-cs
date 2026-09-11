import type { PriceRow } from '../domain/price-data'

export type WorkbookCell = string | number | boolean | null

export interface WorkbookSheet {
  name: string
  headers: string[]
  rows: WorkbookCell[][]
}

export interface CrawlRun {
  id: string
  parent_run_id: string | null
  run_type: string
  started_at: string | null
  completed_at: string | null
  total_targets: number
  ok_count: number
  oos_count: number
  error_count: number
  change_count: number
  review_count: number
  status: string
}

const WEEKLY_HEADERS = ['Model', 'Category', 'Capacity']
const DAILY_LATEST_HEADERS = [
  'Key', 'Model', 'Retailer', 'Current Value', 'Stock Status', 'Previous Value', 'Delta VND',
  'First Seen', 'Last Changed', 'Last Checked', 'Confidence', 'Risk Flags', 'Review Status',
  'Source Method', 'URL', 'Run ID',
]
const DAILY_CHANGES_HEADERS = [
  'Event ID', 'Detected At', 'Model', 'Retailer', 'Change Type', 'Old Value', 'New Value',
  'Delta VND', 'Delta Percent', 'Confidence', 'Risk Flags', 'Review Status', 'Source Method',
  'URL', 'Run ID',
]
const RUN_LOG_HEADERS = [
  'Run ID', 'Parent Run ID', 'Run Type', 'Started At', 'Completed At', 'Total Targets', 'OK',
  'OOS', 'Errors', 'Changes', 'Review Needed', 'Status', 'Snapshot Path', 'Review Path', 'Backup Path',
]

function pairKey(row: PriceRow): string {
  return `${row.productId}:${row.retailerId}`
}

function displayValue(row: PriceRow): WorkbookCell {
  if (row.stockStatus === 'oos') return 'OOS'
  return row.priceVnd
}

function displayStock(row: PriceRow): string {
  if (row.stockStatus === 'in_stock') return 'In stock'
  if (row.stockStatus === 'oos') return 'OOS'
  return 'Unknown'
}

export function shapeWeeklyWorkbook(rows: PriceRow[]): WorkbookSheet[] {
  const weekly = rows.filter((row) => row.granularity === 'weekly' && row.weekId)
  const partners = [...new Set(weekly.map((row) => row.partner))].sort()
  const periods = [...new Set(weekly.map((row) => row.weekId as string))]
    .sort((left, right) => {
      const leftDate = weekly.find((row) => row.weekId === left)?.date ?? ''
      const rightDate = weekly.find((row) => row.weekId === right)?.date ?? ''
      return leftDate.localeCompare(rightDate)
    })

  return periods.map((period) => {
    const periodRows = weekly.filter((row) => row.weekId === period)
    const products = [...new Map(periodRows.map((row) => [row.productId, row])).values()]
      .sort((left, right) => left.model.localeCompare(right.model, 'vi'))
    return {
      name: period,
      headers: [...WEEKLY_HEADERS, ...partners],
      rows: products.map((product) => [
        product.model,
        product.category,
        product.capacity ?? '',
        ...partners.map((partner) => {
          const row = periodRows.find((candidate) => candidate.productId === product.productId && candidate.partner === partner)
          return row ? displayValue(row) : null
        }),
      ]),
    }
  })
}

export function shapeDailyWorkbook(rows: PriceRow[], runs: CrawlRun[]): WorkbookSheet[] {
  const daily = rows.filter((row) => row.granularity === 'daily' && !row.stale)
    .sort((left, right) => left.date.localeCompare(right.date) || left.observedAt.localeCompare(right.observedAt))
  const histories = new Map<string, PriceRow[]>()
  for (const row of daily) {
    const history = histories.get(pairKey(row)) ?? []
    history.push(row)
    histories.set(pairKey(row), history)
  }

  const latestRows: WorkbookCell[][] = []
  const changeRows: WorkbookCell[][] = []
  for (const history of histories.values()) {
    const current = history.at(-1) as PriceRow
    const previous = history.at(-2)
    const transitions = history.slice(1).map((row, index) => ({ before: history[index], after: row }))
      .filter(({ before, after }) => before.priceVnd !== after.priceVnd || before.stockStatus !== after.stockStatus)
    const lastChanged = transitions.at(-1)?.after.observedAt ?? history[0].observedAt
    latestRows.push([
      `${current.model}||${current.partner}`,
      current.model,
      current.partnerName,
      displayValue(current),
      displayStock(current),
      previous ? displayValue(previous) : null,
      previous?.priceVnd != null && current.priceVnd != null ? current.priceVnd - previous.priceVnd : null,
      history[0].observedAt,
      lastChanged,
      current.observedAt,
      current.confidence,
      current.riskFlags.join('|'),
      current.reviewStatus,
      current.sourceMethod,
      '',
      current.runId,
    ])

    for (const { before, after } of transitions) {
      const stockChanged = before.stockStatus !== after.stockStatus
      const delta = before.priceVnd != null && after.priceVnd != null ? after.priceVnd - before.priceVnd : null
      const percent = delta != null && before.priceVnd ? delta / before.priceVnd * 100 : null
      changeRows.push([
        `${after.id}:${after.observedAt}`,
        after.observedAt,
        after.model,
        after.partnerName,
        stockChanged ? 'Stock' : 'Price',
        displayValue(before),
        displayValue(after),
        delta,
        percent,
        after.confidence,
        after.riskFlags.join('|'),
        after.reviewStatus,
        after.sourceMethod,
        '',
        after.runId,
      ])
    }
  }

  latestRows.sort((left, right) => String(left[1]).localeCompare(String(right[1]), 'vi') || String(left[2]).localeCompare(String(right[2])))
  changeRows.sort((left, right) => String(left[1]).localeCompare(String(right[1])) || String(left[2]).localeCompare(String(right[2]), 'vi'))

  return [
    { name: 'Latest', headers: DAILY_LATEST_HEADERS, rows: latestRows },
    { name: 'Changes', headers: DAILY_CHANGES_HEADERS, rows: changeRows },
    {
      name: 'Run Log',
      headers: RUN_LOG_HEADERS,
      rows: [...runs].sort((left, right) => (left.started_at ?? '').localeCompare(right.started_at ?? '')).map((run) => [
        run.id, run.parent_run_id, run.run_type, run.started_at, run.completed_at, run.total_targets,
        run.ok_count, run.oos_count, run.error_count, run.change_count, run.review_count, run.status,
        '', '', '',
      ]),
    },
  ]
}
