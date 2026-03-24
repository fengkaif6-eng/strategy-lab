import { Link } from 'react-router-dom'
import { StrategyCard } from '../components/StrategyCard'
import { useStrategies } from '../context/StrategyContext'

const featureItems = [
  {
    title: '策略管理',
    description: '统一维护策略参数、风险等级和运行状态，支持快速增删改。',
  },
  {
    title: '回测广场',
    description: '集中查看所有回测策略及关键指标，快速筛选可上线方案。',
  },
  {
    title: '实盘广场',
    description: '跟踪实盘运行表现，监控收益、回撤与 alpha 稳定性。',
  },
  {
    title: '帮助文档',
    description: '从快速上手到指标解释，覆盖策略生命周期的关键问题。',
  },
]

const faqItems = [
  {
    q: '如何开始第一条回测策略？',
    a: '进入“策略管理”创建策略后，在“回测广场”查看收益和风险指标表现。',
  },
  {
    q: '回测和实盘数据有什么区别？',
    a: '回测数据基于历史市场环境，实盘数据为实际运行记录，两者独立展示。',
  },
  {
    q: '策略指标多久更新一次？',
    a: '第一版为本地静态演示数据，后续可扩展为实时接口更新。',
  },
]

export function HomePage() {
  const { stats, backtestStrategies } = useStrategies()
  const featured = backtestStrategies.slice(0, 2)

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="eyebrow">Trust & Authority</p>
        <h1>零门槛策略验证与实盘展示平台</h1>
        <p className="hero-copy">
          从回测、实盘到策略运维，统一在一个工作台完成。用可解释指标替代拍脑袋决策。
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/backtest-plaza">
            开始回测
          </Link>
          <Link className="btn btn-secondary" to="/strategy-manage">
            管理策略
          </Link>
        </div>
      </section>

      <section className="proof-grid" aria-label="数据证明区">
        <article>
          <p>策略总数</p>
          <strong>{stats.totalStrategies}</strong>
        </article>
        <article>
          <p>回测策略</p>
          <strong>{stats.totalBacktest}</strong>
        </article>
        <article>
          <p>实盘运行</p>
          <strong>{stats.totalLive}</strong>
        </article>
      </section>

      <section className="feature-grid">
        {featureItems.map((feature) => (
          <article key={feature.title} className="feature-card">
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      <section>
        <div className="section-head">
          <h2>策略示例</h2>
          <Link to="/backtest-plaza">查看全部回测策略</Link>
        </div>
        <div className="card-grid">
          {featured.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} compact />
          ))}
        </div>
      </section>

      <section className="faq-section">
        <div className="section-head">
          <h2>常见问题</h2>
          <Link to="/help-docs">进入帮助文档</Link>
        </div>
        {faqItems.map((item) => (
          <article key={item.q} className="faq-item">
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
