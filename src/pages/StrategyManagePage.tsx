import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StrategyFormModal } from '../components/StrategyFormModal'
import { useLocale } from '../context/LocaleContext'
import { useStrategies } from '../context/StrategyContext'
import type { StrategyChannel, StrategyRecord } from '../types/strategy'
import { formatDate, formatPercent, formatSigned } from '../utils/format'
import { isBpStrategy } from '../utils/strategyMetrics'

function statusLabel(status: StrategyRecord['status']) {
  if (status === 'active') {
    return '运行中'
  }
  if (status === 'paused') {
    return '已暂停'
  }
  return '已归档'
}

const STRATEGY_CHANNELS: StrategyChannel[] = ['backtest', 'live', 'thirdparty']

function channelLabel(
  channel: StrategyChannel,
  t: (zhText: string, enText: string) => string,
) {
  if (channel === 'backtest') {
    return t('孵化策略', 'Incubation')
  }
  if (channel === 'live') {
    return t('已发布策略', 'Published')
  }
  return t('第三方策略', 'Third-Party')
}

type ManageView = 'list' | 'home'

export function StrategyManagePage() {
  const { t } = useLocale()
  const {
    isLoading,
    backtestStrategies,
    liveStrategies,
    thirdpartyStrategies,
    upsertStrategy,
    deleteStrategy,
    moveStrategy,
  } = useStrategies()

  const [channel, setChannel] = useState<StrategyChannel>('backtest')
  const [view, setView] = useState<ManageView>('list')
  const [keyword, setKeyword] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [editing, setEditing] = useState<StrategyRecord | undefined>(undefined)
  const [showModal, setShowModal] = useState(false)
  const [movingKey, setMovingKey] = useState<string | null>(null)
  const [openTransferKey, setOpenTransferKey] = useState<string | null>(null)

  const deferredKeyword = useDeferredValue(keyword)

  const source = useMemo(() => {
    if (channel === 'backtest') {
      return backtestStrategies
    }
    if (channel === 'live') {
      return liveStrategies
    }
    return thirdpartyStrategies
  }, [backtestStrategies, channel, liveStrategies, thirdpartyStrategies])

  const allStrategies = useMemo(
    () =>
      [...backtestStrategies, ...liveStrategies, ...thirdpartyStrategies].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    [backtestStrategies, liveStrategies, thirdpartyStrategies],
  )

  const allTags = useMemo(
    () => Array.from(new Set(source.flatMap((item) => item.tags))),
    [source],
  )

  const list = useMemo(() => {
    const query = deferredKeyword.trim().toLowerCase()
    return source.filter((item) => {
      const matchesKeyword =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.author.toLowerCase().includes(query)
      const matchesTag = tagFilter.length === 0 || item.tags.includes(tagFilter)
      return matchesKeyword && matchesTag
    })
  }, [deferredKeyword, source, tagFilter])

  const homeDisplayList = useMemo(() => {
    const query = deferredKeyword.trim().toLowerCase()
    return allStrategies.filter((item) => {
      if (query.length === 0) {
        return true
      }
      return (
        item.name.toLowerCase().includes(query) ||
        item.author.toLowerCase().includes(query) ||
        item.summary.toLowerCase().includes(query)
      )
    })
  }, [allStrategies, deferredKeyword])

  const openCreate = () => {
    setEditing(undefined)
    setShowModal(true)
  }

  const openEdit = (strategy: StrategyRecord) => {
    setEditing(strategy)
    setShowModal(true)
  }

  const remove = async (strategy: StrategyRecord) => {
    const confirmed = window.confirm(
      t(`确认删除策略「${strategy.name}」吗？`, `Delete strategy "${strategy.name}"?`),
    )
    if (!confirmed) {
      return
    }
    try {
      await deleteStrategy(strategy.channel, strategy.id)
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : t('删除失败，请稍后重试。', 'Delete failed. Please try again later.')
      window.alert(message)
    }
  }

  const moveToChannel = async (
    strategy: StrategyRecord,
    targetChannel: StrategyChannel,
  ) => {
    if (strategy.channel === targetChannel) {
      return
    }
    const fromLabel = channelLabel(strategy.channel, t)
    const toLabel = channelLabel(targetChannel, t)
    const confirmed = window.confirm(
      t(
        `确认将策略「${strategy.name}」从${fromLabel}移动到${toLabel}吗？`,
        `Move strategy "${strategy.name}" from ${fromLabel} to ${toLabel}?`,
      ),
    )
    if (!confirmed) {
      return
    }

    const key = `${strategy.channel}:${strategy.id}`
    setMovingKey(key)
    try {
      await moveStrategy(strategy.channel, targetChannel, strategy.id)
      setOpenTransferKey(null)
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : t('移动失败，请稍后重试。', 'Move failed. Please try again later.')
      window.alert(message)
    } finally {
      setMovingKey(null)
    }
  }

  const toggleHomeDisplay = async (strategy: StrategyRecord) => {
    const nextFlag = !strategy.showOnHome
    try {
      await upsertStrategy({
        ...strategy,
        showOnHome: nextFlag,
        updatedAt: new Date().toISOString().slice(0, 10),
      })
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : t('首页展示设置保存失败，请稍后重试。', 'Failed to save homepage display setting.')
      window.alert(message)
    }
  }

  useEffect(() => {
    if (!openTransferKey) {
      return
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest('.strategy-manage-transfer')) {
        return
      }
      setOpenTransferKey(null)
    }
    window.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [openTransferKey])

  const currentChannelRoute =
    channel === 'backtest'
      ? '/incubation-strategies'
      : channel === 'live'
        ? '/published-strategies'
        : '/third-party-strategies'

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
          <h1>{t('策略管理（管理员）', 'Strategy Management (Admin)')}</h1>
          {view === 'list' ? (
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              {t('新增策略', 'Create Strategy')}
            </button>
          ) : (
            <span className="section-head-note">
              {t('勾选后将在首页“策略示例”中优先展示。', 'Selected strategies will be shown on the homepage first.')}
            </span>
          )}
        </div>

        <div className="tab-group" role="tablist" aria-label={t('策略管理视图切换', 'Strategy management view switch')}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={view === 'list' ? 'tab-active' : ''}
            onClick={() => setView('list')}
          >
            {t('策略列表', 'Strategy List')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'home'}
            className={view === 'home' ? 'tab-active' : ''}
            onClick={() => setView('home')}
          >
            {t('首页展示设置', 'Homepage Display')}
          </button>
        </div>

        {view === 'list' ? (
          <div className="tab-group" role="tablist" aria-label={t('策略板块切换', 'Strategy channel switch')}>
            <button
              type="button"
              role="tab"
              aria-selected={channel === 'backtest'}
              className={channel === 'backtest' ? 'tab-active' : ''}
              onClick={() => setChannel('backtest')}
            >
              {t('孵化策略', 'Incubation')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={channel === 'live'}
              className={channel === 'live' ? 'tab-active' : ''}
              onClick={() => setChannel('live')}
            >
              {t('已发布策略', 'Published')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={channel === 'thirdparty'}
              className={channel === 'thirdparty' ? 'tab-active' : ''}
              onClick={() => setChannel('thirdparty')}
            >
              {t('第三方策略', 'Third-Party')}
            </button>
          </div>
        ) : null}

        <div className="toolbar">
          <label>
            {t('搜索', 'Search')}
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('策略名称/作者', 'Strategy name / author')}
            />
          </label>
          {view === 'list' ? (
            <>
              <label>
                {t('标签筛选', 'Tag Filter')}
                <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                  <option value="">{t('全部标签', 'All tags')}</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('快捷跳转', 'Quick Jump')}
                <Link to={currentChannelRoute} className="btn btn-secondary manage-jump">
                  {t('查看当前板块', 'Open current channel')}
                </Link>
              </label>
            </>
          ) : (
            <label>
              {t('当前已选', 'Currently selected')}
              <div className="btn btn-secondary manage-jump">
                {homeDisplayList.filter((item) => item.showOnHome).length}
              </div>
            </label>
          )}
        </div>
      </section>

      {view === 'home' ? (
        homeDisplayList.length === 0 ? (
          <section className="empty-panel">
            <h2>{t('当前没有可设置的策略', 'No strategies available for homepage display')}</h2>
            <p>{t('可尝试调整搜索条件。', 'Try adjusting the search term.')}</p>
          </section>
        ) : (
          <section className="table-wrap" aria-label={t('首页展示策略设置', 'Homepage strategy display settings')}>
            <table className="strategy-manage-table">
              <colgroup>
                <col className="strategy-manage-col-main" />
                <col className="strategy-manage-col-tags" />
                <col className="strategy-manage-col-status" />
                <col className="strategy-manage-col-date" />
                <col className="strategy-manage-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('策略', 'Strategy')}</th>
                  <th>{t('所属板块', 'Channel')}</th>
                  <th>{t('当前状态', 'Current State')}</th>
                  <th>{t('更新日期', 'Updated')}</th>
                  <th>{t('首页展示', 'Homepage Display')}</th>
                </tr>
              </thead>
              <tbody>
                {homeDisplayList.map((strategy) => (
                  <tr key={`${strategy.channel}:${strategy.id}`}>
                    <td className="strategy-manage-main-cell">
                      <p className="cell-title">{strategy.name}</p>
                      <p className="cell-sub">{strategy.summary}</p>
                    </td>
                    <td>{channelLabel(strategy.channel, t)}</td>
                    <td>{strategy.showOnHome ? t('已展示', 'Shown') : t('未展示', 'Hidden')}</td>
                    <td>{formatDate(strategy.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          void toggleHomeDisplay(strategy)
                        }}
                      >
                        {strategy.showOnHome
                          ? t('取消首页展示', 'Remove from homepage')
                          : t('设为首页展示', 'Show on homepage')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      ) : list.length === 0 ? (
        <section className="empty-panel">
          <h2>{t('当前筛选条件下没有策略', 'No strategy under current filters')}</h2>
          <p>{t('可尝试清空筛选或新增策略。', 'Try clearing filters or adding a new strategy.')}</p>
        </section>
      ) : (
        <section className="table-wrap" aria-label={t('策略管理列表', 'Strategy management table')}>
          <table className="strategy-manage-table">
            <colgroup>
              <col className="strategy-manage-col-main" />
              <col className="strategy-manage-col-tags" />
              <col className="strategy-manage-col-metric" />
              <col className="strategy-manage-col-status" />
              <col className="strategy-manage-col-date" />
              <col className="strategy-manage-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('策略', 'Strategy')}</th>
                <th>{t('标签', 'Tags')}</th>
                <th>{t('关键指标', 'Key Metric')}</th>
                <th>{t('状态', 'Status')}</th>
                <th>{t('更新日期', 'Updated')}</th>
                <th>{t('操作', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((strategy) => {
                const key = `${strategy.channel}:${strategy.id}`
                const isMoving = movingKey === key
                const transferOpen = openTransferKey === key
                const candidateChannels = STRATEGY_CHANNELS.filter(
                  (candidate) => candidate !== strategy.channel,
                )
                const strategyMetrics = strategy.metrics as unknown as Record<string, unknown>
                const bpCumulativeReturn =
                  typeof strategyMetrics.cumulativeReturnBp === 'number' &&
                  Number.isFinite(strategyMetrics.cumulativeReturnBp)
                    ? strategyMetrics.cumulativeReturnBp
                    : null

                return (
                  <tr key={strategy.id}>
                    <td className="strategy-manage-main-cell">
                      <p className="cell-title">{strategy.name}</p>
                      <p className="cell-sub">{strategy.summary}</p>
                    </td>
                    <td>{strategy.tags.join(' / ')}</td>
                    <td>
                      {isBpStrategy(strategy) && bpCumulativeReturn !== null
                        ? `${t('累计(bp)', 'Cumulative (bp)')} ${formatSigned(bpCumulativeReturn)} bp`
                        : strategy.channel === 'live'
                        ? `${t('累计', 'Total')} ${formatPercent(strategy.metrics.totalReturn)}`
                        : `${t('年化', 'Annual')} ${formatPercent(strategy.metrics.annualReturn)}`}
                    </td>
                    <td>{statusLabel(strategy.status)}</td>
                    <td>{formatDate(strategy.updatedAt)}</td>
                    <td>
                      <div className="table-actions strategy-manage-actions-row">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={isMoving}
                          onClick={() => openEdit(strategy)}
                        >
                          {t('编辑', 'Edit')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={isMoving}
                          onClick={() => {
                            void remove(strategy)
                          }}
                        >
                          {t('删除', 'Delete')}
                        </button>
                        <Link className="btn btn-secondary" to={`/strategy/${strategy.channel}/${strategy.id}`}>
                          {t('详情', 'Details')}
                        </Link>
                        <div className="strategy-manage-transfer">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={isMoving}
                            onClick={() => {
                              setOpenTransferKey((current) => (current === key ? null : key))
                            }}
                          >
                            {t('转换', 'Transfer')}
                          </button>
                          {transferOpen ? (
                            <div className="strategy-manage-transfer-menu" role="menu">
                              {candidateChannels.map((candidate) => (
                                <button
                                  key={`${strategy.id}-${candidate}`}
                                  type="button"
                                  className="btn btn-secondary strategy-manage-transfer-item"
                                  disabled={isMoving}
                                  onClick={() => {
                                    void moveToChannel(strategy, candidate)
                                  }}
                                >
                                  {t('转到', 'Move to')} {channelLabel(candidate, t)}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {showModal && (
        <StrategyFormModal
          key={`${channel}-${editing?.id ?? 'new'}`}
          channel={channel}
          editing={editing}
          onClose={() => setShowModal(false)}
          onSubmit={upsertStrategy}
        />
      )}
    </div>
  )
}

