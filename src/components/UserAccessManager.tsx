import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useStrategies } from '../context/StrategyContext'
import type { AuthUser, RegistrationRequest, StrategyPermissionSet } from '../types/auth'
import { formatDate } from '../utils/format'

interface StrategyOption {
  id: string
  name: string
}

interface Translator {
  (zh: string, en: string): string
}

function createEmptyPermissions(): StrategyPermissionSet {
  return {
    allowBacktest: false,
    allowLive: false,
    allowThirdParty: false,
    backtestStrategyIds: [],
    liveStrategyIds: [],
    thirdPartyStrategyIds: [],
  }
}

function createFullPermissions(): StrategyPermissionSet {
  return {
    allowBacktest: true,
    allowLive: true,
    allowThirdParty: true,
    backtestStrategyIds: [],
    liveStrategyIds: [],
    thirdPartyStrategyIds: [],
  }
}

function normalizePermissions(permissions: StrategyPermissionSet | undefined): StrategyPermissionSet {
  if (!permissions) {
    return createEmptyPermissions()
  }

  return {
    allowBacktest: Boolean(permissions.allowBacktest),
    allowLive: Boolean(permissions.allowLive),
    allowThirdParty: Boolean(permissions.allowThirdParty),
    backtestStrategyIds: Array.from(new Set(permissions.backtestStrategyIds)),
    liveStrategyIds: Array.from(new Set(permissions.liveStrategyIds)),
    thirdPartyStrategyIds: Array.from(new Set(permissions.thirdPartyStrategyIds ?? [])),
  }
}

function hasAnyPermission(permissions: StrategyPermissionSet) {
  return (
    permissions.allowBacktest ||
    permissions.allowLive ||
    permissions.allowThirdParty ||
    permissions.backtestStrategyIds.length > 0 ||
    permissions.liveStrategyIds.length > 0 ||
    permissions.thirdPartyStrategyIds.length > 0
  )
}

function togglePermissionId(list: string[], id: string, checked: boolean): string[] {
  if (checked) {
    return Array.from(new Set([...list, id]))
  }
  return list.filter((item) => item !== id)
}

interface PermissionEditorProps {
  value: StrategyPermissionSet
  backtestOptions: StrategyOption[]
  liveOptions: StrategyOption[]
  thirdPartyOptions: StrategyOption[]
  onChange: (next: StrategyPermissionSet) => void
  t: Translator
}

function PermissionEditor({
  value,
  backtestOptions,
  liveOptions,
  thirdPartyOptions,
  onChange,
  t,
}: PermissionEditorProps) {
  return (
    <div className="permission-editor">
      <div className="permission-channel-row">
        <label className="permission-toggle">
          <input
            type="checkbox"
            checked={value.allowBacktest}
            onChange={(event) => onChange({ ...value, allowBacktest: event.target.checked })}
          />
          {t('允许访问全部孵化策略', 'Allow all incubation strategies')}
        </label>
        <label className="permission-toggle">
          <input
            type="checkbox"
            checked={value.allowLive}
            onChange={(event) => onChange({ ...value, allowLive: event.target.checked })}
          />
          {t('允许访问全部已发布策略', 'Allow all published strategies')}
        </label>
        <label className="permission-toggle">
          <input
            type="checkbox"
            checked={value.allowThirdParty}
            onChange={(event) => onChange({ ...value, allowThirdParty: event.target.checked })}
          />
          {t('允许访问全部第三方策略', 'Allow all third-party strategies')}
        </label>
      </div>

      <div className="permission-section">
        <h4>{t('孵化策略单策略授权', 'Incubation strategy-level access')}</h4>
        <div className="permission-list">
          {backtestOptions.length === 0 ? (
            <p className="empty-copy">{t('暂无可授权的孵化策略。', 'No incubation strategies available.')}</p>
          ) : (
            backtestOptions.map((strategy) => (
              <label key={strategy.id} className="permission-item">
                <input
                  type="checkbox"
                  checked={value.backtestStrategyIds.includes(strategy.id)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      backtestStrategyIds: togglePermissionId(
                        value.backtestStrategyIds,
                        strategy.id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                {strategy.name}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="permission-section">
        <h4>{t('已发布策略单策略授权', 'Published strategy-level access')}</h4>
        <div className="permission-list">
          {liveOptions.length === 0 ? (
            <p className="empty-copy">{t('暂无可授权的已发布策略。', 'No published strategies available.')}</p>
          ) : (
            liveOptions.map((strategy) => (
              <label key={strategy.id} className="permission-item">
                <input
                  type="checkbox"
                  checked={value.liveStrategyIds.includes(strategy.id)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      liveStrategyIds: togglePermissionId(
                        value.liveStrategyIds,
                        strategy.id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                {strategy.name}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="permission-section">
        <h4>{t('第三方策略单策略授权', 'Third-party strategy-level access')}</h4>
        <div className="permission-list">
          {thirdPartyOptions.length === 0 ? (
            <p className="empty-copy">{t('暂无可授权的第三方策略。', 'No third-party strategies available.')}</p>
          ) : (
            thirdPartyOptions.map((strategy) => (
              <label key={strategy.id} className="permission-item">
                <input
                  type="checkbox"
                  checked={value.thirdPartyStrategyIds.includes(strategy.id)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      thirdPartyStrategyIds: togglePermissionId(
                        value.thirdPartyStrategyIds,
                        strategy.id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                {strategy.name}
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

interface RequestCardProps {
  request: RegistrationRequest
  processingKey: string | null
  draft: StrategyPermissionSet
  backtestOptions: StrategyOption[]
  liveOptions: StrategyOption[]
  thirdPartyOptions: StrategyOption[]
  onChangeDraft: (next: StrategyPermissionSet) => void
  onApprove: () => void
  onReject: () => void
  t: Translator
  locale: 'zh' | 'en'
}

function RequestPermissionCard({
  request,
  processingKey,
  draft,
  backtestOptions,
  liveOptions,
  thirdPartyOptions,
  onChangeDraft,
  onApprove,
  onReject,
  t,
  locale,
}: RequestCardProps) {
  return (
    <details className="permission-collapse-card">
      <summary className="permission-summary-row">
        <span className="permission-summary-user">{request.username}</span>
        <span className="permission-summary-org">{request.organization}</span>
        <span className="approval-status approval-status-pending">{t('待审批', 'Pending')}</span>
      </summary>

      <div className="permission-collapse-body">
        <div className="permission-profile">
          <p>
            <strong>{t('用户名：', 'Username: ')}</strong>
            {request.username}
          </p>
          <p>
            <strong>{t('客户姓名：', 'Full name: ')}</strong>
            {request.fullName}
          </p>
          <p>
            <strong>{t('机构：', 'Organization: ')}</strong>
            {request.organization}
          </p>
          <p>
            <strong>{t('邮箱：', 'Email: ')}</strong>
            {request.email}
          </p>
          <p>
            <strong>{t('联系方式：', 'Contact: ')}</strong>
            {request.contact}
          </p>
          <p>
            <strong>{t('申请时间：', 'Requested at: ')}</strong>
            {new Date(request.requestedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
          </p>
        </div>

        <PermissionEditor
          value={draft}
          backtestOptions={backtestOptions}
          liveOptions={liveOptions}
          thirdPartyOptions={thirdPartyOptions}
          onChange={onChangeDraft}
          t={t}
        />

        <div className="permission-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={processingKey === `approve-${request.id}`}
            onClick={onApprove}
          >
            {processingKey === `approve-${request.id}`
              ? t('处理中...', 'Processing...')
              : t('批准并开通权限', 'Approve and grant access')}
          </button>
          <button
            className="btn btn-danger"
            type="button"
            disabled={processingKey === `reject-${request.id}`}
            onClick={onReject}
          >
            {processingKey === `reject-${request.id}`
              ? t('处理中...', 'Processing...')
              : t('拒绝申请', 'Reject request')}
          </button>
        </div>
      </div>
    </details>
  )
}

interface UserCardProps {
  managedUser: AuthUser
  processingKey: string | null
  draft: StrategyPermissionSet
  backtestOptions: StrategyOption[]
  liveOptions: StrategyOption[]
  thirdPartyOptions: StrategyOption[]
  onChangeDraft: (next: StrategyPermissionSet) => void
  onSave: () => void
  t: Translator
}

function ManagedUserCard({
  managedUser,
  processingKey,
  draft,
  backtestOptions,
  liveOptions,
  thirdPartyOptions,
  onChangeDraft,
  onSave,
  t,
}: UserCardProps) {
  return (
    <details className="permission-collapse-card">
      <summary className="permission-summary-row">
        <span className="permission-summary-user">{managedUser.username}</span>
        <span className="permission-summary-org">{managedUser.organization}</span>
        <span className="approval-status approval-status-approved">{t('已开通', 'Active')}</span>
      </summary>

      <div className="permission-collapse-body">
        <div className="permission-profile">
          <p>
            <strong>{t('用户名：', 'Username: ')}</strong>
            {managedUser.username}
          </p>
          <p>
            <strong>{t('客户姓名：', 'Full name: ')}</strong>
            {managedUser.fullName}
          </p>
          <p>
            <strong>{t('机构：', 'Organization: ')}</strong>
            {managedUser.organization}
          </p>
          <p>
            <strong>{t('邮箱：', 'Email: ')}</strong>
            {managedUser.email}
          </p>
          <p>
            <strong>{t('联系方式：', 'Contact: ')}</strong>
            {managedUser.contact}
          </p>
          <p>
            <strong>{t('注册日期：', 'Registered at: ')}</strong>
            {formatDate(managedUser.registeredAt)}
          </p>
        </div>

        <PermissionEditor
          value={draft}
          backtestOptions={backtestOptions}
          liveOptions={liveOptions}
          thirdPartyOptions={thirdPartyOptions}
          onChange={onChangeDraft}
          t={t}
        />

        <div className="permission-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={processingKey === `user-${managedUser.id}`}
            onClick={onSave}
          >
            {processingKey === `user-${managedUser.id}`
              ? t('保存中...', 'Saving...')
              : t('保存权限', 'Save permissions')}
          </button>
        </div>
      </div>
    </details>
  )
}

export function UserAccessManager() {
  const { t, locale } = useLocale()
  const {
    pendingRequests,
    managedUsers,
    approveRegistration,
    rejectRegistration,
    updatePermissions,
  } = useAuth()
  const { backtestStrategies, liveStrategies, thirdpartyStrategies } = useStrategies()

  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, StrategyPermissionSet>>({})
  const [userDrafts, setUserDrafts] = useState<Record<string, StrategyPermissionSet>>({})
  const [organizationFilter, setOrganizationFilter] = useState('all')
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [processingKey, setProcessingKey] = useState<string | null>(null)

  const backtestOptions = useMemo<StrategyOption[]>(
    () => backtestStrategies.map((item) => ({ id: item.id, name: item.name })),
    [backtestStrategies],
  )
  const liveOptions = useMemo<StrategyOption[]>(
    () => liveStrategies.map((item) => ({ id: item.id, name: item.name })),
    [liveStrategies],
  )
  const thirdPartyOptions = useMemo<StrategyOption[]>(
    () => thirdpartyStrategies.map((item) => ({ id: item.id, name: item.name })),
    [thirdpartyStrategies],
  )

  const organizationOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...pendingRequests, ...managedUsers]
            .map((item) => item.organization.trim())
            .filter((item) => item.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, locale === 'zh' ? 'zh-CN' : 'en-US')),
    [locale, managedUsers, pendingRequests],
  )

  const filteredPendingRequests = useMemo(
    () =>
      organizationFilter === 'all'
        ? pendingRequests
        : pendingRequests.filter((item) => item.organization === organizationFilter),
    [organizationFilter, pendingRequests],
  )

  const filteredManagedUsers = useMemo(
    () =>
      organizationFilter === 'all'
        ? managedUsers
        : managedUsers.filter((item) => item.organization === organizationFilter),
    [managedUsers, organizationFilter],
  )

  const clearStatus = () => {
    setAuthError('')
    setAuthSuccess('')
  }

  const handleApprove = async (request: RegistrationRequest) => {
    clearStatus()
    const permissions = approvalDrafts[request.id] ?? createEmptyPermissions()
    if (!hasAnyPermission(permissions)) {
      setAuthError(t('审批前请至少勾选一个板块或一个策略权限。', 'Select at least one scope before approval.'))
      return
    }

    setProcessingKey(`approve-${request.id}`)
    const result = await approveRegistration(request.id, permissions)
    setProcessingKey(null)

    if (!result.ok) {
      setAuthError(result.message ?? t('审批失败。', 'Approval failed.'))
      return
    }
    setAuthSuccess(result.message ?? t('审批通过。', 'Approved.'))
  }

  const handleReject = async (request: RegistrationRequest) => {
    clearStatus()
    const confirmed = window.confirm(
      t(`确认拒绝用户 ${request.username} 的申请吗？`, `Reject ${request.username}'s request?`),
    )
    if (!confirmed) {
      return
    }

    setProcessingKey(`reject-${request.id}`)
    const result = await rejectRegistration(request.id)
    setProcessingKey(null)

    if (!result.ok) {
      setAuthError(result.message ?? t('拒绝失败。', 'Reject failed.'))
      return
    }
    setAuthSuccess(result.message ?? t('申请已拒绝。', 'Request rejected.'))
  }

  const handleSaveUserPermission = async (managedUser: AuthUser) => {
    clearStatus()
    const permissions = userDrafts[managedUser.id] ?? normalizePermissions(managedUser.permissions)
    if (!hasAnyPermission(permissions)) {
      setAuthError(t('请至少为该用户授予一个板块或一个策略权限。', 'Grant at least one scope to this user.'))
      return
    }

    setProcessingKey(`user-${managedUser.id}`)
    const result = await updatePermissions(managedUser.id, permissions)
    setProcessingKey(null)

    if (!result.ok) {
      setAuthError(result.message ?? t('保存权限失败。', 'Failed to save permissions.'))
      return
    }
    setAuthSuccess(result.message ?? t('权限已更新。', 'Permissions updated.'))
  }

  const handleBulkGrantFullAccess = async () => {
    clearStatus()
    if (filteredManagedUsers.length === 0) {
      setAuthError(t('当前筛选结果下没有可授权用户。', 'No users in the current filter.'))
      return
    }

    const scopeName =
      organizationFilter === 'all'
        ? t('当前筛选结果中的全部用户', 'all users in the current filter')
        : t(`${organizationFilter} 机构用户`, `${organizationFilter} users`)
    const confirmed = window.confirm(
      t(
        `确认给 ${scopeName} 一次性开通全部权限吗？`,
        `Grant full access to ${scopeName}?`,
      ),
    )
    if (!confirmed) {
      return
    }

    const fullPermissions = createFullPermissions()
    setProcessingKey('bulk-full-access')

    for (const managedUser of filteredManagedUsers) {
      const result = await updatePermissions(managedUser.id, fullPermissions)
      if (!result.ok) {
        setProcessingKey(null)
        setAuthError(
          result.message ??
            t(`批量授权在用户 ${managedUser.username} 处中断。`, `Bulk grant stopped at ${managedUser.username}.`),
        )
        return
      }
    }

    setUserDrafts((prev) => {
      const next = { ...prev }
      filteredManagedUsers.forEach((managedUser) => {
        next[managedUser.id] = createFullPermissions()
      })
      return next
    })
    setProcessingKey(null)
    setAuthSuccess(
      t(
        `已为 ${filteredManagedUsers.length} 位筛选用户开通全部权限。`,
        `Granted full access to ${filteredManagedUsers.length} filtered users.`,
      ),
    )
  }

  return (
    <section className="section-panel">
      <div className="section-head">
        <div>
          <h2>{t('用户资格管理', 'User Qualification Management')}</h2>
        </div>
      </div>

      {authError ? (
        <p className="form-error permission-feedback" role="alert">
          {authError}
        </p>
      ) : null}
      {authSuccess ? <p className="permission-feedback">{authSuccess}</p> : null}

      <div className="permission-filter-bar">
        <label className="permission-filter-field">
          <span>{t('机构筛选', 'Organization Filter')}</span>
          <select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
            <option value="all">{t('全部机构', 'All organizations')}</option>
            {organizationOptions.map((organization) => (
              <option key={organization} value={organization}>
                {organization}
              </option>
            ))}
          </select>
        </label>
        <div className="permission-filter-meta">
          <span>{t('待审批', 'Pending')}: {filteredPendingRequests.length}</span>
          <span>{t('已注册', 'Registered')}: {filteredManagedUsers.length}</span>
        </div>
      </div>

      <section className="admin-submodule">
        <div className="section-head">
          <div>
            <h3>{t('待审批注册申请', 'Pending Registration Requests')}</h3>
          </div>
        </div>
        {filteredPendingRequests.length === 0 ? (
          <p className="empty-copy">{t('当前筛选结果下暂无待审批申请。', 'No pending requests in the current filter.')}</p>
        ) : (
          <div className="permission-request-list">
            {filteredPendingRequests.map((request) => (
              <RequestPermissionCard
                key={request.id}
                request={request}
                processingKey={processingKey}
                draft={approvalDrafts[request.id] ?? createEmptyPermissions()}
                backtestOptions={backtestOptions}
                liveOptions={liveOptions}
                thirdPartyOptions={thirdPartyOptions}
                onChangeDraft={(next) => setApprovalDrafts((prev) => ({ ...prev, [request.id]: next }))}
                onApprove={() => {
                  void handleApprove(request)
                }}
                onReject={() => {
                  void handleReject(request)
                }}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>

      <section className="admin-submodule">
        <div className="section-head">
          <div>
            <h3>{t('已注册用户权限', 'Registered User Permissions')}</h3>
          </div>
        </div>

        <div className="permission-bulk-bar">
          <p>
            {t(
              `对当前筛选结果中的 ${filteredManagedUsers.length} 位已注册用户执行批量操作。`,
              `Bulk actions target ${filteredManagedUsers.length} registered users in the current filter.`,
            )}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={filteredManagedUsers.length === 0 || processingKey === 'bulk-full-access'}
            onClick={() => {
              void handleBulkGrantFullAccess()
            }}
          >
            {processingKey === 'bulk-full-access'
              ? t('批量授权中...', 'Granting...')
              : t('为筛选用户开通全部权限', 'Grant Full Access to Filtered Users')}
          </button>
        </div>

        {filteredManagedUsers.length === 0 ? (
          <p className="empty-copy">{t('当前筛选结果下暂无已注册用户。', 'No registered users in the current filter.')}</p>
        ) : (
          <div className="permission-user-list">
            {filteredManagedUsers.map((managedUser) => (
              <ManagedUserCard
                key={managedUser.id}
                managedUser={managedUser}
                processingKey={processingKey}
                draft={userDrafts[managedUser.id] ?? normalizePermissions(managedUser.permissions)}
                backtestOptions={backtestOptions}
                liveOptions={liveOptions}
                thirdPartyOptions={thirdPartyOptions}
                onChangeDraft={(next) => setUserDrafts((prev) => ({ ...prev, [managedUser.id]: next }))}
                onSave={() => {
                  void handleSaveUserPermission(managedUser)
                }}
                t={t}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

