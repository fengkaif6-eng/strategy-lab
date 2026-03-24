export type StrategyChannel = 'backtest' | 'live'
export type StrategyStatus = 'active' | 'paused' | 'archived'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface CurvePoint {
  date: string
  value: number
}

export interface MonthlyReturn {
  month: string
  return: number
}

export interface StrategyAttachment {
  id: string
  title: string
  url: string
  note?: string
  createdAt: string
  createdBy: string
}

export interface StrategyDetail {
  description: string
  logic: string
  params: Record<string, string | number | boolean>
  equityCurve: CurvePoint[]
  drawdownCurve: CurvePoint[]
  monthlyReturns: MonthlyReturn[]
  riskNotes: string[]
  attachments: StrategyAttachment[]
}

export interface StrategyBase {
  id: string
  name: string
  channel: StrategyChannel
  author: string
  tags: string[]
  riskLevel: RiskLevel
  status: StrategyStatus
  updatedAt: string
  summary: string
}

export interface BacktestMetrics {
  annualReturn: number
  sharpe: number
  maxDrawdown: number
  winRate: number
  tradeCount: number
  volatility: number
}

export interface LiveMetrics {
  totalReturn: number
  alpha: number
  maxDrawdown: number
  runningDays: number
  positionCount: number
  monthlyWinRate: number
}

export interface BacktestStrategyRecord extends StrategyBase {
  channel: 'backtest'
  metrics: BacktestMetrics
  detail: StrategyDetail
}

export interface LiveStrategyRecord extends StrategyBase {
  channel: 'live'
  metrics: LiveMetrics
  detail: StrategyDetail
}

export type StrategyRecord = BacktestStrategyRecord | LiveStrategyRecord

export type StrategyCollection = {
  backtest: BacktestStrategyRecord[]
  live: LiveStrategyRecord[]
}
