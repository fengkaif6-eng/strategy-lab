import type { StrategyCollection, StrategyRecord } from '../types/strategy'

interface StrategyTextOverride {
  name: string
  author: string
  tags: string[]
  summary: string
  description: string
  logic: string
  riskNotes: string[]
}

const OVERRIDES_BY_ID: Record<string, StrategyTextOverride> = {
  'bt-001': {
    name: '沪深300趋势动量',
    author: '量研团队A',
    tags: ['趋势', '中频', '指数增强'],
    summary: '结合均线趋势与行业相对强弱，在回撤控制下做指数增强。',
    description: '策略在指数上行阶段保持较高仓位，在震荡阶段自动收缩仓位并提高防御资产占比。',
    logic: '20日与60日均线判定趋势，叠加行业轮动强度排序，每周调仓。',
    riskNotes: ['对快速反转行情敏感', '行业集中度上限30%', '极端波动日可能降低仓位'],
  },
  'bt-002': {
    name: '小市值质量轮动',
    author: '量研团队B',
    tags: ['轮动', '小盘', '财务因子'],
    summary: '在小盘股池内筛选高ROE低负债标的，按月度节奏换仓。',
    description: '高弹性策略，通过基本面质量过滤提升小盘股组合的稳定性与持续性。',
    logic: 'PE分位过滤 + ROE排名 + 现金流稳定度评分，每月首个交易日调仓。',
    riskNotes: ['高换手可能增加冲击成本', '流动性约束需严格执行', '风格切换时波动较大'],
  },
  'bt-003': {
    name: '防御红利低波',
    author: '量研团队C',
    tags: ['红利', '低波', '稳健'],
    summary: '选择高分红与稳定现金流企业，强调组合波动控制。',
    description: '以低波因子和分红持续性为核心，适合震荡市场中的防御型配置。',
    logic: '股息率排名 + 低波打分 + 现金流覆盖率过滤，双月调仓。',
    riskNotes: ['单边上涨时可能跑输成长风格', '组合集中在高分红行业', '分红政策变化可能影响收益'],
  },
  'bt-004': {
    name: 'AI情绪择时',
    author: '量研团队D',
    tags: ['择时', '情绪', '事件驱动'],
    summary: '融合新闻情绪与市场宽度信号进行仓位择时。',
    description: '通过文本情绪指数与盘口宽度数据驱动仓位动态调整，在风险事件前主动降杠杆。',
    logic: '日度情绪指数 + 市场宽度阈值 + 成交额扩散模型，每日一次调整。',
    riskNotes: ['情绪模型存在噪声风险', '突发事件可能导致滑点放大', '需监控模型漂移'],
  },
  'lv-101': {
    name: '沪深300趋势动量-实盘',
    author: '量研团队A',
    tags: ['趋势', '实盘', '指数增强'],
    summary: '回测策略已上线实盘，主要执行指数增强与防御切换。',
    description: '在真实交易中执行周频调仓，并结合风控阈值做仓位调整。',
    logic: '趋势判断 + 行业轮动 + 盘中风控阈值触发。',
    riskNotes: ['风控阈值触发后会降低持仓', '成交量低时执行偏差上升'],
  },
  'lv-102': {
    name: '中证500波段突破-实盘',
    author: '量研团队E',
    tags: ['波段', '突破', '中盘'],
    summary: '中证500成分股波段突破策略，当前以成长行业为主。',
    description: '适合趋势延续行情，仓位切换速度快，收益弹性较高。',
    logic: '20日新高突破 + 成交量确认 + ATR止损机制。',
    riskNotes: ['突破失败会导致连续小亏', '对成交量数据质量敏感'],
  },
  'lv-103': {
    name: '行业轮动稳健组合-实盘',
    author: '量研团队F',
    tags: ['行业轮动', '稳健', '低波'],
    summary: '行业轮动稳健组合，当前处于策略维护窗口。',
    description: '关注防御行业轮动机会，保持较低波动和稳定收益曲线。',
    logic: '行业景气评分 + 波动率约束 + 组合风险预算。',
    riskNotes: ['暂停期间不进行新开仓', '行业景气变化可能带来再平衡压力'],
  },
  'lv-104': {
    name: '事件套利快反组合-实盘',
    author: '量研团队G',
    tags: ['事件驱动', '快反', '套利'],
    summary: '针对公告事件与异动盘口的快反套利，强调执行质量。',
    description: '以事件触发信号为主，持仓周期较短，依赖高质量执行与风控。',
    logic: '公告情绪评分 + 异动成交量 + 盘口冲击成本模型。',
    riskNotes: ['事件拥挤时收益衰减明显', '依赖盘口质量，需控制滑点'],
  },
}

const MOJIBAKE_MARKERS = [
  '鍛',
  '绛',
  '娴',
  '閺',
  '鏉',
  '缁',
  '杩',
  '銆',
  '锛',
  '鈥',
  '闄',
  '锟',
]

function looksCorrupted(value: string | null | undefined) {
  if (!value) {
    return false
  }
  if (value.includes('�') || /[\uE000-\uF8FF]/.test(value)) {
    return true
  }
  let hits = 0
  for (const marker of MOJIBAKE_MARKERS) {
    if (value.includes(marker)) {
      hits += 1
      if (hits >= 2) {
        return true
      }
    }
  }
  return false
}

function withFallback(original: string, fallback: string) {
  return looksCorrupted(original) ? fallback : original
}

function sanitizeTextArray(values: string[], fallbacks: string[]) {
  return values.map((value, index) => withFallback(value, fallbacks[index] ?? value))
}

export function sanitizeStrategyRecord<T extends StrategyRecord>(record: T): T {
  const fallback = OVERRIDES_BY_ID[record.id]
  if (!fallback) {
    return record
  }

  return {
    ...record,
    name: withFallback(record.name, fallback.name),
    author: withFallback(record.author, fallback.author),
    tags: sanitizeTextArray(record.tags, fallback.tags),
    summary: withFallback(record.summary, fallback.summary),
    detail: {
      ...record.detail,
      description: withFallback(record.detail.description, fallback.description),
      logic: withFallback(record.detail.logic, fallback.logic),
      riskNotes: sanitizeTextArray(record.detail.riskNotes, fallback.riskNotes),
      attachments: record.detail.attachments.map((attachment) => ({
        ...attachment,
        title: looksCorrupted(attachment.title) ? '策略附件' : attachment.title,
        note: attachment.note ? withFallback(attachment.note, '') : attachment.note,
      })),
    },
  }
}

export function sanitizeStrategyCollection(collection: StrategyCollection): StrategyCollection {
  return {
    backtest: collection.backtest.map((item) => sanitizeStrategyRecord(item)),
    live: collection.live.map((item) => sanitizeStrategyRecord(item)),
    thirdparty: collection.thirdparty.map((item) => sanitizeStrategyRecord(item)),
  }
}
