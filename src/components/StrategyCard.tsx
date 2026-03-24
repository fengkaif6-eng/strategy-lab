import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { StrategyRecord } from '../types/strategy'
import { formatDate, formatPercent, formatSigned } from '../utils/format'
import { MetricChip } from './MetricChip'

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

function formatValue(value: number) {
  return value.toFixed(3)
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

  const curve = strategy.detail.equityCurve
  const startPoint = curve[0]
  const currentPoint = curve[curve.length - 1]
  const peakPoint = curve.reduce((best, point) =>
    point.value > best.value ? point : best,
  )

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

      <div className="strategy-chart-panel">
        <div className="strategy-chart-title-row">
          <span>收益走势</span>
          <span>横轴：时间 / 纵轴：净值</span>
        </div>
        <div className="strategy-mini-chart">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={curve}>
              <CartesianGrid stroke="rgba(188,210,245,0.25)" strokeDasharray="4 4" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#c7d8f4', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(188,210,245,0.35)' }}
                tickLine={{ stroke: 'rgba(188,210,245,0.35)' }}
              />
              <YAxis
                tickFormatter={(value: number) => value.toFixed(2)}
                tick={{ fill: '#c7d8f4', fontSize: 10 }}
                width={42}
                axisLine={{ stroke: 'rgba(188,210,245,0.35)' }}
                tickLine={{ stroke: 'rgba(188,210,245,0.35)' }}
              />
              <Tooltip
                formatter={(value) => {
                  const numeric = Number(value)
                  return [`净值 ${Number.isFinite(numeric) ? formatValue(numeric) : '--'}`, '']
                }}
                labelFormatter={(label) => `时间 ${label}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#d4a340"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {startPoint ? (
                <ReferenceDot
                  x={startPoint.date}
                  y={startPoint.value}
                  r={3}
                  fill="#22c55e"
                  label={{
                    value: `起 ${formatValue(startPoint.value)}`,
                    position: 'top',
                    fill: '#8de9b2',
                    fontSize: 10,
                  }}
                />
              ) : null}
              {peakPoint ? (
                <ReferenceDot
                  x={peakPoint.date}
                  y={peakPoint.value}
                  r={3}
                  fill="#fbbf24"
                  label={{
                    value: `峰 ${formatValue(peakPoint.value)}`,
                    position: 'top',
                    fill: '#f8d48f',
                    fontSize: 10,
                  }}
                />
              ) : null}
              {currentPoint ? (
                <ReferenceDot
                  x={currentPoint.date}
                  y={currentPoint.value}
                  r={3}
                  fill="#60a5fa"
                  label={{
                    value: `现 ${formatValue(currentPoint.value)}`,
                    position: 'right',
                    fill: '#a8cbff',
                    fontSize: 10,
                  }}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="strategy-keypoints">
          <div className="strategy-keypoint">
            <p>起点</p>
            <strong>
              {startPoint?.date} | {startPoint ? formatValue(startPoint.value) : '-'}
            </strong>
          </div>
          <div className="strategy-keypoint">
            <p>峰值</p>
            <strong>
              {peakPoint?.date} | {peakPoint ? formatValue(peakPoint.value) : '-'}
            </strong>
          </div>
          <div className="strategy-keypoint">
            <p>当前</p>
            <strong>
              {currentPoint?.date} | {currentPoint ? formatValue(currentPoint.value) : '-'}
            </strong>
          </div>
        </div>
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
