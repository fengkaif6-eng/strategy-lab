import type {
  BacktestStrategyRecord,
  LiveStrategyRecord,
  StrategyCollection,
} from '../types/strategy'

const months = [
  '2025-04',
  '2025-05',
  '2025-06',
  '2025-07',
  '2025-08',
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
]

function buildMonthlySeries(values: number[]) {
  return months.map((month, index) => ({
    month,
    return: values[index],
  }))
}

function buildCurve(values: number[]) {
  return months.map((date, index) => ({
    date,
    value: values[index],
  }))
}

export const seedBacktestStrategies: BacktestStrategyRecord[] = [
  {
    id: 'bt-001',
    name: '沪深300趋势动量',
    channel: 'backtest',
    author: '量研团队A',
    tags: ['趋势', '中频', '指数增强'],
    riskLevel: 'medium',
    status: 'active',
    updatedAt: '2026-03-22',
    summary: '结合均线趋势与行业相对强度，在回撤控制下做指数增强。',
    metrics: {
      annualReturn: 0.2486,
      sharpe: 1.82,
      maxDrawdown: -0.082,
      winRate: 0.625,
      tradeCount: 156,
      volatility: 0.154,
    },
    detail: {
      description:
        '策略在指数上行阶段保持高仓位，在震荡阶段自动收缩仓位并提升防御资产占比。',
      logic: '20日与60日均线判定趋势，叠加行业轮动强度排序，每周调仓。',
      params: {
        trendWindow: 20,
        rebalanceFreq: 'weekly',
        stopLoss: '6%',
        maxHolding: 12,
      },
      equityCurve: buildCurve([
        1.0, 1.03, 1.07, 1.06, 1.12, 1.11, 1.16, 1.2, 1.19, 1.24, 1.27, 1.29,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.012, -0.018, -0.026, -0.015, -0.021, -0.012, -0.01, -0.022,
        -0.013, -0.008, -0.006,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.03, 0.04, -0.01, 0.06, -0.008, 0.044, 0.035, -0.012, 0.041, 0.024,
        0.018, 0.016,
      ]),
      riskNotes: ['对快速反转行情敏感', '行业集中度上限 30%', '极端波动日可能降低仓位'],
    },
  },
  {
    id: 'bt-002',
    name: '小市值质量轮动',
    channel: 'backtest',
    author: '量研团队B',
    tags: ['轮动', '小盘', '财务因子'],
    riskLevel: 'high',
    status: 'active',
    updatedAt: '2026-03-20',
    summary: '在小盘股池内筛选高ROE低负债标的，月度换仓。',
    metrics: {
      annualReturn: 0.312,
      sharpe: 1.58,
      maxDrawdown: -0.134,
      winRate: 0.58,
      tradeCount: 192,
      volatility: 0.209,
    },
    detail: {
      description:
        '高弹性策略，通过基本面质量过滤提升小盘股组合的稳定性与持续性。',
      logic: 'PE分位过滤 + ROE排名 + 现金流稳定度打分，每月首个交易日调仓。',
      params: {
        topN: 20,
        rebalanceFreq: 'monthly',
        roeThreshold: '12%',
        turnoverCap: '35%',
      },
      equityCurve: buildCurve([
        1.0, 1.05, 1.08, 1.13, 1.1, 1.18, 1.22, 1.2, 1.26, 1.31, 1.34, 1.36,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.015, -0.022, -0.018, -0.043, -0.03, -0.026, -0.041, -0.028,
        -0.024, -0.02, -0.018,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.05, 0.028, 0.044, -0.021, 0.071, 0.034, -0.017, 0.052, 0.037, 0.019,
        0.016, 0.015,
      ]),
      riskNotes: ['高换手导致冲击成本增加', '流动性约束需严格执行', '风格切换时波动较大'],
    },
  },
  {
    id: 'bt-003',
    name: '防御红利低波',
    channel: 'backtest',
    author: '量研团队C',
    tags: ['红利', '低波', '稳健'],
    riskLevel: 'low',
    status: 'paused',
    updatedAt: '2026-03-18',
    summary: '选择高分红稳定现金流企业，强调组合波动控制。',
    metrics: {
      annualReturn: 0.146,
      sharpe: 1.36,
      maxDrawdown: -0.058,
      winRate: 0.67,
      tradeCount: 84,
      volatility: 0.102,
    },
    detail: {
      description:
        '以低波因子和分红持续性为核心，适合震荡市环境中的防御型配置。',
      logic: '股息率排名 + 低波打分 + 现金流覆盖率过滤，双月调仓。',
      params: {
        rebalanceFreq: 'bi-monthly',
        dividendYieldMin: '3%',
        maxSingleWeight: '10%',
      },
      equityCurve: buildCurve([
        1.0, 1.015, 1.028, 1.032, 1.045, 1.052, 1.061, 1.074, 1.078, 1.089,
        1.097, 1.106,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.006, -0.008, -0.01, -0.007, -0.009, -0.008, -0.007, -0.011,
        -0.009, -0.008, -0.007,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.015, 0.013, 0.004, 0.012, 0.007, 0.009, 0.012, 0.004, 0.01, 0.007,
        0.008, 0.006,
      ]),
      riskNotes: ['上涨行情中可能跑输成长风格', '组合集中在高分红行业', '分红政策变化影响较大'],
    },
  },
  {
    id: 'bt-004',
    name: 'AI情绪择时',
    channel: 'backtest',
    author: '量研团队D',
    tags: ['择时', '情绪', '事件驱动'],
    riskLevel: 'high',
    status: 'active',
    updatedAt: '2026-03-23',
    summary: '融合新闻情绪与市场宽度信号进行仓位择时。',
    metrics: {
      annualReturn: 0.287,
      sharpe: 1.69,
      maxDrawdown: -0.112,
      winRate: 0.61,
      tradeCount: 173,
      volatility: 0.194,
    },
    detail: {
      description:
        '通过文本情绪指数与盘口宽度数据驱动仓位动态调整，在风险事件前主动降杠杆。',
      logic: '日度情绪指数 + 市场宽度阈值 + 成交额扩散模型，日内一次调整。',
      params: {
        sentimentLookback: 5,
        breadthThreshold: 0.56,
        leverageCap: 1.2,
      },
      equityCurve: buildCurve([
        1.0, 1.04, 1.09, 1.07, 1.13, 1.18, 1.17, 1.22, 1.25, 1.24, 1.3, 1.33,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.012, -0.017, -0.038, -0.021, -0.015, -0.032, -0.019, -0.016,
        -0.025, -0.014, -0.011,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.04, 0.048, -0.02, 0.057, 0.044, -0.012, 0.046, 0.029, -0.009, 0.051,
        0.023, 0.018,
      ]),
      riskNotes: ['情绪模型存在噪声风险', '突发事件可能导致滑点放大', '需监控模型漂移'],
    },
  },
]

export const seedLiveStrategies: LiveStrategyRecord[] = [
  {
    id: 'lv-101',
    name: '沪深300趋势动量-实盘',
    channel: 'live',
    author: '量研团队A',
    tags: ['趋势', '实盘', '指数增强'],
    riskLevel: 'medium',
    status: 'active',
    updatedAt: '2026-03-24',
    summary: '回测策略已上线实盘，主要执行指数增强与防御切换。',
    metrics: {
      totalReturn: 0.084,
      alpha: 0.031,
      maxDrawdown: -0.037,
      runningDays: 126,
      positionCount: 11,
      monthlyWinRate: 0.67,
    },
    detail: {
      description: '在真实交易中执行周频调仓，并结合风控阈值做仓位调整。',
      logic: '趋势判断 + 行业轮动 + 盘中风控阈值触发。',
      params: {
        rebalanceFreq: 'weekly',
        riskGuard: 'VIX-like > 24',
        maxHolding: 12,
      },
      equityCurve: buildCurve([
        1.0, 1.01, 1.015, 1.024, 1.03, 1.038, 1.041, 1.056, 1.063, 1.071, 1.08,
        1.084,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.006, -0.01, -0.008, -0.013, -0.009, -0.012, -0.009, -0.011,
        -0.01, -0.008, -0.007,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.01, 0.005, 0.009, 0.006, 0.008, 0.003, 0.015, 0.007, 0.008, 0.009,
        0.004, 0.003,
      ]),
      riskNotes: ['风控阈值触发后会降低持仓', '成交量低时执行偏差上升'],
    },
  },
  {
    id: 'lv-102',
    name: '中证500波段突破-实盘',
    channel: 'live',
    author: '量研团队E',
    tags: ['波段', '突破', '中盘'],
    riskLevel: 'high',
    status: 'active',
    updatedAt: '2026-03-23',
    summary: '中证500成分股波段突破策略，当前以成长行业为主。',
    metrics: {
      totalReturn: 0.126,
      alpha: 0.045,
      maxDrawdown: -0.064,
      runningDays: 168,
      positionCount: 14,
      monthlyWinRate: 0.58,
    },
    detail: {
      description: '适合趋势延续行情，仓位切换速度快，收益弹性较高。',
      logic: '20日新高突破 + 成交量确认 + ATR 止损机制。',
      params: {
        breakoutWindow: 20,
        atrStop: 2.1,
        maxHolding: 15,
      },
      equityCurve: buildCurve([
        1.0, 1.018, 1.027, 1.041, 1.036, 1.049, 1.062, 1.071, 1.088, 1.097,
        1.112, 1.126,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.009, -0.012, -0.014, -0.026, -0.019, -0.018, -0.022, -0.017,
        -0.021, -0.016, -0.014,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.018, 0.009, 0.014, -0.005, 0.013, 0.012, 0.008, 0.017, 0.009, 0.014,
        0.013, 0.011,
      ]),
      riskNotes: ['突破失败会导致连续小亏', '对成交量数据质量敏感'],
    },
  },
  {
    id: 'lv-103',
    name: '行业轮动稳健组合-实盘',
    channel: 'live',
    author: '量研团队F',
    tags: ['行业轮动', '稳健', '低波'],
    riskLevel: 'low',
    status: 'paused',
    updatedAt: '2026-03-19',
    summary: '行业轮动稳健组合，当前处于策略维护窗口。',
    metrics: {
      totalReturn: 0.059,
      alpha: 0.018,
      maxDrawdown: -0.025,
      runningDays: 203,
      positionCount: 8,
      monthlyWinRate: 0.71,
    },
    detail: {
      description: '关注防御行业的轮动机会，保持较低波动和稳定收益曲线。',
      logic: '行业景气评分 + 波动率约束 + 组合风险预算。',
      params: {
        maxIndustryWeight: '20%',
        turnoverCap: '18%',
        rebalanceFreq: 'weekly',
      },
      equityCurve: buildCurve([
        1.0, 1.006, 1.011, 1.017, 1.022, 1.026, 1.031, 1.038, 1.043, 1.049,
        1.053, 1.059,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.003, -0.005, -0.004, -0.006, -0.007, -0.006, -0.005, -0.007,
        -0.006, -0.005, -0.004,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.006, 0.005, 0.006, 0.005, 0.004, 0.005, 0.007, 0.005, 0.006, 0.004,
        0.004, 0.005,
      ]),
      riskNotes: ['暂停期间不进行新开仓', '行业景气变化可能带来再平衡压力'],
    },
  },
  {
    id: 'lv-104',
    name: '事件套利快反组合-实盘',
    channel: 'live',
    author: '量研团队G',
    tags: ['事件驱动', '快反', '套利'],
    riskLevel: 'high',
    status: 'active',
    updatedAt: '2026-03-24',
    summary: '针对公告事件与异动盘口的快反套利，注重执行质量。',
    metrics: {
      totalReturn: 0.097,
      alpha: 0.039,
      maxDrawdown: -0.051,
      runningDays: 97,
      positionCount: 9,
      monthlyWinRate: 0.62,
    },
    detail: {
      description: '以事件触发信号为主，持仓周期短，依赖高质量执行与风控。',
      logic: '公告情绪打分 + 异动成交量 + 盘口冲击成本模型。',
      params: {
        maxHoldingDays: 7,
        stopLoss: '4%',
        eventScoreThreshold: 0.72,
      },
      equityCurve: buildCurve([
        1.0, 1.012, 1.019, 1.028, 1.035, 1.04, 1.051, 1.059, 1.071, 1.078,
        1.089, 1.097,
      ]),
      drawdownCurve: buildCurve([
        0.0, -0.006, -0.007, -0.011, -0.013, -0.016, -0.012, -0.017, -0.013,
        -0.015, -0.011, -0.01,
      ]),
      monthlyReturns: buildMonthlySeries([
        0.012, 0.007, 0.009, 0.007, 0.005, 0.011, 0.008, 0.012, 0.007, 0.011,
        0.008, 0.007,
      ]),
      riskNotes: ['事件拥挤时收益衰减明显', '依赖盘口质量，需控制滑点'],
    },
  },
]

export const seedStrategies: StrategyCollection = {
  backtest: seedBacktestStrategies,
  live: seedLiveStrategies,
}
