import { useState, type ChangeEvent, type FormEvent } from 'react'
import type {
  BacktestStrategyRecord,
  LiveStrategyRecord,
  ThirdPartyStrategyRecord,
  StrategyChannel,
  StrategyDetail,
  StrategyRecord,
  StrategyStatus,
} from '../types/strategy'
import { formatDateInputDisplay, sanitizeDateInput } from '../utils/dateInput'
import { safeParseNumber } from '../utils/format'
import {
  MISSING_NAV_COLUMN_ERROR,
  parsePerformanceFile,
  type ImportedPerformanceData,
} from '../utils/performanceImport'
import { inspectBpFile, type BpFileInspection } from '../utils/bpFileSchema'
import { importBpPerformanceFiles } from '../services/performanceImportApi'
import { getUnifiedStrategyMetrics } from '../utils/strategyMetrics'

interface StrategyFormModalProps {
  channel: StrategyChannel
  editing?: StrategyRecord
  onClose: () => void
  onSubmit: (strategy: StrategyRecord) => void
}

interface StrategyMetricFormFields {
  annualReturn: string
  sharpe: string
  winRate: string
  tradeCount: string
  maxDrawdown: string
  volatility: string
  runningDays: string
  totalReturn: string
  startDate: string
  bpCumulativeReturn: string
  bpMaxDrawdown: string
}

interface StrategyFormState extends StrategyMetricFormFields {
  name: string
  author: string
  tags: string
  summary: string
  status: StrategyStatus
  riskLevel: 'low' | 'medium' | 'high'
  description: string
  logic: string
  paramsText: string
}

type PerformanceImportMode = 'standard' | 'bp'

interface BpImportFormState {
  signalDateCol: string
  signalCol: string
  yieldDateCol: string
  yieldCol: string
  signalName: string
  feeBpsPerSide: string
  stopLossBp: string
  executionDelayBars: string
  externalStopCol: string
}

interface BpFileInspectionState {
  signal: BpFileInspection | null
  yield: BpFileInspection | null
}

const standardMetricFieldConfigs: Array<{
  key: keyof StrategyMetricFormFields
  label: string
  type: 'number' | 'text'
  step?: string
  placeholder?: string
}> = [
  { key: 'annualReturn', label: '年化收益率', type: 'number', step: '0.0001', placeholder: '0.15' },
  { key: 'sharpe', label: '夏普比率', type: 'number', step: '0.01', placeholder: '1.20' },
  { key: 'winRate', label: '总胜率', type: 'number', step: '0.0001', placeholder: '0.60' },
  { key: 'tradeCount', label: '交易次数', type: 'number', step: '1', placeholder: '120' },
  { key: 'maxDrawdown', label: '最大回撤', type: 'number', step: '0.0001', placeholder: '-0.10' },
  { key: 'volatility', label: '波动率', type: 'number', step: '0.0001', placeholder: '0.18' },
  { key: 'runningDays', label: '运行天数', type: 'number', step: '1', placeholder: '180' },
  { key: 'totalReturn', label: '累计收益率', type: 'number', step: '0.0001', placeholder: '0.24' },
  { key: 'startDate', label: '起始日期', type: 'text', placeholder: 'yyyy/mm/dd' },
]

const bpMetricFieldConfigs: Array<{
  key: keyof StrategyMetricFormFields
  label: string
  type: 'number' | 'text'
  step?: string
  placeholder?: string
}> = [
  { key: 'bpCumulativeReturn', label: '累计收益（bp）', type: 'number', step: '0.01', placeholder: '24.00' },
  { key: 'winRate', label: '总胜率', type: 'number', step: '0.0001', placeholder: '0.60' },
  { key: 'bpMaxDrawdown', label: '最大回撤（bp）', type: 'number', step: '0.01', placeholder: '-12.50' },
  { key: 'volatility', label: '波动率', type: 'number', step: '0.0001', placeholder: '0.18' },
  { key: 'runningDays', label: '运行天数', type: 'number', step: '1', placeholder: '180' },
  { key: 'startDate', label: '起始日期', type: 'text', placeholder: 'yyyy/mm/dd' },
]

const defaultMonthlyReturns = [
  0.012, 0.008, 0.015, -0.006, 0.013, 0.01, -0.004, 0.012, 0.011, 0.009, 0.007,
  0.01,
]

const defaultDates = [
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

const defaultBpImportFormState: BpImportFormState = {
  signalDateCol: '',
  signalCol: 'signal',
  yieldDateCol: 'date',
  yieldCol: '',
  signalName: 'signal',
  feeBpsPerSide: '0',
  stopLossBp: '',
  executionDelayBars: '1',
  externalStopCol: '',
}

const performanceGuideSections = [
  {
    title: '标准净值导入',
    items: [
      '支持单个文件：CSV / XLSX / XLS / Parquet。',
      '必填字段至少需要 `nav` / `net_value` / `净值` 之一。',
      '可识别日期字段：`date`、`datetime`、`timestamp`、`交易日`、`日期`、`时间` 等。',
      '可选字段：`return`、`drawdown`、`trade_count`、`position_count`、`alpha`、`win_rate`。',
      '表头匹配会忽略大小写、空格、下划线、连字符和斜杠；Excel 默认读取第一张工作表。',
    ],
  },
  {
    title: 'BP 信号导入',
    items: [
      '支持两份文件：信号文件和收益率文件，二者都支持 CSV / XLSX。',
      '信号文件至少需要日期列和 `signal` 列；日期列默认取首列。',
      '`signal` 当前只接受 `-1` 与 `1`，其中 `1` 表示持有，`-1` 按空仓/平仓处理。',
      '收益率文件至少需要 `date` 与 `yield` 两列；两份文件都会按日期对齐后计算。',
      '若收益率文件是一张多期限曲线表，系统会识别可用收益率列，但不会自动猜具体期限；请手动选择实际要回测的期限列。',
      '可选参数：信号名称、单边费率（bp）、止损阈值（bp）、执行延迟 `N`、外部止损列。',
      '执行延迟 `N` 表示按 T+N 日收盘成交：`0` 为 T 日成交，`1` 为 T+1 日成交，`2` 为 T+2 日成交，以此类推。',
      '外部止损列只允许 `0/1`：`0` 表示当天不触发外部止损；`1` 表示当天强制触发止损，单日收益截断为 `-stop_loss_bp`，并把持仓打回 0。',
      '若使用外部止损列，建议同时填写止损阈值（bp）；同一文件内日期必须唯一，重复日期会报错。',
    ],
  },
  {
    title: '计算与回填规则',
    items: [
      'BP 口径使用 `daily_bp = position * (-delta_yield_bp) - trade_fee_bp`。',
      '净值按 `nav = 1 + cumulative_bp / 10000` 生成，属于非复利口径。',
      'BP 模式会回填 6 项指标：累计收益（bp）、总胜率、最大回撤（bp）、波动率、运行天数、起始日期。',
      'BP 模式还支持导出 `bp_metrics_summary.csv`、`bp_metrics_daily.csv`、`bp_metrics_diagnostics.csv` 三个结果文件。',
      '同时会刷新收益曲线、回撤曲线和月度收益，用于策略详情页展示。',
    ],
  },
] as const

function buildDefaultDetail(): StrategyDetail {
  return {
    description: '请补充策略说明。',
    logic: '请补充策略逻辑。',
    params: {
      rebalanceFreq: 'weekly',
    },
    equityCurve: defaultDates.map((date, index) => ({
      date,
      value: 1 + index * 0.01,
    })),
    drawdownCurve: defaultDates.map((date, index) => ({
      date,
      value: index === 0 ? 0 : -0.004 * (index % 4),
    })),
    monthlyReturns: defaultDates.map((month, index) => ({
      month,
      return: defaultMonthlyReturns[index],
    })),
    riskNotes: ['请补充主要风险提示。'],
    attachments: [],
  }
}

function parseParams(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const params: Record<string, string> = {}

  for (const line of lines) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex > 0) {
      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()
      params[key] = value
    }
  }

  return params
}

function normalizeDateFieldValue(value: string | null | undefined): string {
  const raw = value?.trim() ?? ''
  if (!raw) {
    return ''
  }

  const normalized = raw.replace(/\//g, '-')
  if (/^\d{4}-\d{1,2}$/.test(normalized)) {
    const [year, month] = normalized.split('-')
    return `${year}-${month.padStart(2, '0')}-01`
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

function formatDecimal(value: number | null, digits = 6) {
  if (value === null || !Number.isFinite(value)) {
    return ''
  }
  return String(Number(value.toFixed(digits)))
}

function formatInteger(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return ''
  }
  return String(Math.max(0, Math.round(value)))
}

function isImplicitBpFirstColumn(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return false
  }
  return /^Unnamed:\s*0$/i.test(trimmed) || /^column_?0$/i.test(trimmed)
}

function formatBpYieldColumnLabel(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }
  const [rawPrefix, rawTenor] = trimmed.split(':')
  const tenor = rawTenor?.trim()
  const prefix = rawPrefix?.trim() ?? trimmed

  const normalizedPrefix = prefix
    .replace(/^中债/u, '')
    .replace(/收益率曲线/gu, '')
    .replace(/无固定期限资本债/gu, '永续债')
    .replace(/\(行权\)/gu, '')
    .replace(/\(([^)]+)\)/u, ' $1')
    .replace(/\s+/gu, ' ')
    .trim()

  if (tenor) {
    if (normalizedPrefix) {
      return `${normalizedPrefix} · ${tenor}`
    }
    return tenor
  }

  if (normalizedPrefix.length > 26) {
    return `${normalizedPrefix.slice(0, 23)}...`
  }
  return normalizedPrefix
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function getStrategyPerformanceMode(strategy?: StrategyRecord): PerformanceImportMode {
  const metrics = strategy?.metrics as unknown as Record<string, unknown> | undefined
  return metrics?.performanceMode === 'bp' ||
    typeof metrics?.cumulativeReturnBp === 'number' ||
    typeof metrics?.maxDrawdownBp === 'number'
    ? 'bp'
    : 'standard'
}

function isBpMetricMode(
  importedPerformance: ImportedPerformanceData | null,
  editing?: StrategyRecord,
  performanceImportMode?: PerformanceImportMode,
) {
  if (importedPerformance?.metrics.performanceMode === 'bp') {
    return true
  }
  if (getStrategyPerformanceMode(editing) === 'bp') {
    return true
  }
  return performanceImportMode === 'bp'
}

function toFormState(strategy?: StrategyRecord): StrategyFormState {
  if (!strategy) {
    return {
      name: '',
      author: '',
      tags: '',
      summary: '',
      status: 'active',
      riskLevel: 'medium',
      description: '',
      logic: '',
      paramsText: 'rebalanceFreq: weekly',
      annualReturn: '',
      sharpe: '',
      winRate: '',
      tradeCount: '',
      maxDrawdown: '',
      volatility: '',
      runningDays: '',
      totalReturn: '',
      startDate: '',
      bpCumulativeReturn: '',
      bpMaxDrawdown: '',
    }
  }

  const unified = getUnifiedStrategyMetrics(strategy)
  const metrics = strategy.metrics as unknown as Record<string, unknown>
  const bpCumulativeReturn =
    typeof metrics.cumulativeReturnBp === 'number' && Number.isFinite(metrics.cumulativeReturnBp)
      ? metrics.cumulativeReturnBp
      : null
  const bpMaxDrawdown =
    typeof metrics.maxDrawdownBp === 'number' && Number.isFinite(metrics.maxDrawdownBp)
      ? metrics.maxDrawdownBp
      : null

  return {
    name: strategy.name,
    author: strategy.author,
    tags: strategy.tags.join(','),
    summary: strategy.summary,
    status: strategy.status,
    riskLevel: strategy.riskLevel,
    description: strategy.detail.description,
    logic: strategy.detail.logic,
    paramsText: Object.entries(strategy.detail.params)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n'),
    annualReturn: formatDecimal(unified.annualReturn),
    sharpe: formatDecimal(unified.sharpe),
    winRate: formatDecimal(unified.winRate),
    tradeCount: formatInteger(unified.tradeCount),
    maxDrawdown: formatDecimal(unified.maxDrawdown),
    volatility: formatDecimal(unified.volatility),
    runningDays: formatInteger(unified.runningDays),
    totalReturn: formatDecimal(unified.totalReturn),
    startDate: formatDateInputDisplay(normalizeDateFieldValue(unified.startDate)),
    bpCumulativeReturn: formatDecimal(bpCumulativeReturn, 2),
    bpMaxDrawdown: formatDecimal(bpMaxDrawdown, 2),
  }
}

function buildId(channel: StrategyChannel) {
  const randomPart = Math.random().toString(36).slice(2, 7)
  if (channel === 'backtest') {
    return `bt-${randomPart}`
  }
  if (channel === 'live') {
    return `lv-${randomPart}`
  }
  return `tp-${randomPart}`
}

function applyImportedMetrics(
  data: ImportedPerformanceData,
  previous: StrategyFormState,
): StrategyFormState {
  return {
    ...previous,
    annualReturn: formatDecimal(data.metrics.annualReturn),
    sharpe: formatDecimal(data.metrics.sharpe),
    winRate: formatDecimal(data.metrics.winRate),
    tradeCount: formatInteger(data.metrics.tradeCount),
    maxDrawdown: formatDecimal(data.metrics.maxDrawdown),
    volatility: formatDecimal(data.metrics.volatility),
    runningDays: formatInteger(data.metrics.runningDays),
    totalReturn: formatDecimal(data.metrics.totalReturn),
    startDate: formatDateInputDisplay(normalizeDateFieldValue(data.metrics.startDate)) || previous.startDate,
    bpCumulativeReturn:
      data.metrics.performanceMode === 'bp'
        ? formatDecimal(data.metrics.cumulativeReturnBp ?? null, 2)
        : previous.bpCumulativeReturn,
    bpMaxDrawdown:
      data.metrics.performanceMode === 'bp'
        ? formatDecimal(data.metrics.maxDrawdownBp ?? null, 2)
        : previous.bpMaxDrawdown,
  }
}

const riskLevelOptions = [
  { value: 'low', label: '低风险' },
  { value: 'medium', label: '中风险' },
  { value: 'high', label: '高风险' },
] as const

const statusOptions = [
  { value: 'active', label: '运行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'archived', label: '已归档' },
] as const

export function StrategyFormModal({
  channel,
  editing,
  onClose,
  onSubmit,
}: StrategyFormModalProps) {
  const [form, setForm] = useState<StrategyFormState>(() => toFormState(editing))
  const [error, setError] = useState('')
  const [performanceImportMode, setPerformanceImportMode] =
    useState<PerformanceImportMode>(() => getStrategyPerformanceMode(editing))
  const [showImportGuide, setShowImportGuide] = useState(false)
  const [performanceFile, setPerformanceFile] = useState<File | null>(null)
  const [bpSignalFile, setBpSignalFile] = useState<File | null>(null)
  const [bpYieldFile, setBpYieldFile] = useState<File | null>(null)
  const [bpImportForm, setBpImportForm] = useState<BpImportFormState>(
    defaultBpImportFormState,
  )
  const [bpFileInspection, setBpFileInspection] = useState<BpFileInspectionState>({
    signal: null,
    yield: null,
  })
  const [isImporting, setIsImporting] = useState(false)
  const [importFeedback, setImportFeedback] = useState('')
  const [importedPerformance, setImportedPerformance] = useState<ImportedPerformanceData | null>(null)
  const bpMetricMode = isBpMetricMode(importedPerformance, editing, performanceImportMode)
  const metricFieldConfigs = bpMetricMode ? bpMetricFieldConfigs : standardMetricFieldConfigs

  const updateField = (field: keyof StrategyFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const updateMetricField = (field: keyof StrategyMetricFormFields, value: string) => {
    if (field === 'startDate') {
      setForm((prev) => ({ ...prev, [field]: sanitizeDateInput(value) }))
      return
    }
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleStandardFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setPerformanceFile(file)
    setImportFeedback('')
    setError('')
  }

  const handleBpFileChange =
    (field: 'signal' | 'yield') => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null
      if (field === 'signal') {
        setBpSignalFile(file)
      } else {
        setBpYieldFile(file)
      }
      setImportFeedback('')
      setError('')

      if (!file) {
        setBpFileInspection((prev) => ({ ...prev, [field]: null }))
        return
      }

      void inspectBpFile(file, field)
        .then((inspection) => {
          setBpFileInspection((prev) => ({ ...prev, [field]: inspection }))
          setBpImportForm((prev) => {
            if (field === 'signal') {
              return {
                ...prev,
                signalDateCol:
                  prev.signalDateCol && !isImplicitBpFirstColumn(prev.signalDateCol)
                    ? prev.signalDateCol
                    : inspection.suggestedDateColumn || '',
                signalCol: inspection.suggestedValueColumn || prev.signalCol,
                externalStopCol:
                  prev.externalStopCol || inspection.suggestedExternalStopColumn || '',
              }
            }
            return {
              ...prev,
              yieldDateCol:
                prev.yieldDateCol && !isImplicitBpFirstColumn(prev.yieldDateCol)
                  ? prev.yieldDateCol
                  : inspection.suggestedDateColumn || '',
              yieldCol:
                inspection.suggestedValueColumn ??
                (inspection.requiresExplicitValueColumnSelection ? '' : prev.yieldCol),
            }
          })
        })
        .catch(() => {
          setBpFileInspection((prev) => ({ ...prev, [field]: null }))
        })
    }

  const updateBpImportField = (field: keyof BpImportFormState, value: string) => {
    setBpImportForm((prev) => ({ ...prev, [field]: value }))
  }

  const downloadBpExport = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const importPerformanceFile = async () => {
    if (performanceImportMode === 'standard' && !performanceFile) {
      setError('请先选择 CSV、XLSX 或 Parquet 文件。')
      return
    }
    if (performanceImportMode === 'bp' && (!bpSignalFile || !bpYieldFile)) {
      setError('BP 模式需要同时选择信号文件和收益率文件。')
      return
    }
    if (performanceImportMode === 'bp' && !bpImportForm.yieldCol.trim()) {
      setError(
        bpFileInspection.yield?.requiresExplicitValueColumnSelection
          ? '检测到收益率文件包含多个期限列，请先明确选择要回测的收益率列，例如 5年。'
          : 'BP 模式中的收益率列不能为空。',
      )
      return
    }
    if (
      performanceImportMode === 'bp' &&
      !Number.isFinite(Number(bpImportForm.feeBpsPerSide))
    ) {
      setError('BP 模式中的单边费率必须是数字。')
      return
    }
    if (
      performanceImportMode === 'bp' &&
      bpImportForm.stopLossBp.trim().length > 0 &&
      !Number.isFinite(Number(bpImportForm.stopLossBp))
    ) {
      setError('BP 模式中的止损阈值必须是数字。')
      return
    }
    if (
      performanceImportMode === 'bp' &&
      (!Number.isInteger(Number(bpImportForm.executionDelayBars)) ||
        Number(bpImportForm.executionDelayBars) < 0)
    ) {
      setError('执行延迟必须是大于等于 0 的整数。')
      return
    }

    setError('')
    setImportFeedback('')
    setIsImporting(true)

    try {
      const imported =
        performanceImportMode === 'standard'
          ? await parsePerformanceFile(performanceFile as File)
          : await importBpPerformanceFiles({
              signalFile: bpSignalFile as File,
              yieldFile: bpYieldFile as File,
              signalDateCol: bpImportForm.signalDateCol,
              signalCol: bpImportForm.signalCol,
              yieldDateCol: bpImportForm.yieldDateCol,
              yieldCol: bpImportForm.yieldCol,
              signalName: bpImportForm.signalName,
              feeBpsPerSide: Number(bpImportForm.feeBpsPerSide),
              stopLossBp: bpImportForm.stopLossBp.trim()
                ? Number(bpImportForm.stopLossBp)
                : null,
              executionDelayBars: Number(bpImportForm.executionDelayBars),
              externalStopCol: bpImportForm.externalStopCol,
            })
      setImportedPerformance(imported)
      setForm((prev) => applyImportedMetrics(imported, prev))
      setImportFeedback(
        performanceImportMode === 'standard'
          ? `已从 ${imported.sourceType.toUpperCase()} 导入 ${imported.observations} 条记录，并回填9项统一指标。`
          : `已按 BP 模式计算 ${imported.observations} 条记录，并回填7项 BP 指标。`,
      )
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : '导入失败，请检查文件结构和字段。'
      if (
        performanceImportMode === 'standard' &&
        message.includes(MISSING_NAV_COLUMN_ERROR)
      ) {
        window.alert(MISSING_NAV_COLUMN_ERROR)
      }
      setImportedPerformance(null)
      setError(message)
    } finally {
      setIsImporting(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.author.trim() || !form.summary.trim()) {
      setError('策略名称、作者、摘要为必填项。')
      return
    }

    const normalizedStartDate = normalizeDateFieldValue(form.startDate)
    if (!normalizedStartDate) {
      setError('起始日期格式不正确，请选择有效日期。')
      return
    }

    const detail = editing?.detail ?? buildDefaultDetail()
    const detailWithImport = importedPerformance
      ? {
          ...detail,
          equityCurve: importedPerformance.equityCurve,
          drawdownCurve: importedPerformance.drawdownCurve,
          monthlyReturns: importedPerformance.monthlyReturns,
        }
      : detail

    const parsedAnnualReturn = safeParseNumber(form.annualReturn)
    const parsedSharpe = safeParseNumber(form.sharpe)
    const parsedWinRate = parseOptionalNumber(form.winRate)
    const parsedTradeCount = Math.max(0, Math.round(safeParseNumber(form.tradeCount)))
    const parsedMaxDrawdown = safeParseNumber(form.maxDrawdown)
    const parsedVolatility = safeParseNumber(form.volatility)
    const parsedRunningDays = Math.max(
      1,
      Math.round(safeParseNumber(form.runningDays, detailWithImport.equityCurve.length)),
    )
    const parsedTotalReturn = safeParseNumber(form.totalReturn)
    const parsedBpCumulativeReturn = safeParseNumber(form.bpCumulativeReturn)
    const parsedBpMaxDrawdown = safeParseNumber(form.bpMaxDrawdown)

    const base = {
      id: editing?.id ?? buildId(channel),
      name: form.name.trim(),
      channel,
      author: form.author.trim(),
      showOnHome: editing?.showOnHome ?? false,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      riskLevel: form.riskLevel,
      status: form.status,
      updatedAt: new Date().toISOString().slice(0, 10),
      summary: form.summary.trim(),
      detail: {
        ...detailWithImport,
        description: form.description.trim() || detailWithImport.description,
        logic: form.logic.trim() || detailWithImport.logic,
        params: {
          ...detailWithImport.params,
          ...parseParams(form.paramsText),
        },
        attachments: detailWithImport.attachments ?? [],
      },
    }

    if (channel === 'live') {
      const currentLive = editing?.channel === 'live' ? editing : undefined

      const strategy: LiveStrategyRecord = {
        ...base,
        channel: 'live',
        metrics: {
          totalReturn: parsedTotalReturn,
          alpha: currentLive?.metrics.alpha ?? 0,
          maxDrawdown: parsedMaxDrawdown,
          runningDays: parsedRunningDays,
          startDate: normalizedStartDate,
          positionCount: currentLive?.metrics.positionCount ?? parsedTradeCount,
          monthlyWinRate: parsedWinRate ?? undefined,
          annualReturn: parsedAnnualReturn,
          sharpe: parsedSharpe,
          winRate: parsedWinRate ?? undefined,
          tradeCount: parsedTradeCount,
          volatility: parsedVolatility,
          performanceMode: bpMetricMode ? 'bp' : undefined,
          cumulativeReturnBp: bpMetricMode ? parsedBpCumulativeReturn : undefined,
          maxDrawdownBp: bpMetricMode ? parsedBpMaxDrawdown : undefined,
        },
      }
      onSubmit(strategy)
    } else {
      const strategy: BacktestStrategyRecord | ThirdPartyStrategyRecord = {
        ...base,
        channel,
        metrics: {
          annualReturn: parsedAnnualReturn,
          sharpe: parsedSharpe,
          maxDrawdown: parsedMaxDrawdown,
          winRate: parsedWinRate ?? undefined,
          tradeCount: parsedTradeCount,
          volatility: parsedVolatility,
          runningDays: parsedRunningDays,
          totalReturn: parsedTotalReturn,
          startDate: normalizedStartDate,
          performanceMode: bpMetricMode ? 'bp' : undefined,
          cumulativeReturnBp: bpMetricMode ? parsedBpCumulativeReturn : undefined,
          maxDrawdownBp: bpMetricMode ? parsedBpMaxDrawdown : undefined,
        },
      }
      onSubmit(strategy)
    }

    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '编辑策略' : '新增策略'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{editing ? '编辑策略' : '新增策略'}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <form className="strategy-form" onSubmit={submit}>
          <label>
            策略名称
            <input
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              required
            />
          </label>
          <label>
            作者
            <input
              value={form.author}
              onChange={(event) => updateField('author', event.target.value)}
              required
            />
          </label>
          <label>
            标签（逗号分隔）
            <input
              value={form.tags}
              onChange={(event) => updateField('tags', event.target.value)}
              placeholder="趋势,低波,指数增强"
            />
          </label>
          <label>
            摘要
            <input
              value={form.summary}
              onChange={(event) => updateField('summary', event.target.value)}
              required
            />
          </label>
          <div className="form-inline">
            <label>
              风险等级
              <select
                value={form.riskLevel}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    riskLevel: event.target.value as StrategyFormState['riskLevel'],
                  }))
                }
              >
                {riskLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              状态
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as StrategyStatus,
                  }))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            策略说明
            <textarea
              rows={2}
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
            />
          </label>
          <label>
            核心逻辑
            <textarea
              rows={2}
              value={form.logic}
              onChange={(event) => updateField('logic', event.target.value)}
            />
          </label>
          <label>
            参数（每行 key:value）
            <textarea
              rows={3}
              value={form.paramsText}
              onChange={(event) => updateField('paramsText', event.target.value)}
            />
          </label>

          <div className="performance-import">
            <div className="performance-import-header">
              <div>
                <p className="performance-import-title">业绩文件导入</p>
                <p className="performance-import-hint">
                  支持标准净值文件与 BP 信号文件，导入后自动回填统一 9 项指标。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary performance-import-doc-btn"
                onClick={() => setShowImportGuide(true)}
              >
                文件说明
              </button>
            </div>

            <div className="performance-import-mode-switch" role="tablist" aria-label="业绩导入模式">
              <button
                type="button"
                role="tab"
                aria-selected={performanceImportMode === 'standard'}
                className={performanceImportMode === 'standard' ? 'tab-active' : ''}
                onClick={() => {
                  setPerformanceImportMode('standard')
                  setImportFeedback('')
                  setError('')
                }}
              >
                标准净值文件
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={performanceImportMode === 'bp'}
                className={performanceImportMode === 'bp' ? 'tab-active' : ''}
                onClick={() => {
                  setPerformanceImportMode('bp')
                  setImportFeedback('')
                  setError('')
                }}
              >
                BP 信号文件
              </button>
            </div>

            {performanceImportMode === 'standard' ? (
              <>
                <div className="performance-import-row">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.parquet,.pq,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/octet-stream"
                    onChange={handleStandardFileChange}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      void importPerformanceFile()
                    }}
                    disabled={isImporting}
                  >
                    {isImporting ? '解析中...' : '导入并回填'}
                  </button>
                </div>
                <p className="performance-import-tip">
                  建议字段：`date/日期`、`nav/net_value/净值`、`return/收益率`、`drawdown/max_drawdown/最大回撤`、`trade_count/交易次数`、`position_count/持仓数`、`alpha/超额收益`、`win_rate/总胜率`。
                </p>
              </>
            ) : (
              <>
                <div className="performance-import-grid">
                  <label>
                    信号文件（CSV / XLSX）
                    <input
                      type="file"
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleBpFileChange('signal')}
                    />
                  </label>
                  <label>
                    收益率文件（CSV / XLSX）
                    <input
                      type="file"
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleBpFileChange('yield')}
                    />
                  </label>
                </div>

                <div className="performance-import-config-grid">
                  <label>
                    信号日期列
                    <input
                      list="bp-signal-date-columns"
                      value={bpImportForm.signalDateCol}
                      onChange={(event) =>
                        updateBpImportField('signalDateCol', event.target.value)
                      }
                      placeholder="留空则取首列"
                    />
                    <datalist id="bp-signal-date-columns">
                      {(bpFileInspection.signal?.dateColumns ?? []).map((column) => (
                        <option key={column} value={column} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    信号列
                    {bpFileInspection.signal?.candidateValueColumns?.length ? (
                      <select
                        value={bpImportForm.signalCol}
                        onChange={(event) =>
                          updateBpImportField('signalCol', event.target.value)
                        }
                      >
                        {bpFileInspection.signal.candidateValueColumns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={bpImportForm.signalCol}
                        onChange={(event) =>
                          updateBpImportField('signalCol', event.target.value)
                        }
                        placeholder="signal"
                      />
                    )}
                  </label>
                  <label>
                    收益率日期列
                    <input
                      list="bp-yield-date-columns"
                      value={bpImportForm.yieldDateCol}
                      onChange={(event) =>
                        updateBpImportField('yieldDateCol', event.target.value)
                      }
                      placeholder="date"
                    />
                    <datalist id="bp-yield-date-columns">
                      {(bpFileInspection.yield?.dateColumns ?? []).map((column) => (
                        <option key={column} value={column} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    收益率列
                    {bpFileInspection.yield?.candidateValueColumns?.length ? (
                      <>
                        <select
                          className="performance-import-column-select"
                          value={bpImportForm.yieldCol}
                          title={bpImportForm.yieldCol}
                          onChange={(event) =>
                            updateBpImportField('yieldCol', event.target.value)
                          }
                        >
                          {bpFileInspection.yield.requiresExplicitValueColumnSelection ? (
                            <option value="">请选择期限列</option>
                          ) : null}
                          {bpFileInspection.yield.candidateValueColumns.map((column) => (
                            <option key={column} value={column} title={column}>
                              {formatBpYieldColumnLabel(column)}
                            </option>
                          ))}
                        </select>
                        {bpFileInspection.yield.requiresExplicitValueColumnSelection ? (
                          <span className="performance-import-inline-hint">
                            该收益率文件包含多个期限列，请手动选择，例如 `5年`。
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <input
                        value={bpImportForm.yieldCol}
                        onChange={(event) =>
                          updateBpImportField('yieldCol', event.target.value)
                        }
                        placeholder="yield"
                      />
                    )}
                  </label>
                  <label>
                    信号名称
                    <input
                      value={bpImportForm.signalName}
                      onChange={(event) =>
                        updateBpImportField('signalName', event.target.value)
                      }
                      placeholder="signal"
                    />
                  </label>
                  <label>
                    单边费率（bp）
                    <input
                      type="number"
                      step="0.01"
                      value={bpImportForm.feeBpsPerSide}
                      onChange={(event) =>
                        updateBpImportField('feeBpsPerSide', event.target.value)
                      }
                      placeholder="0"
                    />
                  </label>
                  <label>
                    止损阈值（bp，可选）
                    <input
                      type="number"
                      step="0.01"
                      value={bpImportForm.stopLossBp}
                      onChange={(event) =>
                        updateBpImportField('stopLossBp', event.target.value)
                      }
                      placeholder="例如 2"
                    />
                  </label>
                  <label>
                    执行延迟 N
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={bpImportForm.executionDelayBars}
                      onChange={(event) =>
                        updateBpImportField(
                          'executionDelayBars',
                          event.target.value,
                        )
                      }
                      placeholder="1"
                    />
                  </label>
                  <label>
                    外部止损列（可选）
                    <input
                      list="bp-external-stop-columns"
                      value={bpImportForm.externalStopCol}
                      onChange={(event) =>
                        updateBpImportField('externalStopCol', event.target.value)
                      }
                      placeholder="0/1 列名"
                    />
                    <datalist id="bp-external-stop-columns">
                      {(bpFileInspection.signal?.columns ?? []).map((column) => (
                        <option key={column} value={column} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <div className="performance-import-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      void importPerformanceFile()
                    }}
                    disabled={isImporting}
                  >
                    {isImporting ? '计算中...' : '计算并回填'}
                  </button>
                </div>
                <p className="performance-import-tip">
                  BP 模式会调用后端 `bp_toolkit` 计算累计收益（bp）、最大回撤（bp）、胜率等结果，并同步生成收益曲线与回撤曲线。执行延迟按 T+N 日收盘成交；外部止损列中 `1` 表示当天强制止损，`0` 表示不触发。
                </p>
                {bpFileInspection.signal || bpFileInspection.yield ? (
                  <div className="performance-import-tip">
                    {bpFileInspection.signal ? (
                      <p>
                        信号文件：{bpFileInspection.signal.headerRowLabel}，已识别
                        {` ${bpFileInspection.signal.columns.length} `}
                        个字段。
                      </p>
                    ) : null}
                    {bpFileInspection.yield ? (
                      <p>
                        收益率文件：{bpFileInspection.yield.headerRowLabel}，当前可选收益率列
                        {` ${bpFileInspection.yield.candidateValueColumns.length} `}
                        个。
                        {bpFileInspection.yield.requiresExplicitValueColumnSelection
                          ? ' 检测到多期限曲线，请手动选择要回测的期限列。'
                          : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            {importFeedback ? (
              <p className="form-success" role="status">
                {importFeedback}
              </p>
            ) : null}
            {performanceImportMode === 'bp' && importedPerformance?.bpExports?.length ? (
              <div className="performance-import-row">
                {importedPerformance.bpExports.map((item) => (
                  <button
                    key={item.filename}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => downloadBpExport(item.filename, item.content)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="metric-editor">
            {metricFieldConfigs.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  type={field.type}
                  step={field.step}
                  value={form[field.key]}
                  onChange={(event) => updateMetricField(field.key, event.target.value)}
                  onBlur={
                    field.key === 'startDate'
                      ? (event) =>
                          updateMetricField('startDate', formatDateInputDisplay(event.target.value))
                      : undefined
                  }
                  inputMode={field.key === 'startDate' ? 'numeric' : undefined}
                  maxLength={field.key === 'startDate' ? 10 : undefined}
                  placeholder={field.placeholder}
                  required={field.key !== 'winRate'}
                />
              </label>
            ))}
          </div>

          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" type="submit">
              {editing ? '保存修改' : '新增策略'}
            </button>
          </div>
        </form>
      </section>
      {showImportGuide ? (
        <div
          className="modal-backdrop performance-guide-backdrop"
          role="presentation"
          onClick={() => setShowImportGuide(false)}
        >
          <section
            className="modal-panel performance-guide-modal"
            role="dialog"
            aria-modal="true"
            aria-label="业绩文件说明"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <h2>文件说明</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setShowImportGuide(false)}
                aria-label="关闭文件说明"
              >
                ×
              </button>
            </header>
            <div className="performance-guide-body">
              {performanceGuideSections.map((section) => (
                <section key={section.title} className="performance-guide-section">
                  <h3>{section.title}</h3>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
