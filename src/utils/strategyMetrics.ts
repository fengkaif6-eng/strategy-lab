import type { StrategyChannel, StrategyRecord } from '../types/strategy'
import { formatDate, formatPercent, formatSigned } from './format'

type Translate = (zhText: string, enText: string) => string

type StandardMetricKey =
  | 'annualReturn'
  | 'sharpe'
  | 'winRate'
  | 'tradeCount'
  | 'maxDrawdown'
  | 'volatility'
  | 'runningDays'
  | 'totalReturn'
  | 'startDate'

type StrategyDisplayMetricKey =
  | StandardMetricKey
  | 'cumulativeReturnBp'
  | 'maxDrawdownBp'

type MetricKind = 'percent' | 'signed' | 'integer' | 'date' | 'bp'

interface MetricDefinition<Key extends string = StrategyDisplayMetricKey> {
  key: Key
  label: (t: Translate) => string
  kind: MetricKind
  rawValue?: (metrics: UnifiedStrategyMetrics) => number | undefined
}

const STANDARD_METRIC_DEFINITIONS: Array<MetricDefinition<StandardMetricKey>> = [
  {
    key: 'annualReturn',
    label: (t) => t('年化收益率', 'Annual Return'),
    kind: 'percent',
    rawValue: (metrics) => metrics.annualReturn ?? undefined,
  },
  {
    key: 'sharpe',
    label: (t) => t('夏普比率', 'Sharpe Ratio'),
    kind: 'signed',
    rawValue: (metrics) => metrics.sharpe ?? undefined,
  },
  {
    key: 'winRate',
    label: (t) => t('总胜率', 'Win Rate'),
    kind: 'percent',
    rawValue: (metrics) =>
      metrics.winRate === null ? undefined : metrics.winRate - 0.5,
  },
  {
    key: 'maxDrawdown',
    label: (t) => t('最大回撤', 'Max Drawdown'),
    kind: 'percent',
    rawValue: (metrics) => metrics.maxDrawdown ?? undefined,
  },
  {
    key: 'volatility',
    label: (t) => t('波动率', 'Volatility'),
    kind: 'percent',
    rawValue: (metrics) =>
      metrics.volatility === null ? undefined : -metrics.volatility,
  },
  {
    key: 'runningDays',
    label: (t) => t('运行天数', 'Running Days'),
    kind: 'integer',
    rawValue: (metrics) => metrics.runningDays ?? undefined,
  },
  {
    key: 'totalReturn',
    label: (t) => t('累计收益率', 'Total Return'),
    kind: 'percent',
    rawValue: (metrics) => metrics.totalReturn ?? undefined,
  },
  {
    key: 'startDate',
    label: (t) => t('起始日期', 'Start Date'),
    kind: 'date',
  },
]

const BP_METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'cumulativeReturnBp',
    label: (t) => t('累计收益（bp）', 'Cumulative Return (bp)'),
    kind: 'bp',
    rawValue: (metrics) => metrics.cumulativeReturnBp ?? undefined,
  },
  {
    key: 'winRate',
    label: (t) => t('总胜率', 'Win Rate'),
    kind: 'percent',
    rawValue: (metrics) =>
      metrics.winRate === null ? undefined : metrics.winRate - 0.5,
  },
  {
    key: 'maxDrawdownBp',
    label: (t) => t('最大回撤（bp）', 'Max Drawdown (bp)'),
    kind: 'bp',
    rawValue: (metrics) => metrics.maxDrawdownBp ?? undefined,
  },
  {
    key: 'volatility',
    label: (t) => t('波动率', 'Volatility'),
    kind: 'percent',
    rawValue: (metrics) =>
      metrics.volatility === null ? undefined : -metrics.volatility,
  },
  {
    key: 'runningDays',
    label: (t) => t('运行天数', 'Running Days'),
    kind: 'integer',
    rawValue: (metrics) => metrics.runningDays ?? undefined,
  },
  {
    key: 'startDate',
    label: (t) => t('起始日期', 'Start Date'),
    kind: 'date',
  },
]

export type StrategyMetricId = `metric:${StrategyDisplayMetricKey}`

export interface StrategyMetricItem {
  id: StrategyMetricId
  channel: StrategyChannel
  label: string
  value: string
  rawValue?: number
}

export interface StrategyMetricRow {
  id: StrategyMetricId
  channel: StrategyChannel
  label: string
}

export type CompareMetricId = `compare:${StandardMetricKey}`

export interface CompareMetricRow {
  id: CompareMetricId
  label: string
}

export interface UnifiedStrategyMetrics {
  annualReturn: number | null
  sharpe: number | null
  winRate: number | null
  tradeCount: number | null
  maxDrawdown: number | null
  volatility: number | null
  runningDays: number | null
  totalReturn: number | null
  startDate: string | null
  cumulativeReturnBp: number | null
  maxDrawdownBp: number | null
}

const EPSILON = 1e-12

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeRate(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null
  }
  if (Math.abs(value) > 1) {
    return value / 100
  }
  return value
}

function normalizeWinRate(value: number | null): number | null {
  const normalized = normalizeRate(value)
  if (normalized === null) {
    return null
  }
  if (normalized < 0) {
    return 0
  }
  if (normalized > 1) {
    return 1
  }
  return normalized
}

function normalizeDrawdown(value: number | null): number | null {
  const normalized = normalizeRate(value)
  if (normalized === null) {
    return null
  }
  const signed = normalized > 0 ? -normalized : normalized
  if (signed < -1) {
    return -1
  }
  if (signed > 0) {
    return 0
  }
  return signed
}

function normalizeNonNegativeInteger(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null
  }
  return Math.max(0, Math.round(value))
}

function normalizeDateInput(value: string): string {
  const normalized = value.trim().replace(/\//g, '-')
  if (/^\d{4}-\d{1,2}$/.test(normalized)) {
    const [year, month] = normalized.split('-')
    return `${year}-${month.padStart(2, '0')}-01`
  }
  return normalized
}

function toTimestamp(value: string): number | null {
  const input = normalizeDateInput(value)
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.getTime()
}

function toIsoDate(value: string): string | null {
  const timestamp = toTimestamp(value)
  if (timestamp === null) {
    return null
  }
  return new Date(timestamp).toISOString().slice(0, 10)
}

function calculateStdDev(values: number[]) {
  if (values.length <= 1) {
    return 0
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1)
  return Math.sqrt(variance)
}

function getMetricNumber(strategy: StrategyRecord, key: string): number | null {
  const metrics = strategy.metrics as unknown as Record<string, unknown>
  return toFiniteNumber(metrics[key])
}

function getMetricString(strategy: StrategyRecord, key: string): string | null {
  const metrics = strategy.metrics as unknown as Record<string, unknown>
  const raw = metrics[key]
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

function deriveStartDate(strategy: StrategyRecord): string | null {
  const directStartDate = getMetricString(strategy, 'startDate')
  if (directStartDate) {
    return toIsoDate(directStartDate) ?? directStartDate
  }

  const candidates: string[] = []
  strategy.detail.equityCurve.forEach((point) => {
    if (point.date.trim()) {
      candidates.push(point.date)
    }
  })
  strategy.detail.drawdownCurve.forEach((point) => {
    if (point.date.trim()) {
      candidates.push(point.date)
    }
  })
  strategy.detail.monthlyReturns.forEach((point) => {
    if (point.month.trim()) {
      candidates.push(point.month)
    }
  })

  if (candidates.length === 0) {
    return null
  }

  const parsedCandidates = candidates
    .map((value) => ({
      original: value,
      timestamp: toTimestamp(value),
    }))
    .filter(
      (item): item is { original: string; timestamp: number } =>
        item.timestamp !== null,
    )
    .sort((left, right) => left.timestamp - right.timestamp)

  if (parsedCandidates.length > 0) {
    return new Date(parsedCandidates[0].timestamp).toISOString().slice(0, 10)
  }

  return candidates[0] ?? null
}

function deriveRunningDays(strategy: StrategyRecord, startDate: string | null): number | null {
  const direct = normalizeNonNegativeInteger(getMetricNumber(strategy, 'runningDays'))
  if (direct !== null && direct > 0) {
    return direct
  }

  const startTimestamp = startDate ? toTimestamp(startDate) : null
  const latestCurveTimestamp = strategy.detail.equityCurve
    .map((point) => toTimestamp(point.date))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0]

  if (startTimestamp !== null && latestCurveTimestamp !== undefined) {
    const diffDays = Math.floor((latestCurveTimestamp - startTimestamp) / 86400000) + 1
    if (diffDays > 0) {
      return diffDays
    }
  }

  if (strategy.detail.equityCurve.length > 1) {
    return strategy.detail.equityCurve.length
  }

  if (strategy.detail.monthlyReturns.length > 0) {
    return strategy.detail.monthlyReturns.length * 30
  }

  return null
}

function deriveTotalReturn(strategy: StrategyRecord): number | null {
  const first = strategy.detail.equityCurve[0]?.value
  const last = strategy.detail.equityCurve[strategy.detail.equityCurve.length - 1]?.value
  if (
    typeof first === 'number' &&
    Number.isFinite(first) &&
    Math.abs(first) > EPSILON &&
    typeof last === 'number' &&
    Number.isFinite(last)
  ) {
    return last / first - 1
  }

  const direct = normalizeRate(getMetricNumber(strategy, 'totalReturn'))
  if (direct !== null) {
    return direct
  }

  return null
}

export function isBpStrategy(strategy: StrategyRecord): boolean {
  const metrics = strategy.metrics as unknown as Record<string, unknown>
  return (
    metrics.performanceMode === 'bp' ||
    typeof metrics.cumulativeReturnBp === 'number' ||
    typeof metrics.maxDrawdownBp === 'number'
  )
}

function deriveAnnualReturn(
  strategy: StrategyRecord,
  totalReturn: number | null,
  runningDays: number | null,
): number | null {
  const direct = normalizeRate(getMetricNumber(strategy, 'annualReturn'))
  if (direct !== null) {
    return direct
  }

  if (
    totalReturn !== null &&
    runningDays !== null &&
    runningDays > 0 &&
    totalReturn > -1
  ) {
    return Math.pow(1 + totalReturn, 365 / runningDays) - 1
  }

  return null
}

function deriveVolatility(strategy: StrategyRecord): number | null {
  const direct = normalizeRate(getMetricNumber(strategy, 'volatility'))
  if (direct !== null) {
    return Math.abs(direct)
  }

  const monthlyReturns = strategy.detail.monthlyReturns
    .map((item) => normalizeRate(toFiniteNumber(item.return) ?? 0))
    .filter((item): item is number => item !== null)

  if (monthlyReturns.length >= 2) {
    return calculateStdDev(monthlyReturns) * Math.sqrt(12)
  }

  if (strategy.detail.equityCurve.length >= 3) {
    const returns: number[] = []
    for (let index = 1; index < strategy.detail.equityCurve.length; index += 1) {
      const previous = strategy.detail.equityCurve[index - 1]?.value
      const current = strategy.detail.equityCurve[index]?.value
      if (
        typeof previous === 'number' &&
        Number.isFinite(previous) &&
        Math.abs(previous) > EPSILON &&
        typeof current === 'number' &&
        Number.isFinite(current)
      ) {
        returns.push(current / previous - 1)
      }
    }
    if (returns.length >= 2) {
      return calculateStdDev(returns) * Math.sqrt(252)
    }
  }

  return null
}

function deriveSharpe(
  strategy: StrategyRecord,
  annualReturn: number | null,
  volatility: number | null,
): number | null {
  const direct = toFiniteNumber(getMetricNumber(strategy, 'sharpe'))
  if (direct !== null) {
    return direct
  }

  if (
    annualReturn !== null &&
    volatility !== null &&
    Number.isFinite(volatility) &&
    Math.abs(volatility) > EPSILON
  ) {
    return annualReturn / volatility
  }

  return null
}

function deriveWinRate(strategy: StrategyRecord): number | null {
  const direct = normalizeWinRate(getMetricNumber(strategy, 'winRate'))
  if (direct !== null) {
    return direct
  }

  const monthlyWinRate = normalizeWinRate(getMetricNumber(strategy, 'monthlyWinRate'))
  if (monthlyWinRate !== null) {
    return monthlyWinRate
  }

  return null
}

function deriveTradeCount(strategy: StrategyRecord): number | null {
  const direct = normalizeNonNegativeInteger(getMetricNumber(strategy, 'tradeCount'))
  if (direct !== null) {
    return direct
  }

  const positionCount = normalizeNonNegativeInteger(getMetricNumber(strategy, 'positionCount'))
  if (positionCount !== null) {
    return positionCount
  }

  if (strategy.detail.equityCurve.length > 1) {
    return strategy.detail.equityCurve.length - 1
  }

  if (strategy.detail.monthlyReturns.length > 0) {
    return strategy.detail.monthlyReturns.length
  }

  return null
}

function deriveMaxDrawdown(strategy: StrategyRecord): number | null {
  const direct = normalizeDrawdown(getMetricNumber(strategy, 'maxDrawdown'))
  if (direct !== null) {
    return direct
  }

  const curveValues = strategy.detail.drawdownCurve
    .map((item) => normalizeDrawdown(toFiniteNumber(item.value)))
    .filter((item): item is number => item !== null)

  if (curveValues.length > 0) {
    return Math.min(...curveValues)
  }

  if (strategy.detail.equityCurve.length > 1) {
    let peak = strategy.detail.equityCurve[0]?.value ?? 1
    let maxDrawdown = 0
    strategy.detail.equityCurve.forEach((point) => {
      if (!Number.isFinite(point.value)) {
        return
      }
      peak = Math.max(peak, point.value)
      if (Math.abs(peak) <= EPSILON) {
        return
      }
      const drawdown = point.value / peak - 1
      maxDrawdown = Math.min(maxDrawdown, drawdown)
    })
    return normalizeDrawdown(maxDrawdown)
  }

  return null
}

function deriveCumulativeReturnBp(strategy: StrategyRecord): number | null {
  return toFiniteNumber(getMetricNumber(strategy, 'cumulativeReturnBp'))
}

function deriveMaxDrawdownBp(strategy: StrategyRecord): number | null {
  return toFiniteNumber(getMetricNumber(strategy, 'maxDrawdownBp'))
}

export function getUnifiedStrategyMetrics(strategy: StrategyRecord): UnifiedStrategyMetrics {
  const startDate = deriveStartDate(strategy)
  const runningDays = deriveRunningDays(strategy, startDate)
  const totalReturn = deriveTotalReturn(strategy)
  const annualReturn = deriveAnnualReturn(strategy, totalReturn, runningDays)
  const volatility = deriveVolatility(strategy)

  return {
    annualReturn,
    sharpe: deriveSharpe(strategy, annualReturn, volatility),
    winRate: deriveWinRate(strategy),
    tradeCount: deriveTradeCount(strategy),
    maxDrawdown: deriveMaxDrawdown(strategy),
    volatility,
    runningDays,
    totalReturn,
    startDate,
    cumulativeReturnBp: deriveCumulativeReturnBp(strategy),
    maxDrawdownBp: deriveMaxDrawdownBp(strategy),
  }
}

function formatMetricValue(
  key: StrategyDisplayMetricKey,
  kind: MetricKind,
  metrics: UnifiedStrategyMetrics,
): string {
  const value = metrics[key]
  if (value === null || value === undefined) {
    return '--'
  }

  if (kind === 'percent') {
    return formatPercent(value as number)
  }

  if (kind === 'signed') {
    return formatSigned(value as number)
  }

  if (kind === 'integer') {
    return String(Math.max(0, Math.round(value as number)))
  }

  if (kind === 'bp') {
    return `${formatSigned(value as number)} bp`
  }

  const dateText = String(value)
  return formatDate(dateText)
}

function strategyMetricKey(metricId: StrategyMetricId): StrategyDisplayMetricKey {
  return metricId.replace('metric:', '') as StrategyDisplayMetricKey
}

function compareMetricKey(metricId: CompareMetricId): StandardMetricKey {
  return metricId.replace('compare:', '') as StandardMetricKey
}

function getMetricByKey(metrics: UnifiedStrategyMetrics, key: StrategyDisplayMetricKey): number | string | null {
  return metrics[key]
}

function getMetricDefinitions(strategy?: StrategyRecord): MetricDefinition[] {
  return strategy && isBpStrategy(strategy) ? BP_METRIC_DEFINITIONS : STANDARD_METRIC_DEFINITIONS
}

function getMetricKind(key: StrategyDisplayMetricKey, strategy?: StrategyRecord): MetricKind {
  return getMetricDefinitions(strategy).find((definition) => definition.key === key)?.kind ?? 'percent'
}

export function getStrategyMetricItems(strategy: StrategyRecord, t: Translate): StrategyMetricItem[] {
  const unified = getUnifiedStrategyMetrics(strategy)
  return getMetricDefinitions(strategy).map((definition) => ({
    id: `metric:${definition.key}`,
    channel: strategy.channel,
    label: definition.label(t),
    value: formatMetricValue(definition.key, definition.kind, unified),
    rawValue: definition.rawValue?.(unified),
  }))
}

export function getStrategyMetricRows(
  channels: ReadonlyArray<StrategyChannel>,
  t: Translate,
): StrategyMetricRow[] {
  const channel = channels[0] ?? 'backtest'
  return STANDARD_METRIC_DEFINITIONS.map((definition) => ({
    id: `metric:${definition.key}`,
    channel,
    label: definition.label(t),
  }))
}

export function getStrategyMetricDisplayValue(
  strategy: StrategyRecord,
  metricId: StrategyMetricId,
): string {
  const key = strategyMetricKey(metricId)
  const kind = getMetricKind(key, strategy)
  return formatMetricValue(key, kind, getUnifiedStrategyMetrics(strategy))
}

export function getCompareMetricRawValue(
  strategy: StrategyRecord,
  metricId: CompareMetricId,
): number | null {
  const key = compareMetricKey(metricId)
  const value = getMetricByKey(getUnifiedStrategyMetrics(strategy), key)

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (key === 'startDate' && typeof value === 'string') {
    return toTimestamp(value)
  }

  return null
}

export function getCompareMetricRows(t: Translate): CompareMetricRow[] {
  return STANDARD_METRIC_DEFINITIONS.map((definition) => ({
    id: `compare:${definition.key}`,
    label: definition.label(t),
  }))
}

export function getCompareMetricDisplayValue(
  strategy: StrategyRecord,
  metricId: CompareMetricId,
): string {
  const key = compareMetricKey(metricId)
  const kind = getMetricKind(key)
  return formatMetricValue(key, kind, getUnifiedStrategyMetrics(strategy))
}

