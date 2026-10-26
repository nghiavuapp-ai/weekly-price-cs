import type { EffectivePriceRow } from '../domain/price-data'
import type { DashboardFixture } from './data-source'


type StaticOverlay = DashboardFixture & {
  schemaVersion: 1
  sourceSha256ByRun?: Record<string, string>
  rowDigestByRun?: Record<string, string>
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function isEffectiveRow(value: unknown): value is EffectivePriceRow {
  if (!isRecord(value)) return false
  return ['id', 'run_id', 'product_id', 'product_name', 'category', 'retailer_id', 'retailer_code',
    'retailer_name', 'period_type', 'period_key', 'period_start', 'observed_at', 'fetch_ok',
    'effective_review_status', 'confidence', 'source_method'].every((key) => key in value)
    && Array.isArray(value.risk_flags)
}

function parseOverlay(value: unknown): StaticOverlay | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.generatedAt !== 'string') return null
  const arrayFields = ['effectiveRows', 'health', 'runs', 'products', 'retailers', 'productLinks', 'priceOverrides']
  if (!arrayFields.every((field) => Array.isArray(value[field]))) return null
  const rows = value.effectiveRows
  if (!Array.isArray(rows) || !rows.every(isEffectiveRow)) return null
  const ids = rows.map((row) => row.id)
  if (new Set(ids).size !== ids.length) return null
  return value as unknown as StaticOverlay
}

export async function fetchStaticFallback(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<DashboardFixture | null> {
  try {
    const response = await fetcher(url, { cache: 'no-store' })
    if (!response.ok) return null
    return parseOverlay(await response.json())
  }
  catch {
    return null
  }
}

const rowKey = (row: EffectivePriceRow) => [row.period_type, row.period_start, row.product_id, row.retailer_id].join(':')

export function mergeDashboardFixtures(
  base: DashboardFixture,
  overlay: DashboardFixture | null,
): DashboardFixture {
  if (!overlay?.effectiveRows.length) return base
  const rows = new Map(base.effectiveRows.map((row) => [rowKey(row), row]))
  for (const row of overlay.effectiveRows) rows.set(rowKey(row), row)
  const runs = new Map(base.runs.map((run) => [run.id, run]))
  for (const run of overlay.runs) runs.set(run.id, run)
  return {
    ...base,
    source: 'static-fallback',
    schemaVersion: 1,
    generatedAt: overlay.generatedAt,
    effectiveRows: [...rows.values()].sort((left, right) =>
      left.period_start.localeCompare(right.period_start) || left.id.localeCompare(right.id)),
    health: overlay.health.length ? overlay.health : base.health,
    runs: [...runs.values()],
    products: overlay.products.length ? overlay.products : base.products,
    retailers: overlay.retailers.length ? overlay.retailers : base.retailers,
    productLinks: overlay.productLinks.length ? overlay.productLinks : base.productLinks,
    priceOverrides: overlay.priceOverrides.length ? overlay.priceOverrides : base.priceOverrides,
    corrections: overlay.corrections?.length ? overlay.corrections : base.corrections,
  }
}
