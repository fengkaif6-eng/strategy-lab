import { useLocale } from '../context/LocaleContext'

type SummaryCard = {
  title: string
  description: string
}

type ProductModuleRow = {
  module: string
  target: string
  deliverable: string
}

const SUMMARY_ZH: SummaryCard[] = [
  {
    title: '服务对象',
    description: '面向银行、券商资管、理财子和机构客户经理的固收策略展业场景。',
  },
  {
    title: '核心价值',
    description: '把策略研究、路演材料和报价流程统一为标准化产品链路。',
  },
  {
    title: '交付节奏',
    description: '支持日内监测、周度复盘、月度归因的多频率服务。',
  },
]

const SUMMARY_EN: SummaryCard[] = [
  {
    title: 'Target Clients',
    description: 'Built for FI sales, portfolio teams, and institutional relationship managers.',
  },
  {
    title: 'Core Value',
    description: 'Unifies strategy research, pitch materials, and pricing workflow into one product lane.',
  },
  {
    title: 'Delivery Cadence',
    description: 'Supports intraday monitoring, weekly review, and monthly attribution cycles.',
  },
]

const MODULE_ROWS_ZH: ProductModuleRow[] = [
  {
    module: '宏观与市场看板',
    target: '销售与投顾团队',
    deliverable: '关键利率、信用、商品与外汇指标解读。',
  },
  {
    module: '策略组合引擎',
    target: '投资经理与研究员',
    deliverable: '策略筛选、组合建议、收益回撤对比报告。',
  },
  {
    module: '客户路演包',
    target: '客户经理与销售管理',
    deliverable: '产品说明书、案例页面、FAQ 与风险揭示。',
  },
]

const MODULE_ROWS_EN: ProductModuleRow[] = [
  {
    module: 'Macro & Market Dashboard',
    target: 'Sales and advisory teams',
    deliverable: 'Interpretation of rates, credit, commodity, and FX indicators.',
  },
  {
    module: 'Strategy Portfolio Engine',
    target: 'PMs and research analysts',
    deliverable: 'Strategy screening, portfolio proposal, and drawdown comparison reports.',
  },
  {
    module: 'Client Pitch Package',
    target: 'Relationship managers and sales leads',
    deliverable: 'Product profile, case pages, FAQ, and risk disclosure pack.',
  },
]

const PROCESS_ZH = [
  '需求确认：明确客户目标、风险预算、期限与流动性约束。',
  '方案定制：输出策略池筛选结果和推荐组合逻辑。',
  '交付路演：提供产品介绍、核心指标、历史表现与风险提示。',
  '上线跟踪：按周/按月输出组合复盘与优化建议。',
]

const PROCESS_EN = [
  'Requirement alignment: lock client goals, risk budget, tenor, and liquidity constraints.',
  'Solution design: output strategy shortlist and portfolio recommendation logic.',
  'Pitch delivery: provide product intro, core metrics, historical results, and risk notes.',
  'Post-launch tracking: weekly/monthly review with optimization actions.',
]

const DELIVERABLES_ZH = [
  '策略逻辑说明（含适用场景与容量边界）',
  '历史表现拆解（收益、回撤、胜率与相关性）',
  '风险条款与风控触发机制说明',
  '客户问答模板与标准路演话术',
]

const DELIVERABLES_EN = [
  'Strategy logic brief with use-case and capacity boundaries',
  'Historical performance breakdown (return, drawdown, hit ratio, correlation)',
  'Risk clauses and trigger-based control mechanisms',
  'Client Q&A template and standard pitch script',
]

export function ProductIntroPage() {
  const { locale, t } = useLocale()

  const summaryCards = locale === 'zh' ? SUMMARY_ZH : SUMMARY_EN
  const moduleRows = locale === 'zh' ? MODULE_ROWS_ZH : MODULE_ROWS_EN
  const process = locale === 'zh' ? PROCESS_ZH : PROCESS_EN
  const deliverables = locale === 'zh' ? DELIVERABLES_ZH : DELIVERABLES_EN

  const navItems = [
    { id: 'positioning', label: t('产品定位', 'Positioning') },
    { id: 'modules', label: t('模块构成', 'Module Stack') },
    { id: 'workflow', label: t('服务流程', 'Service Workflow') },
    { id: 'deliverables', label: t('交付内容', 'Deliverables') },
  ]

  return (
    <div className="page-stack">
      <section className="section-panel">
        <h1>{t('产品介绍', 'Product Introduction')}</h1>
        <p>
          {t(
            '围绕“研究-路演-跟踪”三段式流程，沉淀可复用的固收策略产品能力。',
            'The module packages fixed-income strategy capability across research, pitch, and follow-through.',
          )}
        </p>
      </section>

      <section className="product-summary-grid" aria-label={t('产品概览', 'Product overview')}>
        {summaryCards.map((card) => (
          <article key={card.title} className="product-summary-card">
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </article>
        ))}
      </section>

      <div className="docs-layout">
        <aside className="docs-nav" aria-label={t('产品目录', 'Product table of contents')}>
          {navItems.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </aside>

        <section className="docs-content">
          <article id="positioning" className="section-panel">
            <h2>{t('产品定位', 'Positioning')}</h2>
            <p>
              {t(
                '产品模块用于把策略能力转化为客户可理解、可比较、可报价的标准化服务包。',
                'This module converts strategy capability into a standardized, comparable, and quotable service package.',
              )}
            </p>
            <p>
              {t(
                '重点服务于“售前沟通-方案落地-持续复盘”全链路，减少重复沟通成本。',
                'It supports the full chain from pre-sales communication to implementation and recurring reviews.',
              )}
            </p>
          </article>

          <article id="modules" className="section-panel">
            <h2>{t('模块构成', 'Module Stack')}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('模块', 'Module')}</th>
                    <th>{t('适用团队', 'Target Team')}</th>
                    <th>{t('标准交付', 'Standard Deliverable')}</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleRows.map((row) => (
                    <tr key={row.module}>
                      <td>{row.module}</td>
                      <td>{row.target}</td>
                      <td>{row.deliverable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article id="workflow" className="section-panel">
            <h2>{t('服务流程', 'Service Workflow')}</h2>
            <ol className="product-step-list">
              {process.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>

          <article id="deliverables" className="section-panel">
            <h2>{t('交付内容', 'Deliverables')}</h2>
            <ul className="product-bullet-list">
              {deliverables.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </div>
  )
}
