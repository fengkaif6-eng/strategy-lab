import * as XLSX from 'xlsx'
import { describe, expect, test } from 'vitest'
import { inspectBpFile } from './bpFileSchema'

function createWorkbookFile(rows: Array<Array<string | number>>, filename: string) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new File([buffer], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('inspectBpFile', () => {
  test('keeps implicit first column empty so signal date can fall back to first column', async () => {
    const file = new File(
      [',signal\n2024-01-02,1\n2024-01-03,-1'],
      'signals.csv',
      { type: 'text/csv' },
    )

    const result = await inspectBpFile(file, 'signal')

    expect(result.columns[0]).toBe('Unnamed: 0')
    expect(result.suggestedDateColumn).toBeNull()
    expect(result.suggestedValueColumn).toBe('signal')
  })

  test('auto-detects Chinese signal columns from csv', async () => {
    const file = new File(
      ['日期,最终信号,bp_stop_loss_triggered\n2024-01-02,1,0\n2024-01-03,-1,1'],
      'signals.csv',
      { type: 'text/csv' },
    )

    const result = await inspectBpFile(file, 'signal')

    expect(result.suggestedDateColumn).toBe('date')
    expect(result.suggestedValueColumn).toBe('最终信号')
    expect(result.suggestedExternalStopColumn).toBe('bp_stop_loss_triggered')
  })

  test('auto-detects titled multi-tenor yield workbook', async () => {
    const file = createWorkbookFile(
      [
        ['利率走势数据'],
        [
          '指标名称',
          '中债商业银行无固定期限资本债(行权)收益率曲线(AAA-):1月',
          '中债商业银行无固定期限资本债(行权)收益率曲线(AAA-):1年',
        ],
        ['指标ID', 'code1', 'code2'],
        ['2024-01-02', 5.12, 5.35],
        ['2024-01-03', 5.1, 5.31],
      ],
      'yields.xlsx',
    )

    const result = await inspectBpFile(file, 'yield')

    expect(result.suggestedDateColumn).toBe('date')
    expect(result.requiresExplicitValueColumnSelection).toBe(true)
    expect(result.candidateValueColumns).toEqual([
      '中债商业银行无固定期限资本债(行权)收益率曲线(AAA-):1月',
      '中债商业银行无固定期限资本债(行权)收益率曲线(AAA-):1年',
    ])
    expect(result.suggestedValueColumn).toBeNull()
  })
})
