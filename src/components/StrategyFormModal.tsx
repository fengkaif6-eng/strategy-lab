import { useState, type FormEvent } from 'react'
import type {
  BacktestStrategyRecord,
  LiveStrategyRecord,
  StrategyChannel,
  StrategyRecord,
  StrategyStatus,
} from '../types/strategy'
import { safeParseNumber } from '../utils/format'

interface StrategyFormModalProps {
  channel: StrategyChannel
  editing?: StrategyRecord
  onClose: () => void
  onSubmit: (strategy: StrategyRecord) => void
}

interface StrategyFormState {
  name: string
  author: string
  tags: string
  summary: string
  status: StrategyStatus
  riskLevel: 'low' | 'medium' | 'high'
  description: string
  logic: string
  paramsText: string
  metricA: string
  metricB: string
  metricC: string
  metricD: string
  metricE: string
  metricF: string
}

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

function buildDefaultDetail() {
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

function toFormState(channel: StrategyChannel, strategy?: StrategyRecord): StrategyFormState {
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
      metricA: '',
      metricB: '',
      metricC: '',
      metricD: '',
      metricE: '',
      metricF: '',
    }
  }

  if (channel === 'backtest') {
    const backtest = strategy as BacktestStrategyRecord
    return {
      name: backtest.name,
      author: backtest.author,
      tags: backtest.tags.join(','),
      summary: backtest.summary,
      status: backtest.status,
      riskLevel: backtest.riskLevel,
      description: backtest.detail.description,
      logic: backtest.detail.logic,
      paramsText: Object.entries(backtest.detail.params)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join('\n'),
      metricA: String(backtest.metrics.annualReturn),
      metricB: String(backtest.metrics.sharpe),
      metricC: String(backtest.metrics.maxDrawdown),
      metricD: String(backtest.metrics.winRate),
      metricE: String(backtest.metrics.tradeCount),
      metricF: String(backtest.metrics.volatility),
    }
  }

  const live = strategy as LiveStrategyRecord
  return {
    name: live.name,
    author: live.author,
    tags: live.tags.join(','),
    summary: live.summary,
    status: live.status,
    riskLevel: live.riskLevel,
    description: live.detail.description,
    logic: live.detail.logic,
    paramsText: Object.entries(live.detail.params)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n'),
    metricA: String(live.metrics.totalReturn),
    metricB: String(live.metrics.alpha),
    metricC: String(live.metrics.maxDrawdown),
    metricD: String(live.metrics.runningDays),
    metricE: String(live.metrics.positionCount),
    metricF: String(live.metrics.monthlyWinRate),
  }
}

function buildId(channel: StrategyChannel) {
  const randomPart = Math.random().toString(36).slice(2, 7)
  return `${channel === 'backtest' ? 'bt' : 'lv'}-${randomPart}`
}

function metricLabels(channel: StrategyChannel) {
  if (channel === 'backtest') {
    return ['年化收益', '夏普比率', '最大回撤', '胜率', '交易次数', '波动率']
  }
  return ['累计收益', 'Alpha', '最大回撤', '运行天数', '持仓数量', '月胜率']
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
  const [form, setForm] = useState<StrategyFormState>(() =>
    toFormState(channel, editing),
  )
  const [error, setError] = useState('')

  const labels = metricLabels(channel)

  const updateField = (field: keyof StrategyFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.author.trim() || !form.summary.trim()) {
      setError('策略名称、作者、摘要为必填项')
      return
    }

    const detail = editing?.detail ?? buildDefaultDetail()
    const base = {
      id: editing?.id ?? buildId(channel),
      name: form.name.trim(),
      channel,
      author: form.author.trim(),
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      riskLevel: form.riskLevel,
      status: form.status,
      updatedAt: new Date().toISOString().slice(0, 10),
      summary: form.summary.trim(),
      detail: {
        ...detail,
        description: form.description.trim() || detail.description,
        logic: form.logic.trim() || detail.logic,
        params: {
          ...detail.params,
          ...parseParams(form.paramsText),
        },
        attachments: detail.attachments ?? [],
      },
    }

    if (channel === 'backtest') {
      const strategy: BacktestStrategyRecord = {
        ...base,
        channel: 'backtest',
        metrics: {
          annualReturn: safeParseNumber(form.metricA),
          sharpe: safeParseNumber(form.metricB),
          maxDrawdown: safeParseNumber(form.metricC),
          winRate: safeParseNumber(form.metricD),
          tradeCount: safeParseNumber(form.metricE),
          volatility: safeParseNumber(form.metricF),
        },
      }
      onSubmit(strategy)
    } else {
      const strategy: LiveStrategyRecord = {
        ...base,
        channel: 'live',
        metrics: {
          totalReturn: safeParseNumber(form.metricA),
          alpha: safeParseNumber(form.metricB),
          maxDrawdown: safeParseNumber(form.metricC),
          runningDays: safeParseNumber(form.metricD),
          positionCount: safeParseNumber(form.metricE),
          monthlyWinRate: safeParseNumber(form.metricF),
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
          <div className="metric-editor">
            {labels.map((label, index) => {
              const key = `metric${String.fromCharCode(65 + index)}` as keyof StrategyFormState
              return (
                <label key={label}>
                  {label}
                  <input
                    value={form[key]}
                    onChange={(event) => updateField(key, event.target.value)}
                    required
                  />
                </label>
              )
            })}
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
    </div>
  )
}
