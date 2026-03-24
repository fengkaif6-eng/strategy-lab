import type { AuthUser } from '../types/auth'

interface StoredUser extends AuthUser {
  password: string
}

const STORAGE_KEYS = {
  users: 'strategy-lab/auth/users',
  session: 'strategy-lab/auth/session',
} as const

const ADMIN_USER: StoredUser = {
  id: 'admin-local',
  username: 'admin',
  role: 'admin',
  token: 'admin-token-local',
  registeredAt: '2026-03-24',
  password: 'Admin@123456',
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
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
  localStorage.setItem(key, JSON.stringify(value))
}

function toPublicUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    token: user.token,
    registeredAt: user.registeredAt,
  }
}

function buildToken() {
  return `tk_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

function getStoredUsers(): StoredUser[] {
  const users = readJson<StoredUser[]>(STORAGE_KEYS.users, [])
  const hasAdmin = users.some((item) => item.username === ADMIN_USER.username)
  if (hasAdmin) {
    return users
  }
  const merged = [ADMIN_USER, ...users]
  writeJson(STORAGE_KEYS.users, merged)
  return merged
}

function saveStoredUsers(users: StoredUser[]) {
  writeJson(STORAGE_KEYS.users, users)
}

export function loadSession(): AuthUser | null {
  return readJson<AuthUser | null>(STORAGE_KEYS.session, null)
}

function saveSession(user: AuthUser) {
  writeJson(STORAGE_KEYS.session, user)
}

export async function loginUser(
  username: string,
  password: string,
): Promise<AuthUser> {
  // TODO: replace with backend API call.
  const users = getStoredUsers()
  const found = users.find((item) => item.username === username.trim())
  if (!found || found.password !== password) {
    throw new Error('用户名或密码错误')
  }
  const session: AuthUser = {
    ...toPublicUser(found),
    token: buildToken(),
  }
  saveSession(session)
  return session
}

export async function registerUser(
  username: string,
  password: string,
): Promise<AuthUser> {
  // TODO: replace with backend API call.
  const trimmed = username.trim()
  if (trimmed.length < 3) {
    throw new Error('用户名至少 3 位')
  }
  if (password.length < 6) {
    throw new Error('密码至少 6 位')
  }
  const users = getStoredUsers()
  if (users.some((item) => item.username.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('用户名已存在')
  }

  const user: StoredUser = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    username: trimmed,
    role: 'user',
    token: buildToken(),
    registeredAt: new Date().toISOString().slice(0, 10),
    password,
  }
  const nextUsers = [...users, user]
  saveStoredUsers(nextUsers)
  const session = toPublicUser(user)
  saveSession(session)
  return session
}

export function logoutUser() {
  localStorage.removeItem(STORAGE_KEYS.session)
}

export function resetAuthStorage() {
  localStorage.removeItem(STORAGE_KEYS.users)
  localStorage.removeItem(STORAGE_KEYS.session)
}
