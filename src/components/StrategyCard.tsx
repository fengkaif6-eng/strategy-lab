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
import { useLocale } from '../context/LocaleContext'
import type { StrategyRecord } from '../types/strategy'
import { formatDate, formatPercent, formatSigned } from '../utils/format'
import { MetricChip } from './MetricChip'

interface StrategyCardProps {
  strategy: StrategyRecord
  compact?: boolean
}

function statusLabel(status: StrategyRecord['status']) {
  if (status === 'active') {
    return { zh: '运行中', en: 'Active' }
  }
  if (status === 'paused') {
    return { zh: '已暂停', en: 'Paused' }
  }
  return { zh: '已归档', en: 'Archived' }
}

function formatPercentValue(value: number, digits = 2) {
  const percent = value * 100
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(digits)}%`
}

function toCumulativeReturnCurve(curve: StrategyRecord['detail']['equityCurve']) {
  const base = curve[0]?.value ?? 1
  if (base === 0) {
    return curve.map((point) => ({
      ...point,
      value: 0,
    }))
  }
  return curve.map((point) => ({
    ...point,
    value: point.value / base - 1,
  }))
}

export function StrategyCard({ strategy, compact = false }: StrategyCardProps) {
  const { t, locale } = useLocale()
  const metrics =
    strategy.channel === 'backtest'
      ? [
          {
            label: t('年化收益', 'Annual Return'),
            value: formatPercent(strategy.metrics.annualReturn),
            rawValue: strategy.metrics.annualReturn,
          },
          {
            label: t('夏普比率', 'Sharpe Ratio'),
            value: formatSigned(strategy.metrics.sharpe),
          },
          {
            label: t('最大回撤', 'Max Drawdown'),
            value: formatPercent(strategy.metrics.maxDrawdown),
            rawValue: strategy.metrics.maxDrawdown,
          },
          {
            label: t('胜率', 'Win Rate'),
            value: formatPercent(strategy.metrics.winRate),
            rawValue: strategy.metrics.winRate - 0.5,
          },
        ]
      : [
          {
            label: t('累计收益', 'Total Return'),
            value: formatPercent(strategy.metrics.totalReturn),
            rawValue: strategy.metrics.totalReturn,
          },
          {
            label: 'Alpha',
            value: formatPercent(strategy.metrics.alpha),
            rawValue: strategy.metrics.alpha,
          },
          {
            label: t('最大回撤', 'Max Drawdown'),
            value: formatPercent(strategy.metrics.maxDrawdown),
            rawValue: strategy.metrics.maxDrawdown,
          },
          {
            label: t('月胜率', 'Monthly Win Rate'),
            value: formatPercent(strategy.metrics.monthlyWinRate),
            rawValue: strategy.metrics.monthlyWinRate - 0.5,
          },
        ]

  const curve = toCumulativeReturnCurve(strategy.detail.equityCurve)
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
        <span className={`status-badge status-${strategy.status}`}>{statusLabel(strategy.status)[locale]}</span>
      </header>

      <div className="strategy-chart-panel">
        <div className="strategy-chart-title-row">
          <span>{t('收益走势', 'Return Curve')}</span>
          <span>{t('横轴：时间 / 纵轴：累计收益率（%）', 'X: Time / Y: Cumulative Return (%)')}</span>
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
                tickFormatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                tick={{ fill: '#c7d8f4', fontSize: 10 }}
                width={42}
                axisLine={{ stroke: 'rgba(188,210,245,0.35)' }}
                tickLine={{ stroke: 'rgba(188,210,245,0.35)' }}
              />
              <Tooltip
                formatter={(value) => {
                  const numeric = Number(value)
                  return [
                    `${t('收益率', 'Return')} ${Number.isFinite(numeric) ? formatPercentValue(numeric) : '--'}`,
                    '',
                  ]
                }}
                labelFormatter={(label) => `${t('时间', 'Time')} ${label}`}
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
                    value: `${t('起', 'S')} ${formatPercentValue(startPoint.value)}`,
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
                    value: `${t('峰', 'P')} ${formatPercentValue(peakPoint.value)}`,
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
                    value: `${t('现', 'C')} ${formatPercentValue(currentPoint.value)}`,
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
            <p>{t('起点', 'Start')}</p>
            <strong>
              {startPoint?.date} | {startPoint ? formatPercentValue(startPoint.value) : '-'}
            </strong>
          </div>
          <div className="strategy-keypoint">
            <p>{t('峰值', 'Peak')}</p>
            <strong>
              {peakPoint?.date} | {peakPoint ? formatPercentValue(peakPoint.value) : '-'}
            </strong>
          </div>
          <div className="strategy-keypoint">
            <p>{t('当前', 'Current')}</p>
            <strong>
              {currentPoint?.date} | {currentPoint ? formatPercentValue(currentPoint.value) : '-'}
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
          <span>{t('作者：', 'Author: ')}{strategy.author}</span>
          <span>{t('更新于：', 'Updated: ')}{formatDate(strategy.updatedAt)}</span>
        </div>
        <Link
          className="btn btn-secondary"
          to={`/strategy/${strategy.channel}/${strategy.id}`}
          aria-label={t(`查看策略 ${strategy.name} 详情`, `View details for ${strategy.name}`)}
        >
          {t('查看详情', 'View Details')}
        </Link>
      </footer>
    </article>
  )
}
