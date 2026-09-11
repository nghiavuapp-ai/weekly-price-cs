import { useMemo, useState } from 'react'

import type { DashboardSnapshot } from '../data/data-source'
import { filterRows, selectDailyWeek, selectWeeklyWindow, type Granularity } from '../domain/price-data'
import { DashboardToolbar } from './DashboardToolbar'
import { HealthWarnings } from './HealthWarnings'
import { KpiStrip } from './KpiStrip'
import { PartnerComparison } from './PartnerComparison'
import { PriceMatrix } from './PriceMatrix'
import { TrendChart } from './TrendChart'

export interface DashboardProps {
  snapshot: DashboardSnapshot
  onExport: (granularity: Granularity) => void
  onOpenAdmin: () => void
}

export function Dashboard({ snapshot, onExport, onOpenAdmin }: DashboardProps) {
  const weeks = useMemo(() => [...new Set(snapshot.weeklyRows.map((row) => row.weekId).filter(Boolean) as string[])].sort((a, b) => {
    const left = snapshot.weeklyRows.find((row) => row.weekId === a)?.date ?? ''
    const right = snapshot.weeklyRows.find((row) => row.weekId === b)?.date ?? ''
    return left.localeCompare(right)
  }), [snapshot.weeklyRows])
  const dates = useMemo(() => [...new Set(snapshot.dailyRows.map((row) => row.date))].sort(), [snapshot.dailyRows])
  const [granularity, setGranularity] = useState<Granularity>('weekly')
  const [week, setWeek] = useState(weeks.at(-1) ?? '')
  const [date, setDate] = useState(dates.at(-1) ?? '')
  const [category, setCategory] = useState('iPhone')
  const [model, setModel] = useState('All')
  const [partner, setPartner] = useState('All')
  const categories = useMemo(() => [...new Set([...snapshot.weeklyRows, ...snapshot.dailyRows].map((row) => row.category))].sort(), [snapshot])
  const partners = useMemo(() => [...new Set([...snapshot.weeklyRows, ...snapshot.dailyRows].map((row) => row.partner))].sort(), [snapshot])
  const source = granularity === 'weekly' ? snapshot.weeklyRows : snapshot.dailyRows
  const period = granularity === 'weekly' ? week : date
  const availableModels = [...new Set(source.filter((row) => category === 'All' || row.category === category).map((row) => row.model))].sort((a, b) => a.localeCompare(b, 'vi'))
  const current = filterRows(source, { granularity, period, category, model, partner })
  const periodList = granularity === 'weekly' ? weeks : dates
  const priorPeriod = periodList[Math.max(0, periodList.indexOf(period) - 1)]
  const prior = priorPeriod === period ? [] : filterRows(source, { granularity, period: priorPeriod ?? '', category, model, partner })
  const detailHistory = model === 'All' ? [] : (granularity === 'weekly'
    ? selectWeeklyWindow(snapshot.weeklyRows.filter((row) => row.model === model && (partner === 'All' || row.partner === partner)), week)
    : selectDailyWeek(snapshot.dailyRows.filter((row) => row.model === model && (partner === 'All' || row.partner === partner)), date))
  const dailyWeeks = new Set(snapshot.dailyRows.map((row) => row.weekId).filter(Boolean) as string[])
  const selectGranularity = (next: Granularity) => {
    setGranularity(next)
    if (next === 'daily' && !date) setDate(dates.at(-1) ?? '')
  }
  const drillDown = (selectedWeek: string) => {
    const matchingDates = dates.filter((candidate) => snapshot.dailyRows.some((row) => row.date === candidate && row.weekId === selectedWeek))
    if (!matchingDates.length) return
    setWeek(selectedWeek)
    setDate(matchingDates.at(-1) as string)
    setPartner('All')
    setGranularity('daily')
  }
  return <main>
    <DashboardToolbar granularity={granularity} week={week} date={date} category={category} model={model} partner={partner}
      weeks={weeks} dates={dates} categories={categories} models={availableModels} partners={partners}
      dailyAvailable={dates.length > 0} onGranularity={selectGranularity} onWeek={setWeek} onDate={setDate}
      onCategory={(value) => { setCategory(value); setModel('All') }} onModel={setModel} onPartner={setPartner} />
    <div className="content">
      <HealthWarnings health={snapshot.health} pendingCount={snapshot.pendingRows.length} />
      <KpiStrip rows={current} priorRows={prior} allPartnerCount={partners.length} granularity={granularity} />
      {model === 'All' ? <PriceMatrix rows={current} partners={partner === 'All' ? partners : [partner]} periodLabel={period} granularityLabel={granularity === 'weekly' ? 'tuần' : 'ngày'} /> : <>
        <TrendChart rows={detailHistory} model={model} granularity={granularity} dailyWeeks={dailyWeeks} onDrillDown={drillDown} />
        <PartnerComparison rows={current} priorRows={prior} model={model} />
      </>}
      <div className="footer-actions"><button type="button" onClick={() => onExport(granularity)}>Tải Excel {granularity === 'weekly' ? 'Weekly' : 'Daily'}</button></div>
    </div>
    <footer><span>Dữ liệu: {snapshot.source === 'supabase' ? 'Realtime' : 'Bản xem trước'}</span><button className="quiet-admin" type="button" onClick={onOpenAdmin} aria-label="Mở công cụ sửa giá">Sửa giá</button></footer>
  </main>
}
