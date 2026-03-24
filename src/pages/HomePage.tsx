import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { StrategyCard } from '../components/StrategyCard'
import { Sparkline } from '../components/Sparkline'
import { useAuth } from '../context/AuthContext'
import { useStrategies } from '../context/StrategyContext'
import { useMarketData } from '../hooks/useMarketData'
import { formatPercent, formatSigned } from '../utils/format'

const MARKET_CURVE_POINTS = 300

const featureItems = [
  {
    title: '策略生命周期管理',
    front: '集中管理孵化策略和已发布策略，统一维护参数与风险等级。',
    back: '支持策略新增、编辑、删除和状态切换，管理动作实时同步到展示板块。',
  },
  {
    title: '回测指标透视',
    front: '查看年化收益、夏普、回撤、胜率等核心指标并对比表现。',
    back: '关键指标支持正负语义展示与趋势线辅助判断，减少单一指标误判。',
  },
  {
    title: '实盘表现跟踪',
    front: '持续跟踪已发布策略收益、alpha、回撤与运行天数。',
    back: '策略卡直接展示收益图，快速识别波动区间和运行稳定性。',
  },
  {
    title: '策略知识沉淀',
    front: '通过 FAQ 与策略附件形成可复用的策略知识库。',
    back: '在策略详情中维护附件链接，后续复盘可快速定位策略文档和报告。',
  },
]

const contactItems = [
  { label: '联系电话', value: '010-0000-0000（占位）' },
  { label: '联系邮箱', value: 'fi-strategy@example.com（占位）' },
  { label: '办公地址', value: '北京市朝阳区（占位）' },
]

interface CurvePoint {
  time: string
  value: number
  baseline: number
}

function takeRecent<T>(items: T[], size: number): T[] {
  return items.slice(Math.max(items.length - size, 0))
}

function toMarketCurveFromIntraday(
  intraday: { time: string; price: number }[],
  fallbackTrend: number[],
): CurvePoint[] {
  const recentIntraday = takeRecent(intraday, MARKET_CURVE_POINTS)
  if (recentIntraday.length > 0) {
    const baseline = recentIntraday[0].price
    return recentIntraday.map((point) => ({
      time: point.time,
      value: point.price,
      baseline,
    }))
  }

  const recentFallback = takeRecent(fallbackTrend, MARKET_CURVE_POINTS)
  if (recentFallback.length > 0) {
    const baseline = recentFallback[0]
    return recentFallback.map((value, index) => ({
      time: String(index + 1),
      value,
      baseline,
    }))
  }
  return []
}

function buildYAxisDomain(points: CurvePoint[]): [number, number] {
  const prices = points.map((item) => item.value)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min
  const padding = range > 0 ? Math.max(range * 0.08, 0.2) : Math.max(max * 0.002, 0.2)
  return [min - padding, max + padding]
}

export function HomePage() {
  const { role } = useAuth()
  const { stats, backtestStrategies, liveStrategies } = useStrategies()
  const { indexes, tickers, shanghaiIntraday, loading, stale, updatedAt } = useMarketData()

  const featured = [...backtestStrategies.slice(0, 1), ...liveStrategies.slice(0, 1)]
  const ctaPath = role === 'guest' ? '/register' : '/incubation-strategies'
  const ctaText = role === 'guest' ? '立即注册查看策略' : '开始查看孵化策略'

  const primaryIndex = indexes.find((item) => item.code === '000001') ?? indexes[0]
  const marketCurve = primaryIndex
    ? toMarketCurveFromIntraday(shanghaiIntraday, primaryIndex.trend)
    : []
  const yAxisDomain =
    marketCurve.length > 1 ? buildYAxisDomain(marketCurve) : (['auto', 'auto'] as const)

  const marketHigh =
    marketCurve.length > 0 ? Math.max(...marketCurve.map((item) => item.value)) : 0
  const marketLow =
    marketCurve.length > 0 ? Math.min(...marketCurve.map((item) => item.value)) : 0
  const isMarketUp = (primaryIndex?.change ?? 0) >= 0
  const trendColor = isMarketUp ? '#ef4444' : '#22c55e'

  return (
    <div className="page-stack">
      <section className="hero-panel hero-panel-upgraded">
        <div className="hero-copy-wrap">
          <p className="eyebrow">Trust & Authority</p>
          <h1>量化策略展示平台</h1>
          <p className="hero-copy">
            面向固定收益客需场景，统一展示策略孵化、已发布运行与关键风险指标，
            以可解释数据支持策略沟通与复盘。
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to={ctaPath}>
              {ctaText}
            </Link>
            <Link className="btn btn-secondary" to={role === 'guest' ? '/login' : '/faq'}>
              {role === 'guest' ? '已有账号去登录' : '查看 FAQ'}
            </Link>
          </div>
        </div>
        <div className="hero-proof">
          <article>
            <p>策略总数</p>
            <strong>{stats.totalStrategies}</strong>
          </article>
          <article>
            <p>孵化策略</p>
            <strong>{stats.totalBacktest}</strong>
          </article>
          <article>
            <p>已发布策略</p>
            <strong>{stats.totalLive}</strong>
          </article>
        </div>
      </section>

      <section className="ticker-strip" aria-label="市场滚动行情">
        <div className="ticker-track">
          {tickers.length === 0 ? (
            <span className="ticker-item">
              <strong>行情加载中</strong>
              <span>请稍候...</span>
            </span>
          ) : (
            [...tickers, ...tickers].map((item, index) => (
              <span key={`${item.code}-${index}`} className="ticker-item">
                <strong>{item.name}</strong>
                <span>{item.code}</span>
                <span>{item.price.toFixed(2)}</span>
                <span className={item.changePct >= 0 ? 'text-profit' : 'text-loss'}>
                  {formatPercent(item.changePct / 100)}（{item.changePct >= 0 ? '上涨' : '下跌'}）
                </span>
              </span>
            ))
          )}
        </div>
      </section>

      <section className="section-panel market-hero-curve">
        <div className="section-head">
          <div>
            <h2>市场趋势大图</h2>
            <p>
              展示{primaryIndex?.name ?? '上证指数'}今日分时曲线，仅保留最近{' '}
              {MARKET_CURVE_POINTS} 个点。
            </p>
          </div>
          <p className="market-time">
            更新时间：{updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '暂无'}
          </p>
        </div>
        <div className="market-hero-chart">
          <ResponsiveContainer width="100%" height={330}>
            <AreaChart data={marketCurve}>
              <defs>
                <linearGradient id="market-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendColor} stopOpacity={0.46} />
                  <stop offset="100%" stopColor={trendColor} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(188,210,245,0.2)" strokeDasharray="4 4" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#c7d8f4', fontSize: 11 }}
                minTickGap={18}
                axisLine={{ stroke: 'rgba(188,210,245,0.35)' }}
                tickLine={{ stroke: 'rgba(188,210,245,0.35)' }}
              />
              <YAxis
                width={64}
                domain={yAxisDomain}
                tick={{ fill: '#c7d8f4', fontSize: 11 }}
                tickFormatter={(value: number) => value.toFixed(1)}
                axisLine={{ stroke: 'rgba(188,210,245,0.35)' }}
                tickLine={{ stroke: 'rgba(188,210,245,0.35)' }}
              />
              <Tooltip
                formatter={(value, key) => {
                  const numeric = Number(value)
                  const shown = Number.isFinite(numeric) ? numeric.toFixed(2) : '--'
                  return key === 'baseline'
                    ? [`${shown}（基准）`, '参考线']
                    : [shown, primaryIndex?.name ?? '指数']
                }}
                labelFormatter={(label) => `时间 ${label}`}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={2.4}
                fill="url(#market-area)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="baseline"
                stroke="#8ba7d8"
                strokeWidth={1.6}
                strokeDasharray="5 4"
                fillOpacity={0}
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="market-hero-kpis">
          <article>
            <p>当前点位</p>
            <strong>{primaryIndex ? primaryIndex.price.toFixed(2) : '--'}</strong>
          </article>
          <article>
            <p>涨跌幅</p>
            <strong
              className={primaryIndex && primaryIndex.changePct >= 0 ? 'text-profit' : 'text-loss'}
            >
              {primaryIndex ? formatPercent(primaryIndex.changePct / 100) : '--'}
            </strong>
          </article>
          <article>
            <p>区间高点</p>
            <strong>{marketCurve.length > 0 ? marketHigh.toFixed(2) : '--'}</strong>
          </article>
          <article>
            <p>区间低点</p>
            <strong>{marketCurve.length > 0 ? marketLow.toFixed(2) : '--'}</strong>
          </article>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-head">
          <div>
            <h2>市场行情</h2>
            <p>
              覆盖上证指数、深证成指、创业板指、科创50。
              {loading ? ' 正在加载最新行情...' : stale ? ' 当前展示最近一次可用快照。' : ''}
            </p>
          </div>
          <p className="market-time">
            更新时间：{updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '暂无'}
          </p>
        </div>
        <div className="market-grid">
          {indexes.map((quote) => (
            <article key={quote.code} className="market-card">
              <header>
                <h3>{quote.name}</h3>
                <span>{quote.code}</span>
              </header>
              <strong>{quote.price.toFixed(2)}</strong>
              <p className={quote.change >= 0 ? 'text-profit' : 'text-loss'}>
                {formatSigned(quote.change)} 点 / {formatPercent(quote.changePct / 100)}{' '}
                {quote.change >= 0 ? '（上涨）' : '（下跌）'}
              </p>
              <Sparkline className="market-sparkline" values={quote.trend} />
            </article>
          ))}
        </div>
      </section>

      <section className="section-panel">
        <div className="section-head">
          <h2>核心功能</h2>
        </div>
        <div className="flip-grid">
          {featureItems.map((item) => (
            <article key={item.title} className="flip-card" tabIndex={0}>
              <div className="flip-inner">
                <div className="flip-face">
                  <h3>{item.title}</h3>
                  <p>{item.front}</p>
                </div>
                <div className="flip-face flip-back">
                  <h3>{item.title}</h3>
                  <p>{item.back}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>策略示例</h2>
          <Link to={role === 'guest' ? '/register' : '/incubation-strategies'}>
            {role === 'guest' ? '注册后查看全部策略' : '查看全部策略'}
          </Link>
        </div>
        <div className="card-grid">
          {featured.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} compact />
          ))}
        </div>
      </section>

      <section className="section-panel contact-panel">
        <div className="section-head">
          <h2>联系方式</h2>
        </div>
        <div className="contact-grid">
          {contactItems.map((item) => (
            <article key={item.label}>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
