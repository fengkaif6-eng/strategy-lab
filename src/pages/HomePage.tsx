import type { KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useStrategies } from '../context/StrategyContext'
import { useMarketData } from '../hooks/useMarketData'
import { formatPercent, formatSigned } from '../utils/format'

const MARKET_CURVE_POINTS = 300

type FeatureIconKind = 'lifecycle' | 'metrics' | 'live' | 'knowledge'

interface FeatureItem {
  title: string
  front: string
  back: string
  icon: FeatureIconKind
  highlights: string[]
  cta: string
}

function FeatureIcon({ kind }: { kind: FeatureIconKind }) {
  if (kind === 'lifecycle') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v3A2.5 2.5 0 0 1 17.5 12h-11A2.5 2.5 0 0 1 4 9.5z" />
        <path d="M4 14.5A2.5 2.5 0 0 1 6.5 12h11a2.5 2.5 0 0 1 0 5h-11A2.5 2.5 0 0 1 4 14.5z" />
      </svg>
    )
  }

  if (kind === 'metrics') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18.5V11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7.5" />
        <path d="M10 18.5V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v11.5" />
        <path d="M16 18.5v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4" />
      </svg>
    )
  }

  if (kind === 'live') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h4l2.1-3.5L13.8 16l2.2-4H20" />
        <path d="M5.5 5.5h13A1.5 1.5 0 0 1 20 7v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V7a1.5 1.5 0 0 1 1.5-1.5z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}

const featureItems: FeatureItem[] = [
  {
    title: '策略生命周期管理',
    front: '统一管理孵化策略与已发布策略，维护参数、状态与风险分层。',
    back: '支持新增、编辑、删除与状态切换，管理端操作实时同步至展示端。',
    icon: 'lifecycle',
    highlights: ['策略分类统一', '状态变更有留痕', '参数版本可回溯'],
    cta: '管理策略',
  },
  {
    title: '回测指标透视',
    front: '聚焦年化收益、夏普、回撤、胜率等关键指标，支撑策略横向比较。',
    back: '指标采用统一口径并结合走势可视化，提升策略评审与决策效率。',
    icon: 'metrics',
    highlights: ['关键指标一屏比对', '收益回撤同屏对照', '异常阶段自动标记'],
    cta: '查看指标',
  },
  {
    title: '实盘表现跟踪',
    front: '持续跟踪收益、Alpha、最大回撤与运行天数，观察策略稳定性。',
    back: '提供卡片级收益图和关键点标注，快速识别波动区间与异常阶段。',
    icon: 'live',
    highlights: ['实盘收益动态更新', '区间高低点直观', '多策略组合跟踪'],
    cta: '运行监控',
  },
  {
    title: '策略知识沉淀',
    front: '通过 FAQ 与策略附件沉淀方法论、复盘结论与交付文档。',
    back: '形成可追溯的策略档案体系，支持后续复盘、审阅与团队协作。',
    icon: 'knowledge',
    highlights: ['附件文档集中管理', '方法论证可复查', '团队信息可传承'],
    cta: '查看文档',
  },
]

const featureItemsEn: FeatureItem[] = [
  {
    title: 'Strategy Lifecycle Management',
    front: 'Manage incubation and published strategies with unified parameters, status, and risk layers.',
    back: 'Support create, edit, delete, and status switch, with real-time synchronization to display pages.',
    icon: 'lifecycle',
    highlights: ['Unified taxonomy', 'Traceable status changes', 'Versioned parameters'],
    cta: 'Manage Strategies',
  },
  {
    title: 'Backtest Metrics Insight',
    front: 'Compare annual return, Sharpe, drawdown, and win rate with a consistent metric schema.',
    back: 'Metrics and trend visualization are aligned to improve strategy review and decision quality.',
    icon: 'metrics',
    highlights: ['One-screen metric comparison', 'Return vs drawdown context', 'Automatic anomaly markers'],
    cta: 'View Metrics',
  },
  {
    title: 'Live Performance Tracking',
    front: 'Track return, alpha, max drawdown, and running days to monitor strategy stability.',
    back: 'Card-level return charts with key-point markers highlight volatility ranges and anomalies.',
    icon: 'live',
    highlights: ['Real-time return tracking', 'Visible highs and lows', 'Portfolio-level monitoring'],
    cta: 'Monitor Runtime',
  },
  {
    title: 'Knowledge Repository',
    front: 'Use FAQ and attachments to preserve methodology, post-trade review, and deliverables.',
    back: 'Build auditable strategy records for future review, governance, and team collaboration.',
    icon: 'knowledge',
    highlights: ['Centralized attachments', 'Reviewable methods', 'Transferable team knowledge'],
    cta: 'Open Docs',
  },
]

const contactItems = [
  { label: '联系电话', value: '010-0000-0000（占位）' },
  { label: '联系邮箱', value: 'fi-strategy@example.com（占位）' },
  { label: '办公地址', value: '北京市朝阳区（占位）' },
]

const secondaryIndexCodes = ['399001', '399006', '000688'] as const

interface CurvePoint {
  time: string
  value: number
  baseline: number
}

function takeRecent<T>(items: T[], size: number): T[] {
  return items.slice(Math.max(items.length - size, 0))
}

function toCurveFromIntraday(
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

function buildYAxisDomain(points: CurvePoint[], ratio = 0.08): [number, number] {
  const prices = points.map((item) => item.value)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min
  const padding =
    range > 0 ? Math.max(range * ratio, 0.15) : Math.max(Math.abs(max) * 0.0015, 0.15)
  return [min - padding, max + padding]
}

export function HomePage() {
  const { role } = useAuth()
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const { stats, backtestStrategies, liveStrategies } = useStrategies()
  const { indexes, tickers, intradayByCode, loading, stale, updatedAt } = useMarketData()

  const featured = [...backtestStrategies.slice(0, 1), ...liveStrategies.slice(0, 1)]
  const mainMarketCopy = updatedAt
    ? t(
        `基于交易时段分时数据，展示盘中趋势、波动区间与相对强弱。更新时间：${new Date(
          updatedAt,
        ).toLocaleString('zh-CN')}`,
        `Intraday market data with trend, volatility range, and relative strength. Updated: ${new Date(
          updatedAt,
        ).toLocaleString('en-US')}`,
      )
    : t(
        '基于交易时段分时数据，展示盘中趋势、波动区间与相对强弱。',
        'Intraday market data with trend, volatility range, and relative strength.',
      )

  const shanghaiIndex = indexes.find((item) => item.code === '000001')
  const shanghaiCurve = shanghaiIndex
    ? toCurveFromIntraday(intradayByCode['000001'] ?? [], shanghaiIndex.trend)
    : []
  const shanghaiDomain =
    shanghaiCurve.length > 1 ? buildYAxisDomain(shanghaiCurve, 0.06) : (['auto', 'auto'] as const)
  const shanghaiHigh =
    shanghaiCurve.length > 0 ? Math.max(...shanghaiCurve.map((item) => item.value)) : 0
  const shanghaiLow =
    shanghaiCurve.length > 0 ? Math.min(...shanghaiCurve.map((item) => item.value)) : 0
  const isShanghaiUp = (shanghaiIndex?.change ?? 0) >= 0
  const shanghaiColor = isShanghaiUp ? '#ef4444' : '#22c55e'

  const secondaryIndexes = secondaryIndexCodes
    .map((code) => indexes.find((item) => item.code === code))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .map((quote) => {
      const curve = toCurveFromIntraday(intradayByCode[quote.code] ?? [], quote.trend)
      const domain =
        curve.length > 1 ? buildYAxisDomain(curve, 0.07) : (['auto', 'auto'] as const)
      const up = quote.change >= 0
      return {
        quote,
        curve,
        domain,
        color: up ? '#ef4444' : '#22c55e',
      }
    })
  const localizedFeatureItems = locale === 'zh' ? featureItems : featureItemsEn

  const redirectGuestToLogin = () => {
    if (role === 'guest') {
      navigate('/login?notice=auth-required')
    }
  }

  const handleGuestFeatureKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (role !== 'guest') {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate('/login?notice=auth-required')
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-panel hero-panel-upgraded">
        <div className="hero-copy-wrap">
          <p className="eyebrow">{t('固定收益策略平台', 'Fixed Income Strategy Platform')}</p>
          <h1>{t('量化策略平台', 'Quant Strategy Platform')}</h1>
          <p className="hero-copy">
            {t(
              '面向固定收益客需业务场景，提供孵化评估、发布跟踪与风险复盘的一体化策略展示能力，强化策略沟通、过程留痕与决策透明度。',
              'Built for fixed-income client scenarios, integrating incubation evaluation, published strategy tracking, and risk review with transparent, traceable decision support.',
            )}
          </p>
        </div>
        <div className="hero-proof">
          <article>
            <p>{t('策略总数', 'Total Strategies')}</p>
            <strong>{stats.totalStrategies}</strong>
          </article>
          <article>
            <p>{t('孵化策略', 'Incubation')}</p>
            <strong>{stats.totalBacktest}</strong>
          </article>
          <article>
            <p>{t('已发布策略', 'Published')}</p>
            <strong>{stats.totalLive}</strong>
          </article>
        </div>
      </section>

      <section className="ticker-strip" aria-label={t('市场滚动行情', 'Market Ticker')}>
        <div className="ticker-track">
          {tickers.length === 0 ? (
            <span className="ticker-item">
              <strong>{t('行情加载中', 'Loading quotes')}</strong>
              <span>{t('请稍候...', 'Please wait...')}</span>
            </span>
          ) : (
            [...tickers, ...tickers].map((item, index) => (
              <span key={`${item.code}-${index}`} className="ticker-item">
                <strong>{item.name}</strong>
                <span>{item.code}</span>
                <span>{item.price.toFixed(2)}</span>
                <span className={item.changePct >= 0 ? 'text-profit' : 'text-loss'}>
                  {formatPercent(item.changePct / 100)}（{item.changePct >= 0 ? t('上涨', 'Up') : t('下跌', 'Down')}）
                </span>
              </span>
            ))
          )}
        </div>
      </section>

      <section className="section-panel market-hero-curve">
        <div className="section-head">
          <div>
            <h2>{t('上证指数', 'SSE Composite')}</h2>
            <p>
              {t(
                '当日分时走势，用于观察盘中趋势延续性与波动收敛情况。',
                'Intraday movement used to monitor trend continuation and volatility contraction.',
              )}
            </p>
          </div>
          <p className="market-time">
            {t('更新时间：', 'Updated: ')}
            {updatedAt
              ? new Date(updatedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
              : t('暂无', 'N/A')}
          </p>
        </div>
        <div className="market-hero-chart">
          <ResponsiveContainer width="100%" height={330}>
            <AreaChart data={shanghaiCurve}>
              <defs>
                <linearGradient id="market-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={shanghaiColor} stopOpacity={0.46} />
                  <stop offset="100%" stopColor={shanghaiColor} stopOpacity={0.04} />
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
                domain={shanghaiDomain}
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
                    ? [`${shown}（${t('基准', 'Baseline')}）`, t('参考线', 'Reference')]
                    : [shown, shanghaiIndex?.name ?? t('上证指数', 'SSE Composite')]
                }}
                labelFormatter={(label) => `${t('时间', 'Time')} ${label}`}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={shanghaiColor}
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
            <p>{t('当前点位', 'Current')}</p>
            <strong>{shanghaiIndex ? shanghaiIndex.price.toFixed(2) : '--'}</strong>
          </article>
          <article>
            <p>{t('涨跌幅', 'Change %')}</p>
            <strong className={isShanghaiUp ? 'text-profit' : 'text-loss'}>
              {shanghaiIndex ? formatPercent(shanghaiIndex.changePct / 100) : '--'}
            </strong>
          </article>
          <article>
            <p>{t('区间高点', 'Session High')}</p>
            <strong>{shanghaiCurve.length > 0 ? shanghaiHigh.toFixed(2) : '--'}</strong>
          </article>
          <article>
            <p>{t('区间低点', 'Session Low')}</p>
            <strong>{shanghaiCurve.length > 0 ? shanghaiLow.toFixed(2) : '--'}</strong>
          </article>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-head">
          <div>
            <h2>{t('市场行情', 'Market Overview')}</h2>
            <p>{mainMarketCopy}</p>
            {loading ? <p>{t('正在加载最新行情...', 'Loading latest quotes...')}</p> : null}
            {stale ? <p>{t('当前展示最近一次可用快照。', 'Displaying latest available snapshot.')}</p> : null}
          </div>
        </div>
        <div className="market-grid">
          {secondaryIndexes.map(({ quote, curve, domain, color }) => (
            <article key={quote.code} className="market-card market-card-with-chart">
              <header>
                <h3>{quote.name}</h3>
                <span>{quote.code}</span>
              </header>
              <strong>{quote.price.toFixed(2)}</strong>
              <p className={quote.change >= 0 ? 'text-profit' : 'text-loss'}>
                {formatSigned(quote.change)} {t('点', 'pts')} / {formatPercent(quote.changePct / 100)}{' '}
                {quote.change >= 0 ? `（${t('上涨', 'Up')}）` : `（${t('下跌', 'Down')}）`}
              </p>
              <div className="market-mini-chart">
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={curve}>
                    <defs>
                      <linearGradient id={`mini-${quote.code}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(188,210,245,0.15)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      hide
                      axisLine={{ stroke: 'rgba(188,210,245,0.2)' }}
                      tickLine={{ stroke: 'rgba(188,210,245,0.2)' }}
                    />
                    <YAxis
                      width={44}
                      domain={domain}
                      tick={{ fill: '#c7d8f4', fontSize: 10 }}
                      tickFormatter={(value: number) => value.toFixed(1)}
                      axisLine={{ stroke: 'rgba(188,210,245,0.25)' }}
                      tickLine={{ stroke: 'rgba(188,210,245,0.25)' }}
                    />
                    <Tooltip
                      formatter={(value) => {
                        const numeric = Number(value)
                        return [Number.isFinite(numeric) ? numeric.toFixed(2) : '--', quote.name]
                      }}
                      labelFormatter={(label) => `${t('时间', 'Time')} ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={color}
                      strokeWidth={2}
                      fill={`url(#mini-${quote.code})`}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-panel">
        <div className="section-head">
          <h2>{t('核心功能', 'Core Capabilities')}</h2>
        </div>
        <div className="flip-grid">
          {localizedFeatureItems.map((item) => (
            <article key={item.title} className="flip-card" tabIndex={0}>
              <div className="flip-inner">
                <div className="flip-face">
                  <div className="flip-icon-shell">
                    <span className="flip-icon" aria-hidden="true">
                      <FeatureIcon kind={item.icon} />
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.front}</p>
                </div>
                <div
                  className={role === 'guest' ? 'flip-face flip-back flip-back-clickable' : 'flip-face flip-back'}
                  onClick={role === 'guest' ? redirectGuestToLogin : undefined}
                  onKeyDown={role === 'guest' ? handleGuestFeatureKeyDown : undefined}
                  role={role === 'guest' ? 'button' : undefined}
                  tabIndex={role === 'guest' ? 0 : undefined}
                  aria-label={role === 'guest' ? t(`登录后查看${item.title}`, `Sign in to view ${item.title}`) : undefined}
                >
                  <div className="flip-back-glow" aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.back}</p>
                  <ul className="flip-points">
                    {item.highlights.map((text) => (
                      <li key={text}>
                        <span className="flip-check" aria-hidden="true">
                          <svg viewBox="0 0 20 20">
                            <path d="M4 10.5 8 14l8-8" />
                          </svg>
                        </span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flip-cta" aria-hidden="true">
                    <span>{item.cta}</span>
                    <svg viewBox="0 0 20 20">
                      <path d="M4 10h11M10.5 5.5 15 10l-4.5 4.5" />
                    </svg>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>{t('策略示例', 'Strategy Samples')}</h2>
          <Link to={role === 'guest' ? '/register' : '/incubation-strategies'}>
            {role === 'guest' ? t('注册后查看全部策略', 'Register to view all strategies') : t('查看全部策略', 'View all strategies')}
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
          <h2>{t('联系方式', 'Contact')}</h2>
        </div>
        <div className="contact-grid">
          {contactItems.map((item, index) => (
            <article key={item.label}>
              <p>
                {locale === 'zh'
                  ? item.label
                  : index === 0
                    ? 'Phone'
                    : index === 1
                      ? 'Email'
                      : 'Address'}
              </p>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
