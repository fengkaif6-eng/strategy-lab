import { useLocale } from '../context/LocaleContext'

type QuoteTier = {
  tier: string
  target: string
  scope: string
  price: string
  sla: string
}

type ValueAddedService = {
  item: string
  unit: string
  fee: string
  note: string
}

const TIER_ROWS_ZH: QuoteTier[] = [
  {
    tier: '基础版',
    target: '单一策略展示与基础路演',
    scope: '产品介绍页 + 单策略指标看板 + 标准FAQ',
    price: '¥12万 / 年',
    sla: '5个工作日内完成交付',
  },
  {
    tier: '专业版',
    target: '多策略组合讲解与月度复盘',
    scope: '产品介绍页 + 组合分析 + 月度归因报告 + 报价支持',
    price: '¥28万 / 年',
    sla: '7个工作日内完成交付',
  },
  {
    tier: '机构版',
    target: '机构级定制化服务',
    scope: '策略定制 + 客户分层路演 + 周度跟踪 + 专属答疑',
    price: '¥45万起 / 年',
    sla: '按项目排期，提供专属项目经理',
  },
]

const TIER_ROWS_EN: QuoteTier[] = [
  {
    tier: 'Standard',
    target: 'Single-strategy showcase and baseline pitching',
    scope: 'Intro page + single strategy dashboard + standard FAQ',
    price: 'CNY 120k / year',
    sla: 'Delivery within 5 business days',
  },
  {
    tier: 'Professional',
    target: 'Multi-strategy presentation with monthly review',
    scope: 'Intro page + portfolio analysis + monthly attribution + quote support',
    price: 'CNY 280k / year',
    sla: 'Delivery within 7 business days',
  },
  {
    tier: 'Institutional',
    target: 'Institutional-grade customization',
    scope: 'Custom strategy + segmented pitch + weekly tracking + dedicated Q&A',
    price: 'From CNY 450k / year',
    sla: 'Project-based scheduling with dedicated PM',
  },
]

const ADDON_ROWS_ZH: ValueAddedService[] = [
  {
    item: '深度归因报告',
    unit: '按策略 / 月',
    fee: '¥8,000',
    note: '含收益拆解、风险贡献与参数漂移追踪。',
  },
  {
    item: '客户专场路演',
    unit: '按场次',
    fee: '¥12,000',
    note: '支持线上/线下，提供讲稿和答疑素材。',
  },
  {
    item: '策略快速重算',
    unit: '按策略',
    fee: '¥5,000',
    note: '在既有框架下调整参数并更新核心指标。',
  },
]

const ADDON_ROWS_EN: ValueAddedService[] = [
  {
    item: 'Deep Attribution Report',
    unit: 'per strategy / month',
    fee: 'CNY 8,000',
    note: 'Includes return decomposition, risk contribution, and drift tracking.',
  },
  {
    item: 'Dedicated Client Pitch Session',
    unit: 'per session',
    fee: 'CNY 12,000',
    note: 'Supports online/offline delivery with scripts and Q&A pack.',
  },
  {
    item: 'Fast Strategy Re-run',
    unit: 'per strategy',
    fee: 'CNY 5,000',
    note: 'Parameter refresh and updated key metrics under existing framework.',
  },
]

const HIGHLIGHTS_ZH = [
  {
    title: '报价机制',
    text: '按年度服务包为主，支持阶段性增补。',
  },
  {
    title: '折扣规则',
    text: '同一客户签约两个及以上模块，可申请组合折扣。',
  },
  {
    title: '交付保障',
    text: '报价确认后锁定资源，支持标准SLA与里程碑验收。',
  },
]

const HIGHLIGHTS_EN = [
  {
    title: 'Pricing Model',
    text: 'Primarily annual service packages with optional phased add-ons.',
  },
  {
    title: 'Discount Rule',
    text: 'Bundle discounts available when two or more modules are contracted.',
  },
  {
    title: 'Delivery Assurance',
    text: 'Resources are locked after quote confirmation with SLA milestones.',
  },
]

const TERMS_ZH = [
  '以上报价为含服务但不含税参考价，正式价格以合同为准。',
  '定制化开发需求需经过评审，按人天另行核算。',
  '标准报价有效期为30天，超期需重新确认资源与排期。',
  '若涉及第三方数据授权费用，按实际发生额单独计费。',
]

const TERMS_EN = [
  'Pricing is indicative service fee before tax; contract terms prevail.',
  'Custom development requests are assessed separately and charged by effort.',
  'Standard quote validity is 30 days and may require re-confirmation after expiry.',
  'Third-party data license costs, if any, are charged at actuals.',
]

export function ProductQuotePage() {
  const { locale, t } = useLocale()

  const tierRows = locale === 'zh' ? TIER_ROWS_ZH : TIER_ROWS_EN
  const addonRows = locale === 'zh' ? ADDON_ROWS_ZH : ADDON_ROWS_EN
  const highlights = locale === 'zh' ? HIGHLIGHTS_ZH : HIGHLIGHTS_EN
  const terms = locale === 'zh' ? TERMS_ZH : TERMS_EN

  const navItems = [
    { id: 'tier-pricing', label: t('服务包报价', 'Package Pricing') },
    { id: 'addon-pricing', label: t('增值服务', 'Value-Added Services') },
    { id: 'terms', label: t('报价说明', 'Quotation Notes') },
    { id: 'apply', label: t('申请流程', 'Application Flow') },
  ]

  return (
    <div className="page-stack">
      <section className="section-panel">
        <h1>{t('产品报价', 'Product Quotes')}</h1>
        <p>
          {t(
            '报价模块提供标准服务包与增值服务清单，支持快速形成客户报价方案。',
            'The quote module provides standard packages and add-on services for fast client proposals.',
          )}
        </p>
      </section>

      <section className="product-summary-grid" aria-label={t('报价概览', 'Quote overview')}>
        {highlights.map((item) => (
          <article className="product-summary-card" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <div className="docs-layout">
        <aside className="docs-nav" aria-label={t('报价目录', 'Quote table of contents')}>
          {navItems.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </aside>

        <section className="docs-content">
          <article id="tier-pricing" className="section-panel">
            <h2>{t('服务包报价', 'Package Pricing')}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('服务包', 'Package')}</th>
                    <th>{t('适用场景', 'Use Case')}</th>
                    <th>{t('交付范围', 'Delivery Scope')}</th>
                    <th>{t('年度报价', 'Annual Price')}</th>
                    <th>{t('交付SLA', 'Delivery SLA')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tierRows.map((row) => (
                    <tr key={row.tier}>
                      <td>{row.tier}</td>
                      <td>{row.target}</td>
                      <td>{row.scope}</td>
                      <td>{row.price}</td>
                      <td>{row.sla}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article id="addon-pricing" className="section-panel">
            <h2>{t('增值服务', 'Value-Added Services')}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('增值项', 'Service Item')}</th>
                    <th>{t('计费单位', 'Billing Unit')}</th>
                    <th>{t('单价', 'Unit Fee')}</th>
                    <th>{t('说明', 'Notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {addonRows.map((row) => (
                    <tr key={row.item}>
                      <td>{row.item}</td>
                      <td>{row.unit}</td>
                      <td>{row.fee}</td>
                      <td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article id="terms" className="section-panel">
            <h2>{t('报价说明', 'Quotation Notes')}</h2>
            <ul className="product-bullet-list">
              {terms.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article id="apply" className="section-panel">
            <h2>{t('申请流程', 'Application Flow')}</h2>
            <ol className="product-step-list">
              <li>
                {t(
                  '填写客户需求：选择目标策略、服务包类型、预期上线时间。',
                  'Submit requirements: choose target strategy, package type, and expected launch timeline.',
                )}
              </li>
              <li>
                {t(
                  '报价评审：由策略与销售协同确认范围、资源和报价版本。',
                  'Quote review: strategy and sales teams align on scope, resource plan, and quote version.',
                )}
              </li>
              <li>
                {t(
                  '正式出具：生成标准报价单并进入合同流程。',
                  'Formal issuance: generate the official quotation and move into contract workflow.',
                )}
              </li>
            </ol>
          </article>
        </section>
      </div>
    </div>
  )
}
