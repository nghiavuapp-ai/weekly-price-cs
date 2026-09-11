import type { Granularity } from '../domain/price-data'
import type { DashboardSnapshot } from '../data/data-source'
import { shapeDailyWorkbook, shapeWeeklyWorkbook, type WorkbookSheet } from './workbook-shape'

export function workbookFilename(granularity: Granularity): string {
  return granularity === 'weekly' ? 'Price Check.xlsx' : 'Price Check Daily.xlsx'
}

export async function downloadWorkbook(granularity: Granularity, snapshot: DashboardSnapshot): Promise<void> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Price Check Web'
  const sheets: WorkbookSheet[] = granularity === 'weekly'
    ? shapeWeeklyWorkbook(snapshot.weeklyRows)
    : shapeDailyWorkbook(snapshot.dailyRows, snapshot.runs)
  for (const shaped of sheets) {
    const sheet = workbook.addWorksheet(shaped.name.slice(0, 31))
    sheet.addRow(shaped.headers)
    shaped.rows.forEach((row) => sheet.addRow(row))
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: shaped.headers.length } }
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183C2F' } }
    sheet.columns.forEach((column, index) => { column.width = index === 0 ? 34 : 18 })
  }
  const bytes = await workbook.xlsx.writeBuffer()
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = workbookFilename(granularity)
  anchor.click()
  URL.revokeObjectURL(url)
}

