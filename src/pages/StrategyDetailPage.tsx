import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MetricChip } from '../components/MetricChip'
import { useAuth } from '../context/AuthContext'
import { useStrategies } from '../context/StrategyContext'
import type { StrategyAttachment, StrategyChannel } from '../types/strategy'
import { formatDate, formatPercent, formatSigned } from '../utils/format'

interface AttachmentFormState {
  title: string
  url: string
  note: string
}

const initialAttachmentForm: AttachmentFormState = {
  title: '',
  url: '',
  note: '',
}

function isChannel(value: string | undefined): value is StrategyChannel {
  return value === 'backtest' || value === 'live'
}

function plazaPath(channel: StrategyChannel) {
  return channel === 'backtest' ? '/incubation-strategies' : '/published-strategies'
}

export function StrategyDetailPage() {
  const { channel, id } = useParams()
  const { findStrategy, upsertStrategy } = useStrategies()
  const { role, user } = useAuth()
  const [attachmentForm, setAttachmentForm] = useState(initialAttachmentForm)
  const [attachmentError, setAttachmentError] = useState('')

  if (!isChannel(channel) || !id) {
    return (
      <section className="empty-panel">
        <h1>无效的策略地址</h1>
        <Link className="btn btn-primary" to="/incubation-strategies">
          返回孵化策略
        </Link>
      </section>
    )
  }

  const strategy = findStrategy(channel, id)

  if (!strategy) {
    return (
      <section className="empty-panel">
        <h1>策略不存在或已删除</h1>
        <Link className="btn btn-primary" to={plazaPath(channel)}>
          返回策略列表
        </Link>
      </section>
    )
  }

  const metrics =
    strategy.channel === 'backtest'
      ? [
          {
            label: '年化收益',
            value: formatPercent(strategy.metrics.annualReturn),
            rawValue: strategy.metrics.annualReturn,
          },
          {
            label: '夏普比率',
            value: formatSigned(strategy.metrics.sharpe),
          },
          {
            label: '最大回撤',
            value: formatPercent(strategy.metrics.maxDrawdown),
            rawValue: strategy.metrics.maxDrawdown,
          },
          {
            label: '胜率',
            value: formatPercent(strategy.metrics.winRate),
            rawValue: strategy.metrics.winRate - 0.5,
          },
          {
            label: '交易次数',
            value: String(strategy.metrics.tradeCount),
          },
          {
            label: '波动率',
            value: formatPercent(strategy.metrics.volatility),
            rawValue: -strategy.metrics.volatility,
          },
        ]
      : [
          {
            label: '累计收益',
            value: formatPercent(strategy.metrics.totalReturn),
            rawValue: strategy.metrics.totalReturn,
          },
          {
            label: 'Alpha',
            value: formatPercent(strategy.metrics.alpha),
            rawValue: strategy.metrics.alpha,
          },
          {
            label: '最大回撤',
            value: formatPercent(strategy.metrics.maxDrawdown),
            rawValue: strategy.metrics.maxDrawdown,
          },
          {
            label: '运行天数',
            value: String(strategy.metrics.runningDays),
          },
          {
            label: '持仓数',
            value: String(strategy.metrics.positionCount),
          },
          {
            label: '月胜率',
            value: formatPercent(strategy.metrics.monthlyWinRate),
            rawValue: strategy.metrics.monthlyWinRate - 0.5,
          },
        ]

  const addAttachment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAttachmentError('')

    const title = attachmentForm.title.trim()
    const url = attachmentForm.url.trim()
    if (!title || !url) {
      setAttachmentError('附件名称和链接不能为空')
      return
    }

    try {
      const normalized = new URL(url)
      const createdAt = new Date().toISOString()
      const attachment: StrategyAttachment = {
        id: `att_${createdAt.replace(/[:.]/g, '-')}_${strategy.detail.attachments.length + 1}`,
        title,
        url: normalized.toString(),
        note: attachmentForm.note.trim() || undefined,
        createdAt,
        createdBy: user?.username ?? 'admin',
      }

      upsertStrategy({
        ...strategy,
        updatedAt: new Date().toISOString().slice(0, 10),
        detail: {
          ...strategy.detail,
          attachments: [attachment, ...strategy.detail.attachments],
        },
      })
      setAttachmentForm(initialAttachmentForm)
    } catch {
      setAttachmentError('请输入合法的附件 URL')
    }
  }

  const removeAttachment = (attachmentId: string) => {
    const confirmed = window.confirm('确认删除该附件吗？')
    if (!confirmed) {
      return
    }
    upsertStrategy({
      ...strategy,
      updatedAt: new Date().toISOString().slice(0, 10),
      detail: {
        ...strategy.detail,
        attachments: strategy.detail.attachments.filter((item) => item.id !== attachmentId),
      },
    })
  }

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">策略详情</p>
            <h1>{strategy.name}</h1>
            <p>{strategy.summary}</p>
          </div>
          <Link className="btn btn-secondary" to={plazaPath(strategy.channel)}>
            返回{strategy.channel === 'backtest' ? '孵化策略' : '已发布策略'}
          </Link>
        </div>
        <div className="detail-meta">
          <span>作者：{strategy.author}</span>
          <span>更新于：{formatDate(strategy.updatedAt)}</span>
          <span>风险等级：{strategy.riskLevel}</span>
        </div>
      </section>

      <section className="metric-grid metric-grid-wide">
        {metrics.map((metric) => (
          <MetricChip
            key={metric.label}
            label={metric.label}
            value={metric.value}
            rawValue={metric.rawValue}
          />
        ))}
      </section>

      <section className="chart-grid">
        <article className="chart-panel">
          <h2>收益曲线</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={strategy.detail.equityCurve}>
              <CartesianGrid stroke="#1d4a82" strokeDasharray="4 4" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#d4a340"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
        <article className="chart-panel">
          <h2>回撤曲线</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={strategy.detail.drawdownCurve}>
              <CartesianGrid stroke="#2d4777" strokeDasharray="4 4" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="detail-grid">
        <article className="section-panel">
          <h2>策略说明</h2>
          <p>{strategy.detail.description}</p>
          <h3>核心逻辑</h3>
          <p>{strategy.detail.logic}</p>
        </article>
        <article className="section-panel">
          <h2>参数设置</h2>
          <div className="param-list">
            {Object.entries(strategy.detail.params).map(([key, value]) => (
              <div key={key} className="param-item">
                <span>{key}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="section-panel">
        <h2>风险提示</h2>
        <ul className="risk-list">
          {strategy.detail.riskNotes.map((risk) => (
            <li key={risk}>• {risk}</li>
          ))}
        </ul>
      </section>

      <section className="section-panel">
        <div className="section-head">
          <h2>策略附件</h2>
          <p>用于补充策略说明、报告和外部文档链接。</p>
        </div>
        {strategy.detail.attachments.length === 0 ? (
          <p className="empty-copy">当前策略暂无附件。</p>
        ) : (
          <div className="attachment-list">
            {strategy.detail.attachments.map((attachment) => (
              <article key={attachment.id} className="attachment-item">
                <div>
                  <h3>{attachment.title}</h3>
                  <p>
                    添加人：{attachment.createdBy} | 添加时间：
                    {new Date(attachment.createdAt).toLocaleString('zh-CN')}
                  </p>
                  {attachment.note ? <p>{attachment.note}</p> : null}
                  <a href={attachment.url} target="_blank" rel="noreferrer">
                    {attachment.url}
                  </a>
                </div>
                {role === 'admin' ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    删除附件
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {role === 'admin' ? (
          <form className="attachment-form" onSubmit={addAttachment}>
            <h3>添加附件</h3>
            <label>
              附件名称
              <input
                value={attachmentForm.title}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="例如：策略说明文档"
              />
            </label>
            <label>
              附件链接
              <input
                value={attachmentForm.url}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))
                }
                placeholder="https://..."
              />
            </label>
            <label>
              备注（可选）
              <textarea
                rows={2}
                value={attachmentForm.note}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>
            {attachmentError ? (
              <p className="form-error" role="alert">
                {attachmentError}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary">
              添加附件
            </button>
          </form>
        ) : (
          <p className="empty-copy">仅管理员可添加或删除附件。</p>
        )}
      </section>
    </div>
  )
}
