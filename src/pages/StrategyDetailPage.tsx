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
import { useStrategies } from '../context/StrategyContext'
import type { StrategyChannel } from '../types/strategy'
import { formatDate, formatPercent, formatSigned } from '../utils/format'

function isChannel(value: string | undefined): value is StrategyChannel {
  return value === 'backtest' || value === 'live'
}

export function StrategyDetailPage() {
  const { channel, id } = useParams()
  const { findStrategy } = useStrategies()

  if (!isChannel(channel) || !id) {
    return (
      <section className="empty-panel">
        <h1>无效的策略地址</h1>
        <Link className="btn btn-primary" to="/backtest-plaza">
          返回回测广场
        </Link>
      </section>
    )
  }

  const strategy = findStrategy(channel, id)

  if (!strategy) {
    return (
      <section className="empty-panel">
        <h1>策略不存在或已删除</h1>
        <Link className="btn btn-primary" to={`/${channel}-plaza`}>
          返回广场
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

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">策略详情</p>
            <h1>{strategy.name}</h1>
            <p>{strategy.summary}</p>
          </div>
          <Link className="btn btn-secondary" to={`/${strategy.channel}-plaza`}>
            返回{strategy.channel === 'backtest' ? '回测' : '实盘'}广场
          </Link>
        </div>
        <div className="detail-meta">
          <span>作者 {strategy.author}</span>
          <span>更新于 {formatDate(strategy.updatedAt)}</span>
          <span>风险等级 {strategy.riskLevel}</span>
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
              <CartesianGrid stroke="#DBEAFE" strokeDasharray="4 4" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1E40AF"
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
              <CartesianGrid stroke="#FEE2E2" strokeDasharray="4 4" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#DC2626"
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
    </div>
  )
}
