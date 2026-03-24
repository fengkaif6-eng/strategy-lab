import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StrategyFormModal } from '../components/StrategyFormModal'
import { useStrategies } from '../context/StrategyContext'
import type { StrategyChannel, StrategyRecord } from '../types/strategy'
import { formatDate, formatPercent } from '../utils/format'

function statusLabel(status: StrategyRecord['status']) {
  if (status === 'active') {
    return '运行中'
  }
  if (status === 'paused') {
    return '已暂停'
  }
  return '已归档'
}

export function StrategyManagePage() {
  const { backtestStrategies, liveStrategies, upsertStrategy, deleteStrategy } =
    useStrategies()
  const [channel, setChannel] = useState<StrategyChannel>('backtest')
  const [keyword, setKeyword] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [editing, setEditing] = useState<StrategyRecord | undefined>(undefined)
  const [showModal, setShowModal] = useState(false)
  const deferredKeyword = useDeferredValue(keyword)

  const source = channel === 'backtest' ? backtestStrategies : liveStrategies

  const allTags = useMemo(() => {
    return Array.from(new Set(source.flatMap((item) => item.tags)))
  }, [source])

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

  const openCreate = () => {
    setEditing(undefined)
    setShowModal(true)
  }

  const openEdit = (strategy: StrategyRecord) => {
    setEditing(strategy)
    setShowModal(true)
  }

  const remove = (strategy: StrategyRecord) => {
    const confirmed = window.confirm(`确认删除策略「${strategy.name}」吗？`)
    if (!confirmed) {
      return
    }
    deleteStrategy(strategy.channel, strategy.id)
  }

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <h1>策略管理（管理员）</h1>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            新增策略
          </button>
        </div>
        <p className="manage-hint">
          在本页新增、编辑或删除策略，会同步更新到“孵化策略 / 已发布策略”板块。
        </p>
        <div className="tab-group" role="tablist" aria-label="策略板块切换">
          <button
            role="tab"
            aria-selected={channel === 'backtest'}
            className={channel === 'backtest' ? 'tab-active' : ''}
            onClick={() => setChannel('backtest')}
          >
            孵化策略
          </button>
          <button
            role="tab"
            aria-selected={channel === 'live'}
            className={channel === 'live' ? 'tab-active' : ''}
            onClick={() => setChannel('live')}
          >
            已发布策略
          </button>
        </div>
        <div className="toolbar">
          <label>
            搜索
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="策略名称/作者"
            />
          </label>
          <label>
            标签筛选
            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value="">全部标签</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label>
            快捷跳转
            <Link
              to={channel === 'backtest' ? '/incubation-strategies' : '/published-strategies'}
              className="btn btn-secondary manage-jump"
            >
              查看当前板块
            </Link>
          </label>
        </div>
      </section>

      {list.length === 0 ? (
        <section className="empty-panel">
          <h2>当前筛选条件下没有策略</h2>
          <p>可尝试清空筛选或新增策略。</p>
        </section>
      ) : (
        <section className="table-wrap" aria-label="策略管理列表">
          <table>
            <thead>
              <tr>
                <th>策略</th>
                <th>标签</th>
                <th>关键指标</th>
                <th>状态</th>
                <th>更新日期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((strategy) => (
                <tr key={strategy.id}>
                  <td>
                    <p className="cell-title">{strategy.name}</p>
                    <p className="cell-sub">{strategy.summary}</p>
                  </td>
                  <td>{strategy.tags.join(' / ')}</td>
                  <td>
                    {strategy.channel === 'backtest'
                      ? `年化 ${formatPercent(strategy.metrics.annualReturn)}`
                      : `累计 ${formatPercent(strategy.metrics.totalReturn)}`}
                  </td>
                  <td>{statusLabel(strategy.status)}</td>
                  <td>{formatDate(strategy.updatedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => openEdit(strategy)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => remove(strategy)}
                      >
                        删除
                      </button>
                      <Link
                        className="btn btn-secondary"
                        to={`/strategy/${strategy.channel}/${strategy.id}`}
                      >
                        详情
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
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
