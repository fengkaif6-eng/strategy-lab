import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useStrategies } from '../context/StrategyContext'
import type { CurvePoint, StrategyChannel, StrategyRecord } from '../types/strategy'
import { formatDateInputDisplay, sanitizeDateInput } from '../utils/dateInput'
import { buildEquityAxisScale } from '../utils/chartAxis'
import { formatDate, formatPercent } from '../utils/format'
import {
  getCompareMetricDisplayValue,
  getCompareMetricRawValue,
  getCompareMetricRows,
} from '../utils/strategyMetrics'

type ChannelFilter = 'all' | StrategyChannel
type CurveField = 'equityCurve' | 'drawdownCurve'
type NumericComparator = 'gte' | 'lte'

interface CurveRow {
  date: string
  [strategyId: string]: number | string | undefined
}

const curveColors = ['#d4a340', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#22d3ee', '#f97316']

function channelLabel(channel: StrategyChannel, t: (zhText: string, enText: string) => string) {
  if (channel === 'backtest') {
    return t('孵化策略', 'Incubation')
  }
  if (channel === 'live') {
    return t('已发布策略', 'Published')
  }
  return t('第三方策略', 'Third-Party')
}

function toCurveDateTimestamp(value: string): number | null {
  const normalized = value.trim().replace(/\//g, '-')
  if (!normalized) {
    return null
  }

  if (/^\d{4}-\d{1,2}$/.test(normalized)) {
    const [year, month] = normalized.split('-')
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-01T00:00:00`)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime()
    }
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-')
    const parsed = new Date(
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`,
    )
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime()
    }
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.getTime()
}

function normalizeDateRange(
  startTimestamp: number | null,
  endTimestamp: number | null,
) {
  if (startTimestamp !== null && endTimestamp !== null && startTimestamp > endTimestamp) {
    return {
      startTimestamp: endTimestamp,
      endTimestamp: startTimestamp,
    }
  }
  return {
    startTimestamp,
    endTimestamp,
  }
}

function filterCurvePointsByDateRange(
  points: CurvePoint[],
  comparisonStartTimestamp: number | null,
  comparisonEndTimestamp: number | null,
) {
  if (comparisonStartTimestamp === null && comparisonEndTimestamp === null) {
    return points
  }

  const hasParsableDate = points.some(
    (point) => toCurveDateTimestamp(point.date) !== null,
  )
  if (!hasParsableDate) {
    return points
  }

  return points.filter((point) => {
    const timestamp = toCurveDateTimestamp(point.date)
    if (timestamp === null) {
      return false
    }

    if (comparisonStartTimestamp !== null && timestamp < comparisonStartTimestamp) {
      return false
    }

    if (comparisonEndTimestamp !== null && timestamp > comparisonEndTimestamp) {
      return false
    }

    return true
  })
}

function formatNetValue(value: number) {
  if (!Number.isFinite(value)) {
    return '--'
  }
  const abs = Math.abs(value)
  if (abs >= 100) {
    return value.toFixed(0)
  }
  if (abs >= 10) {
    return value.toFixed(2)
  }
  if (abs >= 1) {
    return value.toFixed(3)
  }
  return value.toFixed(4)
}

function buildCurveRows(
  strategies: StrategyRecord[],
  field: CurveField,
  comparisonStartTimestamp: number | null,
  comparisonEndTimestamp: number | null,
): CurveRow[] {
  const byDate = new Map<string, CurveRow>()

  strategies.forEach((strategy) => {
    const points: CurvePoint[] = filterCurvePointsByDateRange(
      strategy.detail[field],
      comparisonStartTimestamp,
      comparisonEndTimestamp,
    )
    points.forEach((point) => {
      const existing = byDate.get(point.date)
      if (existing) {
        existing[strategy.id] = point.value
        return
      }
      byDate.set(point.date, {
        date: point.date,
        [strategy.id]: point.value,
      })
    })
  })

  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date))
}

function parsePercentInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed / 100
}

function compareNumber(left: number, right: number, comparator: NumericComparator) {
  return comparator === 'gte' ? left >= right : left <= right
}

export function StrategyComparePage() {
  const { t } = useLocale()
  const { canAccessStrategy } = useAuth()
  const { isLoading, backtestStrategies, liveStrategies, thirdpartyStrategies } = useStrategies()

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [searchKeyword, setSearchKeyword] = useState('')

  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [comparisonStartDate, setComparisonStartDate] = useState('')
  const [comparisonEndDate, setComparisonEndDate] = useState('')
  const [winRateComparator, setWinRateComparator] = useState<NumericComparator>('gte')
  const [winRateThreshold, setWinRateThreshold] = useState('')
  const [maxDrawdownComparator, setMaxDrawdownComparator] = useState<NumericComparator>('lte')
  const [maxDrawdownThreshold, setMaxDrawdownThreshold] = useState('')
  const [annualReturnComparator, setAnnualReturnComparator] = useState<NumericComparator>('gte')
  const [annualReturnThreshold, setAnnualReturnThreshold] = useState('')

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false)
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement | null>(null)

  const authorizedStrategies = useMemo(
    () =>
      [...backtestStrategies, ...liveStrategies, ...thirdpartyStrategies]
        .filter((strategy) => canAccessStrategy(strategy.channel, strategy.id))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [backtestStrategies, canAccessStrategy, liveStrategies, thirdpartyStrategies],
  )

  const authorOptions = useMemo(() => {
    const source =
      channelFilter === 'all'
        ? authorizedStrategies
        : authorizedStrategies.filter((strategy) => strategy.channel === channelFilter)

    const authors = new Set<string>()
    source.forEach((strategy) => {
      const author = strategy.author.trim()
      if (author) {
        authors.add(author)
      }
    })

    return Array.from(authors).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  }, [authorizedStrategies, channelFilter])

  const styleOptions = useMemo(() => {
    const source =
      channelFilter === 'all'
        ? authorizedStrategies
        : authorizedStrategies.filter((strategy) => strategy.channel === channelFilter)

    const styles = new Set<string>()
    source.forEach((strategy) => {
      strategy.tags.forEach((tag) => {
        const style = tag.trim()
        if (style) {
          styles.add(style)
        }
      })
    })

    return Array.from(styles).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  }, [authorizedStrategies, channelFilter])

  const strategyById = useMemo(
    () => new Map(authorizedStrategies.map((strategy) => [strategy.id, strategy])),
    [authorizedStrategies],
  )

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => strategyById.has(id)))
  }, [strategyById])

  useEffect(() => {
    setSelectedAuthors((current) => current.filter((author) => authorOptions.includes(author)))
  }, [authorOptions])

  useEffect(() => {
    setSelectedStyles((current) => current.filter((style) => styleOptions.includes(style)))
  }, [styleOptions])

  useEffect(() => {
    const closeWhenOutside = (target: EventTarget | null) => {
      const node = target as Node | null
      if (!node) {
        return
      }
      if (filterDropdownRef.current?.contains(node)) {
        return
      }
      setFilterDropdownOpen(false)
      setAuthorDropdownOpen(false)
      setStyleDropdownOpen(false)
    }

    const handleMouseDown = (event: MouseEvent) => {
      closeWhenOutside(event.target)
    }

    const handleTouchStart = (event: TouchEvent) => {
      closeWhenOutside(event.target)
    }

    const handleFocusIn = (event: FocusEvent) => {
      closeWhenOutside(event.target)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFilterDropdownOpen(false)
        setAuthorDropdownOpen(false)
        setStyleDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown, true)
    document.addEventListener('touchstart', handleTouchStart, true)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true)
      document.removeEventListener('touchstart', handleTouchStart, true)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const filteredStrategies = useMemo(() => {
    const keywordQuery = searchKeyword.trim().toLowerCase()
    const winRateValue = parsePercentInput(winRateThreshold)
    const maxDrawdownValue = parsePercentInput(maxDrawdownThreshold)
    const annualReturnValue = parsePercentInput(annualReturnThreshold)

    return authorizedStrategies.filter((strategy) => {
      if (channelFilter !== 'all' && strategy.channel !== channelFilter) {
        return false
      }

      if (selectedAuthors.length > 0 && !selectedAuthors.includes(strategy.author)) {
        return false
      }

      if (selectedStyles.length > 0 && !strategy.tags.some((tag) => selectedStyles.includes(tag))) {
        return false
      }

      if (
        keywordQuery &&
        !strategy.name.toLowerCase().includes(keywordQuery) &&
        !strategy.author.toLowerCase().includes(keywordQuery) &&
        !strategy.tags.some((tag) => tag.toLowerCase().includes(keywordQuery))
      ) {
        return false
      }

      if (winRateValue !== null) {
        const winRate = getCompareMetricRawValue(strategy, 'compare:winRate')
        if (winRate === null || !compareNumber(winRate, winRateValue, winRateComparator)) {
          return false
        }
      }

      if (maxDrawdownValue !== null) {
        const drawdown = getCompareMetricRawValue(strategy, 'compare:maxDrawdown')
        if (drawdown === null || !compareNumber(Math.abs(drawdown), maxDrawdownValue, maxDrawdownComparator)) {
          return false
        }
      }

      if (annualReturnValue !== null) {
        const annualReturn = getCompareMetricRawValue(strategy, 'compare:annualReturn')
        if (annualReturn === null || !compareNumber(annualReturn, annualReturnValue, annualReturnComparator)) {
          return false
        }
      }

      return true
    })
  }, [
    annualReturnComparator,
    annualReturnThreshold,
    authorizedStrategies,
    channelFilter,
    maxDrawdownComparator,
    maxDrawdownThreshold,
    searchKeyword,
    selectedAuthors,
    selectedStyles,
    winRateComparator,
    winRateThreshold,
  ])

  const selectedStrategies = useMemo(
    () =>
      selectedIds
        .map((id) => strategyById.get(id))
        .filter((strategy): strategy is StrategyRecord => strategy !== undefined),
    [selectedIds, strategyById],
  )

  const comparisonDateRange = useMemo(() => {
    const parsedStart = comparisonStartDate ? toCurveDateTimestamp(comparisonStartDate) : null
    const parsedEnd = comparisonEndDate ? toCurveDateTimestamp(comparisonEndDate) : null
    return normalizeDateRange(parsedStart, parsedEnd)
  }, [comparisonEndDate, comparisonStartDate])

  const metricRows = useMemo(() => getCompareMetricRows(t), [t])
  const mergedEquityCurve = useMemo(
    () =>
      buildCurveRows(
        selectedStrategies,
        'equityCurve',
        comparisonDateRange.startTimestamp,
        comparisonDateRange.endTimestamp,
      ),
    [comparisonDateRange.endTimestamp, comparisonDateRange.startTimestamp, selectedStrategies],
  )
  const mergedDrawdownCurve = useMemo(
    () =>
      buildCurveRows(
        selectedStrategies,
        'drawdownCurve',
        comparisonDateRange.startTimestamp,
        comparisonDateRange.endTimestamp,
      ),
    [comparisonDateRange.endTimestamp, comparisonDateRange.startTimestamp, selectedStrategies],
  )

  const equityAxisScale = useMemo(() => {
    const values: number[] = []
    mergedEquityCurve.forEach((row) => {
      selectedStrategies.forEach((strategy) => {
        const rawValue = row[strategy.id]
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
          values.push(rawValue)
        }
      })
    })
    return buildEquityAxisScale(values)
  }, [mergedEquityCurve, selectedStrategies])

  const selectAllFiltered = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      filteredStrategies.forEach((strategy) => next.add(strategy.id))
      return Array.from(next)
    })
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const toggleStrategy = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const toggleAuthor = (author: string) => {
    setSelectedAuthors((current) => {
      if (current.includes(author)) {
        return current.filter((item) => item !== author)
      }
      const next = [...current, author]
      next.sort((left, right) => left.localeCompare(right, 'zh-CN'))
      return next
    })
  }

  const toggleStyle = (style: string) => {
    setSelectedStyles((current) => {
      if (current.includes(style)) {
        return current.filter((item) => item !== style)
      }
      const next = [...current, style]
      next.sort((left, right) => left.localeCompare(right, 'zh-CN'))
      return next
    })
  }

  const activeFilterCount =
    selectedAuthors.length +
    selectedStyles.length +
    (winRateThreshold.trim() ? 1 : 0) +
    (maxDrawdownThreshold.trim() ? 1 : 0) +
    (annualReturnThreshold.trim() ? 1 : 0)

  if (isLoading) {
    return (
      <section className="empty-panel">
        <h1>{t('策略加载中...', 'Loading strategies...')}</h1>
      </section>
    )
  }

  if (authorizedStrategies.length === 0) {
    return (
      <section className="empty-panel">
        <h1>{t('当前账号暂无可对比策略', 'No strategies available for comparison')}</h1>
        <p>
          {t(
            '请联系管理员分配孵化策略、已发布策略或第三方策略权限后再进行多策略对比。',
            'Please contact your admin to grant strategy permissions before comparing.',
          )}
        </p>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h1>{t('策略对比', 'Strategy Comparison')}</h1>
          </div>
        </div>

        <div className="toolbar">
          <label>
            {t('策略类型', 'Channel')}
            <select
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}
            >
              <option value="all">{t('全部', 'All')}</option>
              <option value="backtest">{t('孵化策略', 'Incubation')}</option>
              <option value="live">{t('已发布策略', 'Published')}</option>
              <option value="thirdparty">{t('第三方策略', 'Third-Party')}</option>
            </select>
          </label>

          <label>
            {t('搜索', 'Search')}
            <input
              type="search"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder={t('策略名称/作者/标签', 'Search by name/author/tag')}
            />
          </label>

          <div className="compare-filter-control" ref={filterDropdownRef}>
            <span>{t('筛选', 'Filter')}</span>
            <button
              type="button"
              className="btn btn-secondary compare-filter-trigger"
              onClick={() =>
                setFilterDropdownOpen((open) => {
                  const nextOpen = !open
                  if (!nextOpen) {
                    setAuthorDropdownOpen(false)
                    setStyleDropdownOpen(false)
                  }
                  return nextOpen
                })
              }
              aria-expanded={filterDropdownOpen}
              aria-haspopup="menu"
            >
              {t('筛选', 'Filter')} ({activeFilterCount})
            </button>

            {filterDropdownOpen ? (
              <div className="compare-filter-dropdown compare-filter-dropdown-wide" role="menu">
                <div className="compare-filter-section">
                  <div className="compare-filter-submenu">
                    <button
                      type="button"
                      className="btn btn-secondary compare-filter-submenu-trigger"
                      onClick={() => {
                        setStyleDropdownOpen((open) => !open)
                        setAuthorDropdownOpen(false)
                      }}
                      aria-expanded={styleDropdownOpen}
                      aria-haspopup="menu"
                    >
                      {t('策略风格', 'Style')}
                    </button>
                    {styleDropdownOpen ? (
                      <div className="compare-filter-submenu-panel compare-filter-submenu-panel-style" role="menu">
                        <div className="compare-filter-style-grid">
                          <label className="compare-filter-dropdown-item compare-filter-style-item compare-filter-style-item-all">
                            <input
                              type="checkbox"
                              checked={selectedStyles.length === 0}
                              onChange={() => setSelectedStyles([])}
                            />
                            {t('全部风格', 'All Styles')}
                          </label>
                          {styleOptions.map((style) => (
                            <label
                              key={style}
                              className="compare-filter-dropdown-item compare-filter-style-item"
                            >
                              <input
                                type="checkbox"
                                checked={selectedStyles.includes(style)}
                                onChange={() => toggleStyle(style)}
                              />
                              {style}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="compare-filter-section">
                  <div className="compare-filter-submenu">
                    <button
                      type="button"
                      className="btn btn-secondary compare-filter-submenu-trigger"
                      onClick={() => {
                        setAuthorDropdownOpen((open) => !open)
                        setStyleDropdownOpen(false)
                      }}
                      aria-expanded={authorDropdownOpen}
                      aria-haspopup="menu"
                    >
                      {t('作者', 'Author')}
                    </button>
                    {authorDropdownOpen ? (
                      <div className="compare-filter-submenu-panel" role="menu">
                        <label className="compare-filter-dropdown-item">
                          <input
                            type="checkbox"
                            checked={selectedAuthors.length === 0}
                            onChange={() => setSelectedAuthors([])}
                          />
                          {t('全部作者', 'All Authors')}
                        </label>
                        {authorOptions.map((author) => (
                          <label key={author} className="compare-filter-dropdown-item">
                            <input
                              type="checkbox"
                              checked={selectedAuthors.includes(author)}
                              onChange={() => toggleAuthor(author)}
                            />
                            {author}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="compare-filter-section">
                  <p className="compare-filter-section-title">{t('总胜率阈值(%)', 'Win Rate Threshold (%)')}</p>
                  <div className="filter-inline">
                    <select
                      value={winRateComparator}
                      onChange={(event) => setWinRateComparator(event.target.value as NumericComparator)}
                    >
                      <option value="gte">{t('大于等于', '>=')}</option>
                      <option value="lte">{t('小于等于', '<=')}</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={winRateThreshold}
                      onChange={(event) => setWinRateThreshold(event.target.value)}
                      placeholder="60"
                    />
                  </div>
                </div>

                <div className="compare-filter-section">
                  <p className="compare-filter-section-title">
                    {t('最大回撤阈值(%)', 'Max Drawdown Threshold (%)')}
                  </p>
                  <div className="filter-inline">
                    <select
                      value={maxDrawdownComparator}
                      onChange={(event) => setMaxDrawdownComparator(event.target.value as NumericComparator)}
                    >
                      <option value="lte">{t('小于等于', '<=')}</option>
                      <option value="gte">{t('大于等于', '>=')}</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={maxDrawdownThreshold}
                      onChange={(event) => setMaxDrawdownThreshold(event.target.value)}
                      placeholder="10"
                    />
                  </div>
                </div>

                <div className="compare-filter-section">
                  <p className="compare-filter-section-title">
                    {t('年化收益率阈值(%)', 'Annual Return Threshold (%)')}
                  </p>
                  <div className="filter-inline">
                    <select
                      value={annualReturnComparator}
                      onChange={(event) => setAnnualReturnComparator(event.target.value as NumericComparator)}
                    >
                      <option value="gte">{t('大于等于', '>=')}</option>
                      <option value="lte">{t('小于等于', '<=')}</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={annualReturnThreshold}
                      onChange={(event) => setAnnualReturnThreshold(event.target.value)}
                      placeholder="15"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="strategy-compare-actions">
          <span>
            {t('已选策略数：', 'Selected: ')}
            <strong>{selectedStrategies.length}</strong>
          </span>
          <div className="table-actions">
            <button type="button" className="btn btn-secondary" onClick={selectAllFiltered}>
              {t('全选当前筛选结果', 'Select Filtered')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearSelection}>
              {t('清空选择', 'Clear')}
            </button>
          </div>
        </div>

        {filteredStrategies.length === 0 ? (
          <p className="empty-copy">
            {t('当前筛选条件下无可选策略。', 'No authorized strategies under the current filter.')}
          </p>
        ) : (
          <div className="strategy-compare-option-list">
            {filteredStrategies.map((strategy) => {
              const checked = selectedIds.includes(strategy.id)
              return (
                <label
                  key={strategy.id}
                  className={
                    checked
                      ? 'strategy-compare-option strategy-compare-option-active'
                      : 'strategy-compare-option'
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStrategy(strategy.id)}
                  />
                  <div className="strategy-compare-option-content">
                    <strong>{strategy.name}</strong>
                    <p>{strategy.summary}</p>
                    <p className="strategy-compare-option-meta">
                      {channelLabel(strategy.channel, t)} | {strategy.author} |{' '}
                      {t('更新于', 'Updated')}: {formatDate(strategy.updatedAt)}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </section>

      {selectedStrategies.length < 2 ? (
        <section className="empty-panel">
          <h2>{t('至少选择两个策略进行对比', 'Choose at least two strategies')}</h2>
          <p>
            {t(
              '选中多个策略后，将按统一指标口径展示对比结果。',
              'After selecting multiple strategies, comparison uses unified metric definitions.',
            )}
          </p>
        </section>
      ) : (
        <>
          <div className="strategy-compare-chart-toolbar">
            <div className="strategy-compare-date-range">
              <label className="strategy-compare-date-filter">
                {t('对比起始日期', 'Comparison Start Date')}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={comparisonStartDate}
                  onChange={(event) => setComparisonStartDate(sanitizeDateInput(event.target.value))}
                  onBlur={(event) => setComparisonStartDate(formatDateInputDisplay(event.target.value))}
                  placeholder="yyyy/mm/dd"
                />
              </label>
              <label className="strategy-compare-date-filter">
                {t('对比截止日期', 'Comparison End Date')}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={comparisonEndDate}
                  onChange={(event) => setComparisonEndDate(sanitizeDateInput(event.target.value))}
                  onBlur={(event) => setComparisonEndDate(formatDateInputDisplay(event.target.value))}
                  placeholder="yyyy/mm/dd"
                />
              </label>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setComparisonStartDate('')
                setComparisonEndDate('')
              }}
              disabled={!comparisonStartDate && !comparisonEndDate}
            >
              {t('重置日期范围', 'Reset Date Range')}
            </button>
          </div>

          <section className="chart-grid">
            <article className="chart-panel">
              <h2>{t('净值曲线对比', 'Equity Curve Comparison')}</h2>
              {mergedEquityCurve.length === 0 ? (
                <p className="empty-copy">
                  {t(
                    '当前日期范围内没有可展示的净值数据，请调整日期区间。',
                    'No equity points in the selected date range. Adjust the range.',
                  )}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mergedEquityCurve}>
                    <CartesianGrid stroke="#1d4a82" strokeDasharray="4 4" />
                    <XAxis dataKey="date" />
                    <YAxis
                      domain={equityAxisScale.domain}
                      ticks={equityAxisScale.ticks}
                      tickFormatter={(value: number) => formatNetValue(Number(value))}
                    />
                    <Tooltip
                      formatter={(value) => {
                        const numeric = Number(value)
                        return [
                          Number.isFinite(numeric) ? formatNetValue(numeric) : '--',
                          t('净值', 'Net Value'),
                        ]
                      }}
                    />
                    <Legend />
                    {selectedStrategies.map((strategy, index) => (
                      <Line
                        key={`equity-${strategy.id}`}
                        type="monotone"
                        dataKey={strategy.id}
                        name={strategy.name}
                        stroke={curveColors[index % curveColors.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </article>

            <article className="chart-panel">
              <h2>{t('最大回撤曲线对比', 'Drawdown Curve Comparison')}</h2>
              {mergedDrawdownCurve.length === 0 ? (
                <p className="empty-copy">
                  {t(
                    '当前日期范围内没有可展示的回撤数据，请调整日期区间。',
                    'No drawdown points in the selected date range. Adjust the range.',
                  )}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mergedDrawdownCurve}>
                    <CartesianGrid stroke="#2d4777" strokeDasharray="4 4" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(value: number) => formatPercent(Number(value))} />
                    <Tooltip formatter={(value) => formatPercent(Number(value))} />
                    <Legend />
                    {selectedStrategies.map((strategy, index) => (
                      <Line
                        key={`drawdown-${strategy.id}`}
                        type="monotone"
                        dataKey={strategy.id}
                        name={strategy.name}
                        stroke={curveColors[index % curveColors.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </article>
          </section>

          <section className="table-wrap" aria-label={t('策略对比结果', 'Strategy comparison result')}>
            <table className="strategy-compare-table">
              <thead>
                <tr>
                  <th>{t('指标', 'Metric')}</th>
                  {selectedStrategies.map((strategy) => (
                    <th key={strategy.id}>
                      <div className="strategy-compare-table-header">
                        <strong>{strategy.name}</strong>
                        <span>{channelLabel(strategy.channel, t)}</span>
                        <span>{strategy.author}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricRows.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-title">
                      <span>{row.label}</span>
                    </td>
                    {selectedStrategies.map((strategy) => {
                      const value = getCompareMetricDisplayValue(strategy, row.id)
                      const isNotApplicable = value === '--'
                      return (
                        <td
                          key={`${row.id}-${strategy.id}`}
                          className={isNotApplicable ? 'strategy-compare-cell-na' : undefined}
                        >
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
