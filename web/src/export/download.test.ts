import { describe, expect, it } from 'vitest'

import { workbookFilename } from './download'

describe('workbook download naming', () => {
  it('uses stable Weekly and Daily file names', () => {
    expect(workbookFilename('weekly')).toBe('Price Check.xlsx')
    expect(workbookFilename('daily')).toBe('Price Check Daily.xlsx')
  })
})

