import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { StrategyFormModal } from './StrategyFormModal'

const importedBpPayload = {
  equityCurve: [
    { date: '2024-01-02', value: 1 },
    { date: '2024-01-03', value: 0.9997 },
  ],
  drawdownCurve: [
    { date: '2024-01-02', value: 0 },
    { date: '2024-01-03', value: -0.0003 },
  ],
  monthlyReturns: [{ month: '2024-01', return: -0.0003 }],
  metrics: {
    annualReturn: -0.0125,
    sharpe: -5.257389,
    maxDrawdown: -0.0003,
    winRate: 0.5,
    tradeCount: 2,
    volatility: 0.002381,
    totalReturn: -0.0003,
    startDate: '2024-01-02',
    alpha: 0,
    runningDays: 2,
    positionCount: 1,
    monthlyWinRate: 0,
    performanceMode: 'bp' as const,
    cumulativeReturnBp: -3,
    maxDrawdownBp: -4.5,
  },
  observations: 2,
  sourceType: 'bp' as const,
  bpExports: [
    {
      filename: 'bp_metrics_summary.csv',
      label: '下载汇总结果',
      content: 'summary',
    },
  ],
}

describe('StrategyFormModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('shows detailed bp file guide', async () => {
    const user = userEvent.setup()

    render(
      <StrategyFormModal
        channel="backtest"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: '文件说明' }))

    expect(screen.getByRole('heading', { name: '文件说明' })).toBeInTheDocument()
    expect(
      screen.getByText('支持两份文件：信号文件和收益率文件，二者都支持 CSV / XLSX。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '执行延迟 `N` 表示按 T+N 日收盘成交：`0` 为 T 日成交，`1` 为 T+1 日成交，`2` 为 T+2 日成交，以此类推。',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'BP 模式会回填 7 项指标：累计收益（bp）、总胜率、交易次数、最大回撤（bp）、波动率、运行天数、起始日期。',
      ),
    ).toBeInTheDocument()
  })

  test('imports bp files and backfills bp-specific metrics', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(importedBpPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <StrategyFormModal
        channel="backtest"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'BP 信号文件' }))
    await user.upload(
      screen.getByLabelText('信号文件（CSV / XLSX）'),
      new File(['date,signal\n2024-01-02,1'], 'signals.csv', { type: 'text/csv' }),
    )
    await user.upload(
      screen.getByLabelText('收益率文件（CSV / XLSX）'),
      new File(['date,yield\n2024-01-02,5.0'], 'yields.csv', { type: 'text/csv' }),
    )
    await user.clear(screen.getByLabelText('执行延迟 N'))
    await user.type(screen.getByLabelText('执行延迟 N'), '2')

    await user.click(screen.getByRole('button', { name: '计算并回填' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('已按 BP 模式计算 2 条记录，并回填7项 BP 指标。'),
    )

    expect(screen.queryByLabelText('夏普比率')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('累计收益率')).not.toBeInTheDocument()
    expect((screen.getByLabelText('累计收益（bp）') as HTMLInputElement).value).toBe('-3')
    expect((screen.getByLabelText('最大回撤（bp）') as HTMLInputElement).value).toBe('-4.5')
    expect((screen.getByLabelText('起始日期') as HTMLInputElement).value).toBe('2024/01/02')
    expect(screen.getByRole('button', { name: '下载汇总结果' })).toBeInTheDocument()
  })
})
