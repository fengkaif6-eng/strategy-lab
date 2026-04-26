import { useDeferredValue, useMemo, useState } from 'react'
import { StrategyCard } from '../components/StrategyCard'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useStrategies } from '../context/StrategyContext'
import type { StrategyChannel, StrategyRecord } from '../types/strategy'

interface PlazaPageProps {
  channel: StrategyChannel
  title: string
}

type SortMode = 'updated' | 'return'

function getPrimaryReturn(strategy: StrategyRecord): number {
  if (strategy.channel === 'backtest' || strategy.channel === 'thirdparty') {
    return strategy.metrics.annualReturn
  }
  return strategy.metrics.totalReturn
}

export function PlazaPage({ channel, title }: PlazaPageProps) {
  const { t } = useLocale()
  const { canAccessChannel, canAccessStrategy } = useAuth()
  const { isLoading, backtestStrategies, liveStrategies, thirdpartyStrategies } = useStrategies()
  const baseSource = useMemo(() => {
    if (channel === 'backtest') {
      return backtestStrategies
    }
    if (channel === 'live') {
      return liveStrategies
    }
    return thirdpartyStrategies
  }, [backtestStrategies, channel, liveStrategies, thirdpartyStrategies])
  const source = useMemo(
    () =>
      baseSource.filter((item) => canAccessStrategy(item.channel, item.id)),
    [baseSource, canAccessStrategy],
  )

  const [keyword, setKeyword] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>(
    'all',
  )
  const [sortBy, setSortBy] = useState<SortMode>('updated')
  const deferredKeyword = useDeferredValue(keyword)

  const hasChannelAccess = canAccessChannel(channel)

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

  if (!hasChannelAccess) {
    return (
      <section className="empty-panel">
        <h1>{t('当前账号未获授权访问该板块', 'This channel is not assigned to your account.')}</h1>
        <p>
          {t(
            '请联系管理员分配孵化策略/已发布策略访问权限，或按策略粒度授权。',
            'Please contact admin to grant channel or strategy-level permissions.',
          )}
        </p>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className="empty-panel">
        <h1>{t('策略加载中...', 'Loading strategies...')}</h1>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <h1>{title}</h1>
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
                {channel === 'backtest' || channel === 'thirdparty'
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
          <p>
            {t(
              '当前筛选条件下无结果，或你尚未被授权到具体策略。',
              'No result under current filters, or no strategy-level permission assigned yet.',
            )}
          </p>
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
