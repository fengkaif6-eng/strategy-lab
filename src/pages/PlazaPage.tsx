import { useDeferredValue, useMemo, useState } from 'react'
import { StrategyCard } from '../components/StrategyCard'
import { useStrategies } from '../context/StrategyContext'
import type { StrategyChannel, StrategyRecord } from '../types/strategy'

interface PlazaPageProps {
  channel: StrategyChannel
  title: string
}

type SortMode = 'updated' | 'return'

function getPrimaryReturn(strategy: StrategyRecord): number {
  return strategy.channel === 'backtest'
    ? strategy.metrics.annualReturn
    : strategy.metrics.totalReturn
}

export function PlazaPage({ channel, title }: PlazaPageProps) {
  const { backtestStrategies, liveStrategies } = useStrategies()
  const source = channel === 'backtest' ? backtestStrategies : liveStrategies
  const [keyword, setKeyword] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [sortBy, setSortBy] = useState<SortMode>('updated')
  const deferredKeyword = useDeferredValue(keyword)

  const list = useMemo(() => {
    const query = deferredKeyword.trim().toLowerCase()
    const filtered = source.filter((item) => {
      const matchKeyword =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
      const matchRisk = riskFilter === 'all' || item.riskLevel === riskFilter
      return matchKeyword && matchRisk
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'return') {
        return getPrimaryReturn(b) - getPrimaryReturn(a)
      }
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  }, [deferredKeyword, riskFilter, sortBy, source])

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <h1>{title}</h1>
          <p>
            展示全部{channel === 'backtest' ? '孵化' : '已发布'}策略的关键指标与收益走势。
          </p>
        </div>
        <div className="toolbar">
          <label>
            搜索策略
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="输入策略名或标签"
            />
          </label>
          <label>
            风险等级
            <select
              value={riskFilter}
              onChange={(event) =>
                setRiskFilter(
                  event.target.value as 'all' | 'low' | 'medium' | 'high',
                )
              }
            >
              <option value="all">全部</option>
              <option value="low">低风险</option>
              <option value="medium">中风险</option>
              <option value="high">高风险</option>
            </select>
          </label>
          <label>
            排序
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortMode)}
            >
              <option value="updated">按更新时间</option>
              <option value="return">
                按{channel === 'backtest' ? '年化收益' : '累计收益'}
              </option>
            </select>
          </label>
        </div>
      </section>

      {list.length === 0 ? (
        <section className="empty-panel">
          <h2>暂无匹配策略</h2>
          <p>请调整筛选条件后重试。</p>
        </section>
      ) : (
        <section className="card-grid" aria-label={`${title}策略列表`}>
          {list.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </section>
      )}
    </div>
  )
}
