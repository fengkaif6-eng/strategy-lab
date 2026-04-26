import { NavLink } from 'react-router-dom'
import { useLocale } from '../context/LocaleContext'

export type AboutSectionKey = 'market-insights' | 'business-updates' | 'team-profile'

type AboutSectionContent = {
  path: string
  labelZh: string
  labelEn: string
  titleZh: string
  titleEn: string
  introZh: string
  introEn: string
  bulletsZh: string[]
  bulletsEn: string[]
}

const ABOUT_SECTIONS: Record<AboutSectionKey, AboutSectionContent> = {
  'market-insights': {
    path: '/about-us/market-insights',
    labelZh: '市场洞察',
    labelEn: 'Market Insights',
    titleZh: '市场洞察',
    titleEn: 'Market Insights',
    introZh:
      '围绕利率、信用、商品与汇率等关键变量，输出可用于客户沟通和策略演示的结构化市场观点。',
    introEn:
      'We provide structured views on rates, credit, commodities, and FX for client communication and strategy presentation.',
    bulletsZh: [
      '核心资产价格与波动率跟踪',
      '宏观事件驱动与情景推演',
      '固收策略相关性与风险提示',
    ],
    bulletsEn: [
      'Core asset pricing and volatility tracking',
      'Macro event-driven scenario analysis',
      'Fixed-income strategy correlation and risk notes',
    ],
  },
  'business-updates': {
    path: '/about-us/business-updates',
    labelZh: '业务动态',
    labelEn: 'Business Updates',
    titleZh: '业务动态',
    titleEn: 'Business Updates',
    introZh:
      '持续更新策略展业进展、交付节奏与阶段成果，帮助团队统一口径并对外传递稳定服务能力。',
    introEn:
      'We continuously update business progress, delivery cadence, and milestone outcomes to keep communication consistent.',
    bulletsZh: [
      '重点客户项目推进状态',
      '策略服务交付节奏追踪',
      '阶段复盘与优化动作同步',
    ],
    bulletsEn: [
      'Key client project progress status',
      'Service delivery cadence tracking',
      'Milestone reviews and optimization actions',
    ],
  },
  'team-profile': {
    path: '/about-us/team-profile',
    labelZh: '团队简介',
    labelEn: 'Team Profile',
    titleZh: '团队简介',
    titleEn: 'Team Profile',
    introZh:
      '团队由策略研究、产品运营与客户服务协同构成，覆盖从模型验证到客户陪伴的全流程能力。',
    introEn:
      'The team combines strategy research, product operations, and client service across the full lifecycle.',
    bulletsZh: [
      '研究、产品、服务协同机制',
      '策略方法论沉淀与复盘体系',
      '面向机构客户的长期服务经验',
    ],
    bulletsEn: [
      'Research, product, and service collaboration',
      'Methodology accumulation and review framework',
      'Long-term experience serving institutional clients',
    ],
  },
}

const ABOUT_SECTION_ORDER: AboutSectionKey[] = [
  'market-insights',
  'business-updates',
  'team-profile',
]

interface AboutSectionPageProps {
  section: AboutSectionKey
}

export function AboutSectionPage({ section }: AboutSectionPageProps) {
  const { locale, t } = useLocale()
  const current = ABOUT_SECTIONS[section]
  const bullets = locale === 'zh' ? current.bulletsZh : current.bulletsEn

  return (
    <div className="page-stack">
      <section className="section-panel">
        <h1>{t('关于我们', 'About Us')}</h1>
        <p>
          {t(
            '聚焦研究观点、业务进展与团队能力，形成统一、专业、可持续的对外表达体系。',
            'A focused overview of research views, business progress, and team capability for consistent external communication.',
          )}
        </p>
      </section>

      <div className="docs-layout">
        <aside className="docs-nav" aria-label={t('关于我们目录', 'About us table of contents')}>
          {ABOUT_SECTION_ORDER.map((key) => {
            const item = ABOUT_SECTIONS[key]
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  isActive ? 'docs-nav-link docs-nav-link-active' : 'docs-nav-link'
                }
              >
                {locale === 'zh' ? item.labelZh : item.labelEn}
              </NavLink>
            )
          })}
        </aside>

        <section className="docs-content">
          <article className="section-panel">
            <h2>{locale === 'zh' ? current.titleZh : current.titleEn}</h2>
            <p>{locale === 'zh' ? current.introZh : current.introEn}</p>
            <ul className="product-bullet-list">
              {bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </div>
  )
}
