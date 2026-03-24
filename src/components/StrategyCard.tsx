import { Link } from 'react-router-dom'
import type { StrategyRecord } from '../types/strategy'
import { formatDate, formatPercent, formatSigned } from '../utils/format'
import { MetricChip } from './MetricChip'
import { Sparkline } from './Sparkline'

interface StrategyCardProps {
  strategy: StrategyRecord
  compact?: boolean
}

function statusLabel(status: StrategyRecord['status']) {
  if (status === 'active') {
    return '运行中'
  }
  if (status === 'paused') {
    return '已暂停'
  }
  return '已归档'
}

export function StrategyCard({ strategy, compact = false }: StrategyCardProps) {
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
            label: '月胜率',
            value: formatPercent(strategy.metrics.monthlyWinRate),
            rawValue: strategy.metrics.monthlyWinRate - 0.5,
          },
        ]

  return (
    <article className={`strategy-card ${compact ? 'strategy-card-compact' : ''}`}>
      <header className="strategy-card-header">
        <div>
          <h3>{strategy.name}</h3>
          <p>{strategy.summary}</p>
        </div>
        <span className={`status-badge status-${strategy.status}`}>
          {statusLabel(strategy.status)}
        </span>
      </header>

      <div className="sparkline-wrap">
        <span>收益走势</span>
        <Sparkline
          className="strategy-sparkline"
          values={strategy.detail.equityCurve.map((point) => point.value)}
        />
      </div>

      <div className="tag-row">
        {strategy.tags.map((tag) => (
          <span key={tag} className="tag-pill">
            {tag}
          </span>
        ))}
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <MetricChip
            key={metric.label}
            label={metric.label}
            value={metric.value}
            rawValue={metric.rawValue}
          />
        ))}
      </div>

      <footer className="strategy-card-footer">
        <div className="strategy-meta">
          <span>作者：{strategy.author}</span>
          <span>更新于：{formatDate(strategy.updatedAt)}</span>
        </div>
        <Link
          className="btn btn-secondary"
          to={`/strategy/${strategy.channel}/${strategy.id}`}
          aria-label={`查看策略 ${strategy.name} 详情`}
        >
          查看详情
        </Link>
      </footer>
    </article>
  )
}
