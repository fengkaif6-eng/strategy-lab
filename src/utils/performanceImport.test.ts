import { describe, expect, test } from 'vitest'
import { parsePerformanceFile } from './performanceImport'

describe('performance import', () => {
  test('derives total return from equity endpoints when nav is present', async () => {
    const csv = ['date,nav,return', '2026-01-01,100,0.10', '2026-01-02,121,0.10'].join('\n')
    const file = new File([csv], 'performance.csv', { type: 'text/csv' })

    const imported = await parsePerformanceFile(file)

    expect(imported.equityCurve).toEqual([
      { date: '2026-01-01', value: 1 },
      { date: '2026-01-02', value: 1.21 },
    ])
    expect(imported.metrics.totalReturn).toBeCloseTo(0.21, 6)
    expect(imported.monthlyReturns[0]?.return).toBeCloseTo(0.21, 6)
  })
})
