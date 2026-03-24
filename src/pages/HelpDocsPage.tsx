const sections = [
  {
    id: 'quick-start',
    title: '快速开始',
    content: [
      '1. 注册并登录后，可访问孵化策略、已发布策略和 FAQ。',
      '2. 管理员可在策略管理中维护策略，更新后会同步到对应展示板块。',
      '3. 在策略详情可查看收益/回撤曲线，管理员可维护策略附件链接。',
    ],
  },
  {
    id: 'metrics',
    title: '指标说明',
    content: [
      '年化收益：策略收益折算到年度后的表现，便于跨周期比较。',
      '夏普比率：单位风险下的超额收益，越高越好。',
      '最大回撤：净值从峰值到谷值的最大跌幅，衡量抗风险能力。',
      'Alpha：相对基准的超额收益，用于衡量策略主动贡献。',
    ],
  },
  {
    id: 'lifecycle',
    title: '策略生命周期',
    content: [
      '孵化阶段：验证参数有效性、稳定性和风控阈值。',
      '发布阶段：上线后跟踪收益、回撤、执行偏差和持续性表现。',
      '复盘阶段：结合附件与历史指标迭代优化策略。',
    ],
  },
  {
    id: 'faq',
    title: '常见问题',
    content: [
      'Q: 为什么孵化策略和已发布策略的结果不一样？',
      'A: 已发布策略会受到真实交易执行、滑点和时延影响，通常更保守。',
      'Q: 游客为什么看不到策略板块？',
      'A: 游客仅可访问首页，需注册登录后才可访问策略相关页面。',
      'Q: 为什么我无法看到策略管理？',
      'A: 策略管理仅对管理员角色开放。',
    ],
  },
]

export function HelpDocsPage() {
  return (
    <div className="page-stack">
      <section className="section-panel">
        <h1>FAQ</h1>
        <p>覆盖平台权限、指标定义、策略生命周期与常见使用问题。</p>
      </section>
      <div className="docs-layout">
        <aside className="docs-nav" aria-label="FAQ目录">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </aside>
        <section className="docs-content">
          {sections.map((section) => (
            <article key={section.id} id={section.id} className="section-panel">
              <h2>{section.title}</h2>
              {section.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}
