import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  approveRegistrationRequest,
  hasChannelAccess,
  hasStrategyAccess,
  listManagedUsers,
  listRegistrationRequests,
  loadSession,
  loginUser,
  logoutUser,
  registerUser,
  rejectRegistrationRequest,
  updateUserPermissions,
} from '../services/authService'
import { trackPermissionOpen } from '../services/analyticsService'
import type {
  AuthUser,
  RegistrationPayload,
  RegistrationRequest,
  StrategyPermissionSet,
  UserRole,
} from '../types/auth'
import type { StrategyChannel } from '../types/strategy'

interface AuthResult {
  ok: boolean
  user?: AuthUser
  message?: string
  pending?: boolean
}

interface AdminActionResult {
  ok: boolean
  message?: string
}

interface AuthContextValue {
  user: AuthUser | null
  role: UserRole
  isAuthenticated: boolean
  notice: string | null
  pendingRequests: RegistrationRequest[]
  managedUsers: AuthUser[]
  setNotice: (value: string | null) => void
  login: (username: string, password: string) => Promise<AuthResult>
  register: (payload: RegistrationPayload) => Promise<AuthResult>
  logout: () => void
  approveRegistration: (
    requestId: string,
    permissions: StrategyPermissionSet,
  ) => Promise<AdminActionResult>
  rejectRegistration: (requestId: string) => Promise<AdminActionResult>
  updatePermissions: (
    userId: string,
    permissions: StrategyPermissionSet,
  ) => Promise<AdminActionResult>
  canAccessChannel: (channel: StrategyChannel) => boolean
  canAccessStrategy: (channel: StrategyChannel, strategyId: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function buildPermissionSummary(permissions: StrategyPermissionSet) {
  const scopes: string[] = []
  if (permissions.allowBacktest) {
    scopes.push('孵化策略(全部)')
  } else if (permissions.backtestStrategyIds.length > 0) {
    scopes.push(`孵化策略(${permissions.backtestStrategyIds.length}条)`)
  }

  if (permissions.allowLive) {
    scopes.push('已发布策略(全部)')
  } else if (permissions.liveStrategyIds.length > 0) {
    scopes.push(`已发布策略(${permissions.liveStrategyIds.length}条)`)
  }

  const thirdPartyIds = Array.isArray(permissions.thirdPartyStrategyIds)
    ? permissions.thirdPartyStrategyIds
    : []
  if (permissions.allowThirdParty) {
    scopes.push('第三方策略(全部)')
  } else if (thirdPartyIds.length > 0) {
    scopes.push(`第三方策略(${thirdPartyIds.length}条)`)
  }

  return scopes.length > 0 ? scopes.join('，') : '未授予任何权限'
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(() => loadSession())
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingRequests, setPendingRequests] = useState<RegistrationRequest[]>([])
  const [managedUsers, setManagedUsers] = useState<AuthUser[]>([])

  const role: UserRole = user?.role ?? 'guest'

  const syncAdminData = useCallback(async () => {
    try {
      const [requests, users] = await Promise.all([listRegistrationRequests(), listManagedUsers()])
      setPendingRequests(requests)
      setManagedUsers(users)
    } catch {
      setPendingRequests([])
      setManagedUsers([])
    }
  }, [])

  useEffect(() => {
    void syncAdminData()
    const timer = window.setInterval(() => {
      void syncAdminData()
    }, 5_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [syncAdminData])

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('strategy-lab/auth/')) {
        setUser(loadSession())
      }
    }
    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [])

  const canAccessChannel = useCallback(
    (channel: StrategyChannel) => hasChannelAccess(user, channel),
    [user],
  )

  const canAccessStrategy = useCallback(
    (channel: StrategyChannel, strategyId: string) => hasStrategyAccess(user, channel, strategyId),
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      isAuthenticated: role !== 'guest',
      notice,
      pendingRequests,
      managedUsers,
      setNotice,
      login: async (username, password) => {
        try {
          const nextUser = await loginUser(username, password)
          setUser(nextUser)
          await syncAdminData()
          return { ok: true, user: nextUser }
        } catch (error) {
          const message = error instanceof Error ? error.message : '鐧诲綍澶辫触锛岃绋嶅悗閲嶈瘯'
          return { ok: false, message }
        }
      },
      register: async (payload) => {
        try {
          await registerUser(payload)
          await syncAdminData()
          return {
            ok: true,
            pending: true,
            message: '注册申请已提交，管理员审核并分配权限后即可登录。',
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '娉ㄥ唽澶辫触锛岃绋嶅悗閲嶈瘯'
          return { ok: false, message }
        }
      },
      logout: () => {
        logoutUser()
        setUser(null)
      },
      approveRegistration: async (requestId, permissions) => {
        try {
          const createdUser = await approveRegistrationRequest(requestId, permissions)
          void trackPermissionOpen({
            action: 'approve',
            targetUserId: createdUser.id,
            targetUsername: createdUser.username,
            summary: buildPermissionSummary(permissions),
          })
          await syncAdminData()
          return { ok: true, message: '审批通过，用户已创建并完成权限分配。' }
        } catch (error) {
          const message = error instanceof Error ? error.message : '瀹℃壒澶辫触锛岃绋嶅悗閲嶈瘯'
          return { ok: false, message }
        }
      },
      rejectRegistration: async (requestId) => {
        try {
          await rejectRegistrationRequest(requestId)
          await syncAdminData()
          return { ok: true, message: '申请已拒绝。' }
        } catch (error) {
          const message = error instanceof Error ? error.message : '鎷掔粷澶辫触锛岃绋嶅悗閲嶈瘯'
          return { ok: false, message }
        }
      },
      updatePermissions: async (userId, permissions) => {
        try {
          const nextUser = await updateUserPermissions(userId, permissions)
          void trackPermissionOpen({
            action: 'update',
            targetUserId: nextUser.id,
            targetUsername: nextUser.username,
            summary: buildPermissionSummary(permissions),
          })
          await syncAdminData()
          setUser((current) => (current?.id === nextUser.id ? nextUser : current))
          return { ok: true, message: '权限已更新。' }
        } catch (error) {
          const message = error instanceof Error ? error.message : '鏇存柊鏉冮檺澶辫触锛岃绋嶅悗閲嶈瘯'
          return { ok: false, message }
        }
      },
      canAccessChannel,
      canAccessStrategy,
    }),
    [canAccessChannel, canAccessStrategy, managedUsers, notice, pendingRequests, role, syncAdminData, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

