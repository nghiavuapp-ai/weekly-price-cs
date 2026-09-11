import type { SupabaseClient } from '@supabase/supabase-js'

import type { EffectivePriceRow, PriceRow } from '../domain/price-data'
import { assignDailyWeekIds, buildDailyTimeline, mapEffectiveRow } from '../domain/price-data'
import type { CrawlRun } from '../export/workbook-shape'

export interface HealthCheck {
  check_name: string
  healthy: boolean
  detail: Record<string, unknown>
  checked_at?: string
}

export interface ProductConfig {
  id: string
  name: string
  category: string
  capacity: string | null
  active: boolean
}

export interface RetailerConfig {
  id: string
  code: string
  name: string
  active: boolean
}

export interface ProductLinkConfig {
  id: string
  product_id: string
  retailer_id: string
  url: string
  active: boolean
}

export interface PriceOverrideConfig {
  id: string
  product_link_id: string
  override_price: number
  note: string
  active: boolean
}

export interface CorrectionAudit {
  id: string
  observation_id: string
  corrected_price: number | null
  corrected_in_stock: boolean | null
  note: string
  review_decision: string
  author_id: string
  created_at: string
}

export interface DashboardFixture {
  generatedAt: string
  effectiveRows: EffectivePriceRow[]
  health: HealthCheck[]
  runs: CrawlRun[]
  products: ProductConfig[]
  retailers: RetailerConfig[]
  productLinks: ProductLinkConfig[]
  priceOverrides: PriceOverrideConfig[]
  corrections?: CorrectionAudit[]
}

export interface DashboardSnapshot {
  source: 'supabase' | 'fixture'
  generatedAt: string
  weeklyRows: PriceRow[]
  dailyRows: PriceRow[]
  pendingRows: PriceRow[]
  health: HealthCheck[]
  runs: CrawlRun[]
  products: ProductConfig[]
  retailers: RetailerConfig[]
  productLinks: ProductLinkConfig[]
  priceOverrides: PriceOverrideConfig[]
  corrections: CorrectionAudit[]
}

export async function loadDashboardData(
  client: SupabaseClient | null,
  fixture: DashboardFixture,
): Promise<DashboardSnapshot> {
  if (client) return loadSupabaseData(client)

  const mapped = fixture.effectiveRows.map(mapEffectiveRow)
  return {
    source: 'fixture',
    generatedAt: fixture.generatedAt,
    weeklyRows: mapped.filter((row) => row.granularity === 'weekly'),
    dailyRows: buildDailyTimeline(assignDailyWeekIds(
      mapped.filter((row) => row.granularity === 'daily'),
      mapped.filter((row) => row.granularity === 'weekly'),
    )),
    pendingRows: mapped.filter((row) => row.reviewStatus === 'pending'),
    health: fixture.health,
    runs: fixture.runs,
    products: fixture.products,
    retailers: fixture.retailers,
    productLinks: fixture.productLinks,
    priceOverrides: fixture.priceOverrides,
    corrections: fixture.corrections ?? [],
  }
}

async function rowsOrThrow<T>(request: PromiseLike<{ data: T[] | null, error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data ?? []
}

async function pagedRows<T>(build: (from: number, to: number) => PromiseLike<{
  data: T[] | null
  error: { message: string } | null
}>): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const page = await rowsOrThrow(build(from, from + pageSize - 1))
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

async function optionalRows<T>(request: PromiseLike<{ data: T[] | null, error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await request
  return error ? [] : data ?? []
}

async function loadSupabaseData(client: SupabaseClient): Promise<DashboardSnapshot> {
  const [weeklyEffective, dailyEffective, pendingEffective, health, runs, products, retailers, productLinks, priceOverrides, corrections] = await Promise.all([
    pagedRows<EffectivePriceRow>((from, to) => client
      .from('weekly_price_history').select('*').order('period_start', { ascending: true }).range(from, to)),
    pagedRows<EffectivePriceRow>((from, to) => {
      return client.from('effective_price_observations').select('*').eq('period_type', 'daily')
        .order('observed_at', { ascending: true }).range(from, to)
    }),
    rowsOrThrow<EffectivePriceRow>(client.from('pending_price_reviews').select('*').order('observed_at', { ascending: false }).limit(500)),
    rowsOrThrow<HealthCheck>(client.from('price_platform_health').select('*')),
    rowsOrThrow<CrawlRun>(client.from('crawl_runs').select('*').order('created_at', { ascending: false }).limit(200)),
    rowsOrThrow<ProductConfig>(client.from('products').select('id,name,category,capacity,active').order('name')),
    rowsOrThrow<RetailerConfig>(client.from('retailers').select('id,code,name,active').order('name')),
    optionalRows<ProductLinkConfig>(client.from('product_links').select('id,product_id,retailer_id,url,active').order('created_at')),
    optionalRows<PriceOverrideConfig>(client.from('price_overrides').select('id,product_link_id,override_price,note,active').order('created_at', { ascending: false })),
    optionalRows<CorrectionAudit>(client.from('price_corrections').select('id,observation_id,corrected_price,corrected_in_stock,note,review_decision,author_id,created_at').order('created_at', { ascending: false }).limit(200)),
  ])
  const mappedWeekly = weeklyEffective.map(mapEffectiveRow)
  const mappedDaily = dailyEffective.map(mapEffectiveRow)
  return {
    source: 'supabase',
    generatedAt: new Date().toISOString(),
    weeklyRows: mappedWeekly,
    dailyRows: buildDailyTimeline(assignDailyWeekIds(mappedDaily, mappedWeekly)),
    pendingRows: pendingEffective.map(mapEffectiveRow),
    health,
    runs,
    products,
    retailers,
    productLinks,
    priceOverrides,
    corrections,
  }
}
