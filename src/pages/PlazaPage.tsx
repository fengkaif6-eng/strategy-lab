import { useDeferredValue, useMemo, useState } from 'react'
import { StrategyCard } from '../components/StrategyCard'
import { useLocale } from '../context/LocaleContext'
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
  const { t } = useLocale()
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
            {t(
              `展示全部${channel === 'backtest' ? '孵化' : '已发布'}策略的关键指标与收益走势。`,
              `View key metrics and return curves for all ${
                channel === 'backtest' ? 'incubation' : 'published'
              } strategies.`,
            )}
          </p>
        </div>

        <div className="toolbar">
          <label>
            {t('搜索策略', 'Search')}
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('输入策略名或标签', 'Enter strategy name or tag')}
            />
          </label>

          <label>
            {t('风险等级', 'Risk Level')}
            <select
              value={riskFilter}
              onChange={(event) =>
                setRiskFilter(event.target.value as 'all' | 'low' | 'medium' | 'high')
              }
            >
              <option value="all">{t('全部', 'All')}</option>
              <option value="low">{t('低风险', 'Low')}</option>
              <option value="medium">{t('中风险', 'Medium')}</option>
              <option value="high">{t('高风险', 'High')}</option>
            </select>
          </label>

          <label>
            {t('排序', 'Sort')}
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortMode)}
            >
              <option value="updated">{t('按更新时间', 'By updated time')}</option>
              <option value="return">
                {channel === 'backtest'
                  ? t('按年化收益', 'By annual return')
                  : t('按累计收益', 'By total return')}
              </option>
            </select>
          </label>
        </div>
      </section>

      {list.length === 0 ? (
        <section className="empty-panel">
          <h2>{t('暂无匹配策略', 'No strategies found')}</h2>
          <p>{t('请调整筛选条件后重试。', 'Try adjusting filters and search keywords.')}</p>
        </section>
      ) : (
        <section className="card-grid" aria-label={`${title}${t('策略列表', ' strategy list')}`}>
          {list.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </section>
      )}
    </div>
  )
}

