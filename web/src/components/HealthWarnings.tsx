import type { HealthCheck } from '../data/data-source'

const labels: Record<string, string> = {
  daily_stale: 'Daily chưa được cập nhật đúng hạn.',
  retry_unresolved: 'Lượt retry vẫn còn lỗi chưa xử lý.',
  weekly_missing: 'Weekly gần nhất đang thiếu.',
  run_incomplete: 'Có lượt chạy chưa hoàn tất quá 60 phút.',
}

export function HealthWarnings({ health, pendingCount }: { health: HealthCheck[], pendingCount: number }) {
  const warnings = health.filter((item) => !item.healthy)
  if (!warnings.length && !pendingCount) return null
  return <section className="health-warning" aria-live="polite" aria-label="Cảnh báo dữ liệu"><strong>Cần chú ý</strong><ul>{warnings.map((item) => <li key={item.check_name}>{labels[item.check_name] ?? item.check_name}</li>)}{pendingCount > 0 && <li>{pendingCount} observation đang chờ review.</li>}</ul></section>
}
