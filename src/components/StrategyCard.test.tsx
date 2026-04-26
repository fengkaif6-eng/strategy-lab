import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { seedBacktestStrategies } from '../data/seedStrategies'
import type { StrategyRecord } from '../types/strategy'
import { StrategyCard } from './StrategyCard'

describe('StrategyCard', () => {
  test('renders standard strategy metrics and detail link', () => {
    const strategy = seedBacktestStrategies[0]
    render(
      <MemoryRouter>
        <StrategyCard strategy={strategy} />
      </MemoryRouter>,
    )

    expect(screen.getByText(strategy.name)).toBeInTheDocument()
    expect(screen.getByText('年化收益')).toBeInTheDocument()
    expect(screen.getByText('收益走势')).toBeInTheDocument()
    const detailLink = screen.getByRole('link', { name: `查看策略 ${strategy.name} 详情` })
    expect(detailLink).toHaveAttribute(
      'href',
      `/strategy/${strategy.channel}/${strategy.id}`,
    )
  })

  test('renders bp strategy metrics with volatility but without sharpe or trade count', () => {
    const strategy: StrategyRecord = {
      id: 'bp-test',
      name: 'BP Strategy',
      channel: 'backtest',
      author: 'Tester',
      tags: ['bp'],
      riskLevel: 'medium',
      status: 'active',
      updatedAt: '2026-04-13',
      summary: 'bp strategy',
      metrics: {
        annualReturn: 0.12,
        sharpe: 1.5,
        maxDrawdown: -0.03,
        tradeCount: 12,
        volatility: 0.08,
        totalReturn: 0.03,
        performanceMode: 'bp',
        cumulativeReturnBp: 18.5,
        maxDrawdownBp: -7.2,
      },
      detail: {
        description: 'd',
        logic: 'l',
        params: {},
        equityCurve: [
          { date: '2026-04-01', value: 1 },
          { date: '2026-04-02', value: 1.0005 },
        ],
        drawdownCurve: [
          { date: '2026-04-01', value: 0 },
          { date: '2026-04-02', value: -0.0002 },
        ],
        monthlyReturns: [{ month: '2026-04', return: 0.0005 }],
        riskNotes: [],
        attachments: [],
      },
    }

    render(
      <MemoryRouter>
        <StrategyCard strategy={strategy} />
      </MemoryRouter>,
    )

    expect(screen.getByText('累计收益(bp)')).toBeInTheDocument()
    expect(screen.getByText('最大回撤(bp)')).toBeInTheDocument()
    expect(screen.getByText('波动率')).toBeInTheDocument()
    expect(screen.queryByText('夏普比率')).not.toBeInTheDocument()
    expect(screen.queryByText('累计收益率')).not.toBeInTheDocument()
    expect(screen.queryByText('交易次数')).not.toBeInTheDocument()
    expect(screen.getByText('+18.50 bp')).toBeInTheDocument()
  })

  test('uses detailTo override when provided', () => {
    const strategy = seedBacktestStrategies[0]
    render(
      <MemoryRouter>
        <StrategyCard strategy={strategy} detailTo="/login" />
      </MemoryRouter>,
    )

    const detailLink = screen.getByRole('link', { name: `查看策略 ${strategy.name} 详情` })
    expect(detailLink).toHaveAttribute('href', '/login')
  })
})
