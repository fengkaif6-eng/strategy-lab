const sections = [
  {
    id: 'quick-start',
    title: '快速开始',
    content: [
      '1. 进入策略管理页面新增策略并录入核心参数。',
      '2. 在回测广场查看年化收益、夏普比率、最大回撤等指标。',
      '3. 当策略满足目标后，再迁移到实盘广场持续跟踪。',
    ],
  },
  {
    id: 'metrics',
    title: '指标说明',
    content: [
      '年化收益：策略收益折算成年化后的表现，用于跨周期对比。',
      '夏普比率：单位风险下获得的超额收益，越高越好。',
      '最大回撤：历史净值从峰值到谷值的最大跌幅，反映抗风险能力。',
      'Alpha：相对于基准的超额收益，衡量策略是否真正创造价值。',
    ],
  },
  {
    id: 'lifecycle',
    title: '策略生命周期',
    content: [
      '草稿：在策略管理中配置参数和规则，并完成初步检查。',
      '回测：在回测广场验证策略稳定性和极端行情表现。',
      '实盘：上线后持续监控收益、回撤和执行偏差。',
      '复盘：定期迭代参数或逻辑，保留版本演进记录。',
    ],
  },
  {
    id: 'faq',
    title: '常见问题',
    content: [
      'Q: 为什么策略在回测和实盘结果不同？',
      'A: 实盘包含滑点、成交延迟和市场冲击，通常会比回测保守。',
      'Q: 第一版数据是否和券商账户联动？',
      'A: 当前版本使用本地演示数据，后续可扩展为真实接口。',
    ],
  },
]

export function HelpDocsPage() {
  return (
    <div className="page-stack">
      <section className="section-panel">
        <h1>帮助文档</h1>
        <p>覆盖从策略创建、回测评估到实盘跟踪的关键使用说明。</p>
      </section>
      <div className="docs-layout">
        <aside className="docs-nav" aria-label="文档目录">
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
