import { describe, expect, test } from 'vitest'
import { getUnifiedStrategyMetrics, isBpStrategy } from './strategyMetrics'
import type { StrategyRecord } from '../types/strategy'

describe('strategy metrics', () => {
  test('prioritizes equity curve for total return over stale metric field', () => {
    const strategy: StrategyRecord = {
      id: 'lv-test',
      name: 'Test Strategy',
      channel: 'live',
      author: 'Tester',
      tags: ['test'],
      riskLevel: 'medium',
      status: 'active',
      updatedAt: '2026-04-09',
      summary: 'for metric test',
      metrics: {
        totalReturn: 0.8,
        alpha: 0,
        maxDrawdown: -0.2,
        runningDays: 2,
        positionCount: 1,
      },
      detail: {
        description: 'd',
        logic: 'l',
        params: {},
        equityCurve: [
          { date: '2026-01-01', value: 1 },
          { date: '2026-01-02', value: 1.2 },
        ],
        drawdownCurve: [
          { date: '2026-01-01', value: 0 },
          { date: '2026-01-02', value: -0.05 },
        ],
        monthlyReturns: [{ month: '2026-01', return: 0.2 }],
        riskNotes: [],
        attachments: [],
      },
    }

    const unified = getUnifiedStrategyMetrics(strategy)
    expect(unified.totalReturn).toBeCloseTo(0.2, 6)
  })

  test('reads bp-only summary metrics from strategy record', () => {
    const strategy: StrategyRecord = {
      id: 'bt-bp',
      name: 'BP Strategy',
      channel: 'backtest',
      author: 'Tester',
      tags: ['bp'],
      riskLevel: 'medium',
      status: 'active',
      updatedAt: '2026-04-13',
      summary: 'bp metrics',
      metrics: {
        annualReturn: 0.1,
        sharpe: 1,
        maxDrawdown: -0.02,
        tradeCount: 4,
        volatility: 0.06,
        performanceMode: 'bp',
        cumulativeReturnBp: 15.5,
        maxDrawdownBp: -6.2,
      },
      detail: {
        description: 'd',
        logic: 'l',
        params: {},
        equityCurve: [
          { date: '2026-04-01', value: 1 },
          { date: '2026-04-02', value: 1.001 },
        ],
        drawdownCurve: [
          { date: '2026-04-01', value: 0 },
          { date: '2026-04-02', value: -0.001 },
        ],
        monthlyReturns: [{ month: '2026-04', return: 0.001 }],
        riskNotes: [],
        attachments: [],
      },
    }

    const unified = getUnifiedStrategyMetrics(strategy)
    expect(isBpStrategy(strategy)).toBe(true)
    expect(unified.cumulativeReturnBp).toBeCloseTo(15.5, 6)
    expect(unified.maxDrawdownBp).toBeCloseTo(-6.2, 6)
  })
})
