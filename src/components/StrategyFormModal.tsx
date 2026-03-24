import { useEffect, useState, type FormEvent } from 'react'
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
    description: 'Please provide strategy description.',
    logic: 'Please provide strategy logic.',
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
    riskNotes: ['Please add main risk notes.'],
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
    return [
      'Annual Return',
      'Sharpe',
      'Max Drawdown',
      'Win Rate',
      'Trade Count',
      'Volatility',
    ]
  }
  return ['Total Return', 'Alpha', 'Max Drawdown', 'Running Days', 'Positions', 'Monthly Win Rate']
}

export function StrategyFormModal({
  channel,
  editing,
  onClose,
  onSubmit,
}: StrategyFormModalProps) {
  const [form, setForm] = useState<StrategyFormState>(() =>
    toFormState(channel, editing),
  )
  const [error, setError] = useState<string>('')

  useEffect(() => {
    setForm(toFormState(channel, editing))
  }, [channel, editing])

  const labels = metricLabels(channel)

  const updateField = (field: keyof StrategyFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.author.trim() || !form.summary.trim()) {
      setError('Name, author, and summary are required.')
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
        aria-label={editing ? 'Edit strategy' : 'Create strategy'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{editing ? 'Edit Strategy' : 'Create Strategy'}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            x
          </button>
        </header>
        <form className="strategy-form" onSubmit={submit}>
          <label>
            Strategy Name
            <input
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              required
            />
          </label>
          <label>
            Author
            <input
              value={form.author}
              onChange={(event) => updateField('author', event.target.value)}
              required
            />
          </label>
          <label>
            Tags (comma separated)
            <input
              value={form.tags}
              onChange={(event) => updateField('tags', event.target.value)}
              placeholder="trend,low-vol,index"
            />
          </label>
          <label>
            Summary
            <input
              value={form.summary}
              onChange={(event) => updateField('summary', event.target.value)}
              required
            />
          </label>
          <div className="form-inline">
            <label>
              Risk Level
              <select
                value={form.riskLevel}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    riskLevel: event.target.value as StrategyFormState['riskLevel'],
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as StrategyStatus,
                  }))
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
            />
          </label>
          <label>
            Logic
            <textarea
              rows={2}
              value={form.logic}
              onChange={(event) => updateField('logic', event.target.value)}
            />
          </label>
          <label>
            Params (each line: key:value)
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
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              {editing ? 'Save Changes' : 'Create Strategy'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
