import type { Granularity } from '../domain/price-data'

interface DashboardToolbarProps {
  granularity: Granularity
  week: string
  date: string
  category: string
  model: string
  partner: string
  weeks: string[]
  dates: string[]
  categories: string[]
  models: string[]
  partners: string[]
  dailyAvailable: boolean
  onGranularity: (value: Granularity) => void
  onWeek: (value: string) => void
  onDate: (value: string) => void
  onCategory: (value: string) => void
  onModel: (value: string) => void
  onPartner: (value: string) => void
}

const CalendarIcon = ({ daily = false }: { daily?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />{daily && <path d="M8 14h2M14 14h2M8 18h2M14 18h2" />}</svg>
)

export function DashboardToolbar(props: DashboardToolbarProps) {
  const all = (label: string) => <option value="All">{label}</option>
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">CS</span>
        <div>
          <span className="brand-kicker">Community Specialist</span>
          <h1>{props.granularity === 'daily' ? 'Giá theo ngày' : 'Bảng giá'}</h1>
        </div>
      </div>
      <div className="controls">
        {props.granularity === 'daily' && props.model !== 'All' && (
          <button className="back" type="button" onClick={() => props.onGranularity('weekly')}>← Quay lại Weekly</button>
        )}
        <div className="segmented" aria-label="Khung thời gian">
          <button type="button" className={props.granularity === 'weekly' ? 'active' : ''} aria-pressed={props.granularity === 'weekly'} onClick={() => props.onGranularity('weekly')}>Theo tuần</button>
          <button type="button" className={props.granularity === 'daily' ? 'active' : ''} aria-pressed={props.granularity === 'daily'} disabled={!props.dailyAvailable} onClick={() => props.onGranularity('daily')}>Theo ngày</button>
        </div>
        {props.granularity === 'weekly' ? (
          <label className="field"><CalendarIcon /><select aria-label="Tuần" value={props.week} onChange={(event) => props.onWeek(event.target.value)}>{[...props.weeks].reverse().map((week) => <option key={week}>{week}</option>)}</select></label>
        ) : (
          <label className="field"><CalendarIcon daily /><select aria-label="Ngày" value={props.date} onChange={(event) => props.onDate(event.target.value)}>{[...props.dates].reverse().map((date) => <option key={date} value={date}>{new Intl.DateTimeFormat('vi-VN').format(new Date(`${date}T00:00:00`))}</option>)}</select></label>
        )}
        <label className="field"><span aria-hidden="true">◇</span><select aria-label="Danh mục" value={props.category} onChange={(event) => props.onCategory(event.target.value)}>{all('Tất cả Category')}{props.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field model"><span aria-hidden="true">◈</span><select aria-label="Model" value={props.model} onChange={(event) => props.onModel(event.target.value)}>{all('Tất cả model')}{props.models.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span aria-hidden="true">◉</span><select aria-label="Partner" value={props.partner} onChange={(event) => props.onPartner(event.target.value)}>{all('Tất cả Partner')}{props.partners.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <a className="news-link" href="https://daily-news-cs.vercel.app/" target="_blank" rel="noopener noreferrer" aria-label="Mở Bản tin Community Specialist">Bản tin <span aria-hidden="true">↗</span></a>
    </header>
  )
}
