import { useEffect, useMemo, useState } from 'react'
import { UserAccessManager } from '../components/UserAccessManager'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import {
  loadAnalyticsSnapshot,
  type AnalyticsSnapshot,
  type PermissionOpenLog,
  type StrategyVisitCounter,
  type VisitCounter,
} from '../services/analyticsService'

type AdminModule = 'qualification' | 'statistics'

const PATH_LABELS_ZH: Record<string, string> = {
  '/': '首页',
  '/strategy-manage': '策略管理',
  '/admin-console': '后台管理',
  '/incubation-strategies': '孵化策略',
  '/published-strategies': '已发布策略',
  '/third-party-strategies': '第三方策略',
  '/product-intro': '产品介绍',
  '/product-quote': '产品报价',
  '/faq': 'FAQ',
  '/login': '登录',
  '/register': '注册',
}

const PATH_LABELS_EN: Record<string, string> = {
  '/': 'Home',
  '/strategy-manage': 'Strategy Management',
  '/admin-console': 'Admin Console',
  '/incubation-strategies': 'Incubation',
  '/published-strategies': 'Published',
  '/third-party-strategies': 'Third-Party',
  '/product-intro': 'Product Intro',
  '/product-quote': 'Product Quotes',
  '/faq': 'FAQ',
  '/login': 'Login',
  '/register': 'Register',
}

function toDisplayPath(pathname: string, locale: 'zh' | 'en') {
  if (locale === 'zh') {
    return PATH_LABELS_ZH[pathname] ?? pathname
  }
  return PATH_LABELS_EN[pathname] ?? pathname
}

function formatDateTime(value: string, locale: 'zh' | 'en') {
  return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
}

function summarizePermissionOpens(events: PermissionOpenLog[]) {
  const approveCount = events.filter((item) => item.action === 'approve').length
  const updateCount = events.filter((item) => item.action === 'update').length
  return {
    total: events.length,
    approveCount,
    updateCount,
  }
}

export function AdminConsolePage() {
  const { t, locale } = useLocale()
  const { pendingRequests } = useAuth()
  const [activeModule, setActiveModule] = useState<AdminModule>('qualification')
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot>({
    version: 2,
    moduleVisits: {},
    strategyVisits: {},
    permissionOpens: [],
  })

  useEffect(() => {
    let active = true
    const sync = async () => {
      const next = await loadAnalyticsSnapshot()
      if (!active) {
        return
      }
      setAnalytics(next)
    }
    void sync()
    const timer = window.setInterval(sync, 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const moduleRows = useMemo(
    () =>
      Object.entries(analytics.moduleVisits)
        .map(([path, value]: [string, VisitCounter]) => ({
          path,
          name: toDisplayPath(path, locale),
          count: value.count,
          lastVisitedAt: value.lastVisitedAt,
        }))
        .sort((a, b) => b.count - a.count),
    [analytics.moduleVisits, locale],
  )

  const strategyRows = useMemo(
    () =>
      Object.values(analytics.strategyVisits)
        .map((item: StrategyVisitCounter) => ({
          channel: item.channel,
          strategyId: item.strategyId,
          strategyName: item.strategyName,
          count: item.count,
          lastVisitedAt: item.lastVisitedAt,
        }))
        .sort((a, b) => b.count - a.count),
    [analytics.strategyVisits],
  )

  const moduleVisitTotal = moduleRows.reduce((sum, row) => sum + row.count, 0)
  const strategyVisitTotal = strategyRows.reduce((sum, row) => sum + row.count, 0)
  const permissionStats = summarizePermissionOpens(analytics.permissionOpens)

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h1>{t('后台管理', 'Admin Console')}</h1>
          </div>
        </div>

        <div className="tab-group" role="tablist" aria-label={t('后台模块', 'Admin modules')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeModule === 'qualification'}
            className={activeModule === 'qualification' ? 'tab-active' : ''}
            onClick={() => setActiveModule('qualification')}
          >
            {t('用户资格管理', 'User Qualification')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeModule === 'statistics'}
            className={activeModule === 'statistics' ? 'tab-active' : ''}
            onClick={() => setActiveModule('statistics')}
          >
            {t('统计数据', 'Statistics')}
          </button>
        </div>
      </section>

      {activeModule === 'qualification' ? (
        <UserAccessManager />
      ) : (
        <section className="section-panel">
          <div className="section-head">
            <h2>{t('统计数据', 'Statistics')}</h2>
          </div>

          <div className="admin-stats-grid">
            <article className="admin-stat-card">
              <p>{t('模块总访问次数', 'Total Module Visits')}</p>
              <strong>{moduleVisitTotal}</strong>
            </article>
            <article className="admin-stat-card">
              <p>{t('策略详情访问次数', 'Strategy Detail Visits')}</p>
              <strong>{strategyVisitTotal}</strong>
            </article>
            <article className="admin-stat-card">
              <p>{t('权限开通总次数', 'Total Permission Grants')}</p>
              <strong>{permissionStats.total}</strong>
            </article>
            <article className="admin-stat-card">
              <p>{t('待审批注册数', 'Pending Requests')}</p>
              <strong>{pendingRequests.length}</strong>
            </article>
          </div>

          <div className="admin-stats-grid admin-stats-grid-secondary">
            <article className="admin-stat-card">
              <p>{t('首次开通次数', 'Initial Grant Count')}</p>
              <strong>{permissionStats.approveCount}</strong>
            </article>
            <article className="admin-stat-card">
              <p>{t('权限调整次数', 'Permission Update Count')}</p>
              <strong>{permissionStats.updateCount}</strong>
            </article>
          </div>

          <div className="admin-table-wrap">
            <h3>{t('策略访问明细', 'Strategy Visit Details')}</h3>
            {strategyRows.length === 0 ? (
              <p className="empty-copy">{t('暂无策略访问记录。', 'No strategy visits yet.')}</p>
            ) : (
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{t('策略名称', 'Strategy')}</th>
                    <th>{t('板块', 'Channel')}</th>
                    <th>{t('访问次数', 'Visits')}</th>
                    <th>{t('最近访问', 'Last Visit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyRows.map((row) => (
                    <tr key={`${row.channel}:${row.strategyId}`}>
                      <td>{row.strategyName}</td>
                      <td>
                        {row.channel === 'backtest'
                          ? t('孵化策略', 'Incubation')
                          : row.channel === 'live'
                            ? t('已发布策略', 'Published')
                            : t('第三方策略', 'Third-Party')}
                      </td>
                      <td>{row.count}</td>
                      <td>{formatDateTime(row.lastVisitedAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="admin-table-wrap">
            <h3>{t('模块访问明细', 'Module Visit Details')}</h3>
            {moduleRows.length === 0 ? (
              <p className="empty-copy">{t('暂无模块访问记录。', 'No module visits yet.')}</p>
            ) : (
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{t('模块', 'Module')}</th>
                    <th>{t('路径', 'Path')}</th>
                    <th>{t('访问次数', 'Visits')}</th>
                    <th>{t('最近访问', 'Last Visit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleRows.map((row) => (
                    <tr key={row.path}>
                      <td>{row.name}</td>
                      <td>{row.path}</td>
                      <td>{row.count}</td>
                      <td>{formatDateTime(row.lastVisitedAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="admin-table-wrap">
            <h3>{t('权限开通记录', 'Permission Grant Logs')}</h3>
            {analytics.permissionOpens.length === 0 ? (
              <p className="empty-copy">
                {t('暂无权限开通或调整记录。', 'No permission grant/update logs yet.')}
              </p>
            ) : (
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{t('类型', 'Type')}</th>
                    <th>{t('用户', 'User')}</th>
                    <th>{t('权限摘要', 'Permission Summary')}</th>
                    <th>{t('时间', 'Time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.permissionOpens.slice(0, 40).map((item) => (
                    <tr key={item.id}>
                      <td>{item.action === 'approve' ? t('首次开通', 'Initial Grant') : t('权限调整', 'Permission Update')}</td>
                      <td>{item.targetUsername}</td>
                      <td>{item.summary}</td>
                      <td>{formatDateTime(item.timestamp, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
