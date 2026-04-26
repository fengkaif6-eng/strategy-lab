import type { CurvePoint, MonthlyReturn } from '../types/strategy'

type RawRow = Record<string, unknown>

interface PreparedPoint {
  index: number
  dateLabel: string
  timestamp: number | null
  equityValue: number | null
  returnValue: number | null
  winRateValue: number | null
  drawdownValue: number | null
  tradeCountValue: number | null
  positionCountValue: number | null
  alphaValue: number | null
}

export interface ImportedPerformanceMetrics {
  annualReturn: number
  sharpe: number
  maxDrawdown: number
  winRate: number | null
  tradeCount: number
  volatility: number
  totalReturn: number
  startDate: string
  alpha: number
  runningDays: number
  positionCount: number
  monthlyWinRate: number | null
  performanceMode?: 'standard' | 'bp'
  cumulativeReturnBp?: number
  maxDrawdownBp?: number
}

export interface ImportedPerformanceExport {
  filename: string
  label: string
  content: string
}

export interface ImportedPerformanceData {
  equityCurve: CurvePoint[]
  drawdownCurve: CurvePoint[]
  monthlyReturns: MonthlyReturn[]
  metrics: ImportedPerformanceMetrics
  observations: number
  sourceType: 'csv' | 'parquet' | 'xlsx' | 'bp'
  bpExports?: ImportedPerformanceExport[]
}

const DATE_COLUMN_CANDIDATES = [
  'date',
  'datetime',
  'time',
  'timestamp',
  'trade_date',
  'trading_date',
  '交易日',
  '日期',
  '时间',
]

const EQUITY_COLUMN_CANDIDATES = [
  'equity_curve',
  'equity',
  'net_value',
  'nav',
  'portfolio_value',
  'strategy_nav',
  '累计净值',
  '单位净值',
  '净值',
  '权益',
  '资金曲线',
]

const REQUIRED_NAV_COLUMN_CANDIDATES = [
  'nav',
  'net_value',
  '\u51c0\u503c',
]

const RETURN_COLUMN_CANDIDATES = [
  'daily_return',
  'strategy_return',
  'ret',
  'return',
  'returns',
  '收益率',
  '日收益',
  '收益',
  '策略收益率',
]

const WIN_RATE_COLUMN_CANDIDATES = [
  'win_rate',
  'winrate',
  'monthly_win_rate',
  'success_rate',
  '\u80dc\u7387',
  '\u603b\u80dc\u7387',
]

const DRAWDOWN_COLUMN_CANDIDATES = [
  'drawdown_curve',
  'drawdown',
  'max_drawdown',
  '回撤曲线',
  '回撤',
  '回撤率',
  '最大回撤',
]

const TRADE_COUNT_COLUMN_CANDIDATES = [
  'trade_count',
  'trades',
  'trade_num',
  '交易次数',
  '成交次数',
  '交易笔数',
]

const POSITION_COUNT_COLUMN_CANDIDATES = [
  'position_count',
  'positions',
  'holdings_count',
  '持仓数',
  '持仓数量',
  '仓位数量',
]

const ALPHA_COLUMN_CANDIDATES = ['alpha', 'alpha_return', '超额收益', '阿尔法']

const RETURN_COLUMN_EXCLUDES = ['total', 'cum', '累计', '年化', 'monthly']

const EPSILON = 1e-12
export const MISSING_NAV_COLUMN_ERROR =
  '\u7f3a\u5c11 `nav/net_value/\u51c0\u503c` \u5b57\u6bb5\u3002'

function normalizeHeaderName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/.]+/g, '')
}

function roundTo(value: number, digits = 6) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Number(value.toFixed(digits))
}

function normalizeRate(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (Math.abs(value) > 1) {
    return value / 100
  }
  return value
}

function normalizeDrawdown(value: number) {
  const normalized = normalizeRate(value)
  if (!Number.isFinite(normalized)) {
    return 0
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

function parseNumericValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'bigint') {
    const converted = Number(value)
    return Number.isFinite(converted) ? converted : null
  }
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const isParenthesisNegative =
    trimmed.startsWith('(') && trimmed.endsWith(')')
  const normalizedText = trimmed
    .replace(/[,%\s]/g, '')
    .replace(/[()]/g, '')
    .replace(/，/g, '')
  const parsed = Number(normalizedText)
  if (!Number.isFinite(parsed)) {
    return null
  }

  const signed = isParenthesisNegative ? -parsed : parsed
  if (trimmed.includes('%')) {
    return signed / 100
  }
  return signed
}

function parseDateCell(value: unknown, index: number) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const timestamp = value.getTime()
    return {
      label: value.toISOString().slice(0, 10),
      timestamp,
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) {
      const date = new Date(value)
      return {
        label: date.toISOString().slice(0, 10),
        timestamp: date.getTime(),
      }
    }
    if (value > 1_000_000_000) {
      const date = new Date(value * 1000)
      return {
        label: date.toISOString().slice(0, 10),
        timestamp: date.getTime(),
      }
    }
    if (value > 20_000 && value < 80_000) {
      const date = new Date((value - 25569) * 86400 * 1000)
      if (!Number.isNaN(date.getTime())) {
        return {
          label: date.toISOString().slice(0, 10),
          timestamp: date.getTime(),
        }
      }
    }
  }

  const text = String(value ?? '').trim()
  if (!text) {
    return {
      label: `P${String(index + 1).padStart(3, '0')}`,
      timestamp: null,
    }
  }

  const normalized = text.replace(/\//g, '-')
  if (/^\d{4}-\d{1,2}$/.test(normalized)) {
    const date = new Date(`${normalized}-01`)
    if (!Number.isNaN(date.getTime())) {
      return {
        label: normalized.replace(/-(\d)$/, '-0$1'),
        timestamp: date.getTime(),
      }
    }
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return {
      label: parsed.toISOString().slice(0, 10),
      timestamp: parsed.getTime(),
    }
  }

  return {
    label: text,
    timestamp: null,
  }
}

function inferMonthLabel(label: string, timestamp: number | null, index: number) {
  if (timestamp !== null) {
    return new Date(timestamp).toISOString().slice(0, 7)
  }
  const normalized = label.replace(/\//g, '-')
  const match = normalized.match(/^(\d{4})-(\d{1,2})/)
  if (match) {
    const year = match[1]
    const month = match[2].padStart(2, '0')
    return `${year}-${month}`
  }
  return `M${String(index + 1).padStart(2, '0')}`
}

function getColumnKeys(rows: RawRow[]) {
  const first = rows[0]
  if (!first) {
    return []
  }
  return Object.keys(first)
}

function pickColumn(columns: string[], candidates: string[]) {
  const normalizedColumns = columns.map((column) => ({
    raw: column,
    normalized: normalizeHeaderName(column),
  }))
  const normalizedCandidates = candidates.map(normalizeHeaderName)

  for (const candidate of normalizedCandidates) {
    const exactMatch = normalizedColumns.find(
      (column) => column.normalized === candidate,
    )
    if (exactMatch) {
      return exactMatch.raw
    }
  }

  for (const candidate of normalizedCandidates) {
    const includeMatch = normalizedColumns.find(
      (column) =>
        column.normalized.includes(candidate) ||
        candidate.includes(column.normalized),
    )
    if (includeMatch) {
      return includeMatch.raw
    }
  }

  return null
}

function pickReturnColumn(columns: string[]) {
  const selected = pickColumn(columns, RETURN_COLUMN_CANDIDATES)
  if (!selected) {
    return null
  }
  const normalized = normalizeHeaderName(selected)
  const excluded = RETURN_COLUMN_EXCLUDES.some((token) =>
    normalized.includes(normalizeHeaderName(token)),
  )
  if (excluded) {
    const alternatives = columns.filter((column) => {
      const text = normalizeHeaderName(column)
      const hasReturnKeyword =
        text.includes('return') || text.includes(normalizeHeaderName('收益'))
      const excludedToken = RETURN_COLUMN_EXCLUDES.some((token) =>
        text.includes(normalizeHeaderName(token)),
      )
      return hasReturnKeyword && !excludedToken
    })
    if (alternatives.length > 0) {
      return alternatives[0]
    }
  }
  return selected
}

function detectDelimiter(headerLine: string) {
  const candidates = [',', ';', '\t']
  const scored = candidates.map((delimiter) => ({
    delimiter,
    score: headerLine.split(delimiter).length,
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.delimiter ?? ','
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const nextChar = line[index + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function parseCsvRows(text: string): RawRow[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 2) {
    return []
  }

  const delimiter = detectDelimiter(lines[0])
  const header = parseDelimitedLine(lines[0], delimiter)
  const rows: RawRow[] = []

  lines.slice(1).forEach((line) => {
    const cells = parseDelimitedLine(line, delimiter)
    const row: RawRow = {}
    header.forEach((key, index) => {
      row[key] = cells[index] ?? ''
    })
    rows.push(row)
  })

  return rows
}

async function parseParquetRows(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer()
  const { parquetReadObjects } = await import('hyparquet')
  const rows = (await parquetReadObjects({
    file: buffer,
  })) as RawRow[]
  return rows
}

async function parseXlsxRows(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer()
  const { read, utils } = await import('xlsx')
  const workbook = read(buffer, {
    type: 'array',
    cellDates: true,
  })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    return []
  }
  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) {
    return []
  }
  return utils.sheet_to_json<RawRow>(sheet, {
    defval: '',
    raw: true,
  })
}

function inferPeriodsPerYear(timestamps: number[]) {
  if (timestamps.length < 2) {
    return 252
  }
  const diffs: number[] = []
  for (let index = 1; index < timestamps.length; index += 1) {
    const diffDays = Math.abs(timestamps[index] - timestamps[index - 1]) / 86400000
    if (diffDays > 0.25 && diffDays < 400) {
      diffs.push(diffDays)
    }
  }
  if (diffs.length === 0) {
    return 252
  }
  diffs.sort((a, b) => a - b)
  const median = diffs[Math.floor(diffs.length / 2)]
  if (median <= 2.5) {
    return 252
  }
  if (median <= 10) {
    return 52
  }
  if (median <= 45) {
    return 12
  }
  return 4
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

function inferCountFromSeries(values: number[], fallback: number) {
  if (values.length === 0) {
    return fallback
  }
  const rounded = values.map((value) => Math.max(0, Math.round(value)))
  const isNonDecreasing = rounded.every(
    (value, index) => index === 0 || value >= rounded[index - 1],
  )
  if (isNonDecreasing) {
    return rounded[rounded.length - 1] ?? fallback
  }
  const summed = rounded.reduce((sum, value) => sum + value, 0)
  if (summed > 0) {
    return summed
  }
  return fallback
}

function buildDrawdownFromEquity(equity: number[]) {
  const values: number[] = []
  let runningPeak = Number.NEGATIVE_INFINITY
  equity.forEach((value) => {
    runningPeak = Math.max(runningPeak, value)
    const drawdown =
      runningPeak <= 0 ? 0 : value / runningPeak - 1
    values.push(roundTo(drawdown))
  })
  return values
}

function buildMonthlyReturns(
  monthLabels: string[],
  returns: number[],
) {
  const grouped = new Map<string, number[]>()
  monthLabels.forEach((month, index) => {
    const list = grouped.get(month) ?? []
    list.push(returns[index] ?? 0)
    grouped.set(month, list)
  })

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, series]) => ({
      month,
      return: roundTo(
        series.reduce((product, item) => product * (1 + item), 1) - 1,
      ),
    }))
}

function preparePoints(rows: RawRow[]) {
  const columns = getColumnKeys(rows)
  if (columns.length === 0) {
    throw new Error('文件缺少表头，无法识别字段。')
  }

  const dateColumn = pickColumn(columns, DATE_COLUMN_CANDIDATES)
  const navColumn = pickColumn(columns, REQUIRED_NAV_COLUMN_CANDIDATES)
  if (!navColumn) {
    throw new Error(MISSING_NAV_COLUMN_ERROR)
  }
  const equityColumn =
    navColumn ?? pickColumn(columns, EQUITY_COLUMN_CANDIDATES)
  const returnColumn = pickReturnColumn(columns)
  const winRateColumn = pickColumn(columns, WIN_RATE_COLUMN_CANDIDATES)
  const drawdownColumn = pickColumn(columns, DRAWDOWN_COLUMN_CANDIDATES)
  const tradeCountColumn = pickColumn(columns, TRADE_COUNT_COLUMN_CANDIDATES)
  const positionCountColumn = pickColumn(columns, POSITION_COUNT_COLUMN_CANDIDATES)
  const alphaColumn = pickColumn(columns, ALPHA_COLUMN_CANDIDATES)

  const points = rows
    .map((row, index) => {
      const dateInfo = parseDateCell(dateColumn ? row[dateColumn] : index, index)
      return {
        index,
        dateLabel: dateInfo.label,
        timestamp: dateInfo.timestamp,
        equityValue: equityColumn ? parseNumericValue(row[equityColumn]) : null,
        returnValue: returnColumn ? parseNumericValue(row[returnColumn]) : null,
        winRateValue: winRateColumn ? parseNumericValue(row[winRateColumn]) : null,
        drawdownValue: drawdownColumn ? parseNumericValue(row[drawdownColumn]) : null,
        tradeCountValue: tradeCountColumn
          ? parseNumericValue(row[tradeCountColumn])
          : null,
        positionCountValue: positionCountColumn
          ? parseNumericValue(row[positionCountColumn])
          : null,
        alphaValue: alphaColumn ? parseNumericValue(row[alphaColumn]) : null,
      } satisfies PreparedPoint
    })
    .filter((point) => point.equityValue !== null || point.returnValue !== null)

  if (points.length < 2) {
    throw new Error('可用数据不足，至少需要 2 条含净值或收益率的记录。')
  }

  const datedPoints = points.filter((point) => point.timestamp !== null).length
  if (datedPoints >= Math.ceil(points.length * 0.6)) {
    points.sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null) {
        return left.timestamp - right.timestamp
      }
      return left.index - right.index
    })
  }

  return points
}

function buildPerformanceFromPoints(
  points: PreparedPoint[],
): ImportedPerformanceData {
  const hasEquityColumn = points.some(
    (point) => point.equityValue !== null && point.equityValue > 0,
  )

  const normalizedPoints = points.map((point) => ({ ...point, equity: 1 }))
  const equityValues: number[] = []

  if (hasEquityColumn) {
    const firstEquity =
      points.find((point) => point.equityValue !== null && point.equityValue > 0)
        ?.equityValue ?? null
    if (!firstEquity) {
      throw new Error('净值列没有有效正数，无法计算曲线。')
    }

    let latestEquity = 1
    normalizedPoints.forEach((point, index) => {
      let normalizedEquity =
        point.equityValue !== null && point.equityValue > 0
          ? point.equityValue / firstEquity
          : null
      if (normalizedEquity === null) {
        const returnValue =
          point.returnValue !== null ? normalizeRate(point.returnValue) : 0
        normalizedEquity = latestEquity * (1 + returnValue)
      }
      if (!Number.isFinite(normalizedEquity) || normalizedEquity <= 0) {
        normalizedEquity = latestEquity
      }
      normalizedPoints[index].equity = normalizedEquity
      latestEquity = normalizedEquity
      equityValues.push(roundTo(normalizedEquity))
    })
  } else {
    let cumulativeEquity = 1
    normalizedPoints.forEach((point, index) => {
      const returnValue =
        point.returnValue !== null ? normalizeRate(point.returnValue) : 0
      cumulativeEquity *= 1 + returnValue
      if (!Number.isFinite(cumulativeEquity) || cumulativeEquity <= 0) {
        cumulativeEquity = index === 0 ? 1 : normalizedPoints[index - 1].equity
      }
      normalizedPoints[index].equity = cumulativeEquity
      equityValues.push(roundTo(cumulativeEquity))
    })
  }

  if (equityValues.length < 2) {
    throw new Error('无法生成有效收益曲线，请检查净值/收益率列。')
  }

  const returns = normalizedPoints.map((point, index) => {
    if (index === 0) {
      return 0
    }
    const previous = normalizedPoints[index - 1].equity
    if (Math.abs(previous) <= EPSILON) {
      return 0
    }
    return point.equity / previous - 1
  })

  const computedDrawdown = buildDrawdownFromEquity(
    normalizedPoints.map((point) => point.equity),
  )
  const drawdownCandidates = normalizedPoints.map((point) =>
    point.drawdownValue === null
      ? null
      : roundTo(normalizeDrawdown(point.drawdownValue)),
  )
  const validProvidedDrawdown = drawdownCandidates.filter(
    (value) => value !== null,
  ).length
  const useProvidedDrawdown =
    validProvidedDrawdown >= Math.ceil(normalizedPoints.length * 0.6)
  const drawdownValues = drawdownCandidates.map((value, index) => {
    if (useProvidedDrawdown && value !== null) {
      return value
    }
    return computedDrawdown[index] ?? 0
  })

  const monthLabels = normalizedPoints.map((point, index) =>
    inferMonthLabel(point.dateLabel, point.timestamp, index),
  )
  const monthlyReturns = buildMonthlyReturns(monthLabels, returns)

  const timestamps = normalizedPoints
    .map((point) => point.timestamp)
    .filter((value): value is number => value !== null)
  const periodsPerYear = inferPeriodsPerYear(timestamps)

  const periodReturns = returns.slice(1).filter((value) => Number.isFinite(value))
  const firstEquity = normalizedPoints[0]?.equity ?? null
  const lastEquity =
    normalizedPoints[normalizedPoints.length - 1]?.equity ?? null
  const totalReturn =
    firstEquity !== null &&
    lastEquity !== null &&
    Math.abs(firstEquity) > EPSILON
      ? lastEquity / firstEquity - 1
      : 0
  const annualReturn =
    periodReturns.length > 0 && totalReturn > -1
      ? Math.pow(
          1 + totalReturn,
          periodsPerYear / Math.max(1, periodReturns.length),
        ) - 1
      : 0
  const volatility = calculateStdDev(periodReturns) * Math.sqrt(periodsPerYear)
  const sharpe =
    Math.abs(volatility) > EPSILON ? annualReturn / volatility : 0
  const maxDrawdown = Math.min(...drawdownValues)

  const nonZeroReturns = periodReturns.filter(
    (value) => Math.abs(value) > EPSILON,
  )
  const providedWinRates = normalizedPoints
    .map((point) => point.winRateValue)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .map((value) => Math.min(1, Math.max(0, normalizeRate(value))))
  const winRate =
    providedWinRates.length > 0
      ? providedWinRates[providedWinRates.length - 1]
      : null
  const monthlyWinRate = winRate

  const tradeSeries = normalizedPoints
    .map((point) => point.tradeCountValue)
    .filter((value): value is number => value !== null && value >= 0)
  const fallbackTradeCount =
    nonZeroReturns.length > 0 ? nonZeroReturns.length : periodReturns.length
  const tradeCount = inferCountFromSeries(tradeSeries, fallbackTradeCount)

  const positionSeries = normalizedPoints
    .map((point) => point.positionCountValue)
    .filter((value): value is number => value !== null && value >= 0)
  const positionCount =
    positionSeries.length > 0
      ? Math.max(0, Math.round(positionSeries[positionSeries.length - 1]))
      : 0

  const alphaSeries = normalizedPoints
    .map((point) => point.alphaValue)
    .filter((value): value is number => value !== null)
  const alpha =
    alphaSeries.length > 0
      ? normalizeRate(alphaSeries[alphaSeries.length - 1])
      : 0

  const equityCurve: CurvePoint[] = normalizedPoints.map((point, index) => ({
    date: point.dateLabel || `P${String(index + 1).padStart(3, '0')}`,
    value: roundTo(point.equity),
  }))

  const drawdownCurve: CurvePoint[] = drawdownValues.map((value, index) => ({
    date: equityCurve[index]?.date ?? `P${String(index + 1).padStart(3, '0')}`,
    value: roundTo(value),
  }))

  const firstTimestamp = normalizedPoints.find((point) => point.timestamp !== null)?.timestamp ?? null
  const lastTimestamp =
    normalizedPoints
      .slice()
      .reverse()
      .find((point) => point.timestamp !== null)?.timestamp ?? null
  const runningDaysFromDate =
    firstTimestamp !== null && lastTimestamp !== null && lastTimestamp >= firstTimestamp
      ? Math.floor((lastTimestamp - firstTimestamp) / 86400000) + 1
      : null
  const runningDays = Math.max(1, runningDaysFromDate ?? normalizedPoints.length)

  return {
    equityCurve,
    drawdownCurve,
    monthlyReturns: monthlyReturns.map((item) => ({
      month: item.month,
      return: roundTo(item.return),
    })),
    metrics: {
      annualReturn: roundTo(annualReturn),
      sharpe: roundTo(sharpe),
      maxDrawdown: roundTo(maxDrawdown),
      winRate: winRate === null ? null : roundTo(winRate),
      tradeCount: Math.max(0, Math.round(tradeCount)),
      volatility: roundTo(volatility),
      totalReturn: roundTo(totalReturn),
      startDate: equityCurve[0]?.date ?? '',
      alpha: roundTo(alpha),
      runningDays,
      positionCount,
      monthlyWinRate: monthlyWinRate === null ? null : roundTo(monthlyWinRate),
    },
    observations: normalizedPoints.length,
    sourceType: 'csv',
  }
}

export async function parsePerformanceFile(file: File) {
  const lowerName = file.name.toLowerCase()
  const isCsv = lowerName.endsWith('.csv')
  const isParquet =
    lowerName.endsWith('.parquet') || lowerName.endsWith('.pq')
  const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')

  if (!isCsv && !isParquet && !isXlsx) {
    throw new Error('仅支持 CSV / Parquet / XLSX 文件。')
  }

  const rows = isCsv
    ? parseCsvRows(await file.text())
    : isParquet
      ? await parseParquetRows(file)
      : await parseXlsxRows(file)

  if (rows.length === 0) {
    throw new Error('文件中没有可解析的数据行。')
  }

  const points = preparePoints(rows)
  const imported = buildPerformanceFromPoints(points)
  return {
    ...imported,
    sourceType: isParquet ? 'parquet' : isXlsx ? 'xlsx' : 'csv',
  } satisfies ImportedPerformanceData
}

