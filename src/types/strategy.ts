export type StrategyChannel = 'backtest' | 'live' | 'thirdparty'
export type StrategyStatus = 'active' | 'paused' | 'archived'
export type RiskLevel = 'low' | 'medium' | 'high'
export type PerformanceMetricMode = 'standard' | 'bp'

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
  sourceType?: 'url' | 'file'
  fileName?: string
  fileSize?: number
  mimeType?: string
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
  showOnHome?: boolean
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
  winRate?: number
  tradeCount: number
  volatility: number
  runningDays?: number
  totalReturn?: number
  startDate?: string
  performanceMode?: PerformanceMetricMode
  cumulativeReturnBp?: number
  maxDrawdownBp?: number
}

export interface LiveMetrics {
  annualReturn?: number
  sharpe?: number
  winRate?: number
  tradeCount?: number
  totalReturn: number
  alpha: number
  maxDrawdown: number
  volatility?: number
  runningDays: number
  startDate?: string
  positionCount: number
  monthlyWinRate?: number
  performanceMode?: PerformanceMetricMode
  cumulativeReturnBp?: number
  maxDrawdownBp?: number
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

export interface ThirdPartyStrategyRecord extends StrategyBase {
  channel: 'thirdparty'
  metrics: BacktestMetrics
  detail: StrategyDetail
}

export type StrategyRecord =
  | BacktestStrategyRecord
  | LiveStrategyRecord
  | ThirdPartyStrategyRecord

export type StrategyCollection = {
  backtest: BacktestStrategyRecord[]
  live: LiveStrategyRecord[]
  thirdparty: ThirdPartyStrategyRecord[]
}
