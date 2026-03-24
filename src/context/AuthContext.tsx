import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  loadSession,
  loginUser,
  logoutUser,
  registerUser,
} from '../services/authService'
import type { AuthUser, UserRole } from '../types/auth'

interface AuthResult {
  ok: boolean
  user?: AuthUser
  message?: string
}

interface AuthContextValue {
  user: AuthUser | null
  role: UserRole
  isAuthenticated: boolean
  notice: string | null
  setNotice: (value: string | null) => void
  login: (username: string, password: string) => Promise<AuthResult>
  register: (username: string, password: string) => Promise<AuthResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(() => loadSession())
  const [notice, setNotice] = useState<string | null>(null)

  const role: UserRole = user?.role ?? 'guest'

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      isAuthenticated: role !== 'guest',
      notice,
      setNotice,
      login: async (username, password) => {
        try {
          const nextUser = await loginUser(username, password)
          setUser(nextUser)
          return { ok: true, user: nextUser }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : '登录失败，请稍后重试'
          return { ok: false, message }
        }
      },
      register: async (username, password) => {
        try {
          const nextUser = await registerUser(username, password)
          setUser(nextUser)
          return { ok: true, user: nextUser }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : '注册失败，请稍后重试'
          return { ok: false, message }
        }
      },
      logout: () => {
        logoutUser()
        setUser(null)
      },
    }),
    [notice, role, user],
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
