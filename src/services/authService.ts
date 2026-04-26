import { apiJson } from './apiBase'
import type {
  AuthUser,
  RegistrationPayload,
  RegistrationRequest,
  StrategyPermissionSet,
} from '../types/auth'
import type { StrategyChannel } from '../types/strategy'

const STORAGE_KEYS = {
  session: 'strategy-lab/auth/session',
} as const

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(key, JSON.stringify(value))
}

function buildToken() {
  return `tk_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

export function loadSession(): AuthUser | null {
  return readJson<AuthUser | null>(STORAGE_KEYS.session, null)
}

function saveSession(user: AuthUser) {
  writeJson(STORAGE_KEYS.session, user)
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  const user = await apiJson<AuthUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  const session = { ...user, token: user.token || buildToken() }
  saveSession(session)
  return session
}

export async function registerUser(payload: RegistrationPayload): Promise<RegistrationRequest> {
  return apiJson<RegistrationRequest>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listRegistrationRequests(): Promise<RegistrationRequest[]> {
  return apiJson<RegistrationRequest[]>('/api/admin/requests')
}

export async function listManagedUsers(): Promise<AuthUser[]> {
  return apiJson<AuthUser[]>('/api/admin/users')
}

export async function approveRegistrationRequest(
  requestId: string,
  permissions: StrategyPermissionSet,
): Promise<AuthUser> {
  return apiJson<AuthUser>(`/api/admin/requests/${requestId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ permissions }),
  })
}

export async function rejectRegistrationRequest(requestId: string): Promise<void> {
  await apiJson(`/api/admin/requests/${requestId}/reject`, {
    method: 'POST',
  })
}

export async function updateUserPermissions(
  userId: string,
  permissions: StrategyPermissionSet,
): Promise<AuthUser> {
  const user = await apiJson<AuthUser>(`/api/admin/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  })

  const session = loadSession()
  if (session?.id === user.id) {
    saveSession({ ...user, token: session.token || user.token || buildToken() })
  }

  return user
}

export function hasChannelAccess(user: AuthUser | null, channel: StrategyChannel): boolean {
  if (!user) {
    return false
  }
  if (user.role === 'admin') {
    return true
  }
  const thirdPartyIds = Array.isArray(user.permissions.thirdPartyStrategyIds)
    ? user.permissions.thirdPartyStrategyIds
    : []
  if (channel === 'backtest') {
    return user.permissions.allowBacktest || user.permissions.backtestStrategyIds.length > 0
  }
  if (channel === 'live') {
    return user.permissions.allowLive || user.permissions.liveStrategyIds.length > 0
  }
  return Boolean(user.permissions.allowThirdParty) || thirdPartyIds.length > 0
}

export function hasStrategyAccess(
  user: AuthUser | null,
  channel: StrategyChannel,
  strategyId: string,
): boolean {
  if (!user) {
    return false
  }
  if (user.role === 'admin') {
    return true
  }
  const thirdPartyIds = Array.isArray(user.permissions.thirdPartyStrategyIds)
    ? user.permissions.thirdPartyStrategyIds
    : []
  if (channel === 'backtest') {
    return (
      user.permissions.allowBacktest || user.permissions.backtestStrategyIds.includes(strategyId)
    )
  }
  if (channel === 'live') {
    return user.permissions.allowLive || user.permissions.liveStrategyIds.includes(strategyId)
  }
  return Boolean(user.permissions.allowThirdParty) || thirdPartyIds.includes(strategyId)
}

export function logoutUser() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(STORAGE_KEYS.session)
}

export function resetAuthStorage() {
  logoutUser()
}
