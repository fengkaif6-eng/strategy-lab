import { Link } from 'react-router-dom'
import { StrategyCard } from '../components/StrategyCard'
import { Sparkline } from '../components/Sparkline'
import { useAuth } from '../context/AuthContext'
import { useStrategies } from '../context/StrategyContext'
import { useMarketData } from '../hooks/useMarketData'
import { formatPercent, formatSigned } from '../utils/format'

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
    back: '策略卡直接展示收益小图，快速识别波动区间和运行稳定性。',
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

export function HomePage() {
  const { role } = useAuth()
  const { stats, backtestStrategies, liveStrategies } = useStrategies()
  const { indexes, tickers, loading, stale, updatedAt } = useMarketData()

  const featured = [...backtestStrategies.slice(0, 1), ...liveStrategies.slice(0, 1)]
  const ctaPath = role === 'guest' ? '/register' : '/incubation-strategies'
  const ctaText = role === 'guest' ? '立即注册查看策略' : '开始查看孵化策略'

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
                  {formatPercent(item.changePct / 100)}（
                  {item.changePct >= 0 ? '上涨' : '下跌'}）
                </span>
              </span>
            ))
          )}
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
          <p>鼠标悬停或聚焦卡片，可翻转查看功能详情。</p>
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
