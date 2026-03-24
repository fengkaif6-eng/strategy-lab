import type { PropsWithChildren } from 'react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/auth'

interface NavItem {
  to: string
  label: string
  minRole: UserRole
}

const navItems: NavItem[] = [
  { to: '/', label: '首页', minRole: 'guest' },
  { to: '/strategy-manage', label: '策略管理', minRole: 'admin' },
  { to: '/incubation-strategies', label: '孵化策略', minRole: 'user' },
  { to: '/published-strategies', label: '已发布策略', minRole: 'user' },
  { to: '/faq', label: 'FAQ', minRole: 'user' },
]

const roleWeight: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
}

function canView(role: UserRole, minRole: UserRole) {
  return roleWeight[role] >= roleWeight[minRole]
}

export function Layout({ children }: PropsWithChildren) {
  const { role, user, logout, notice, setNotice } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const noticeCode = searchParams.get('notice')
  const routeNotice =
    noticeCode === 'auth-required'
      ? '请先注册或登录后访问该页面'
      : noticeCode === 'forbidden'
        ? '当前账号无权限访问该页面'
        : null

  const visibleNavItems = navItems.filter((item) => canView(role, item.minRole))

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="container nav-inner">
          <Link className="brand-block" to="/">
            <img
              src="/guotai-haitong-logo.svg"
              alt="国泰海通"
              className="brand-logo-image"
            />
            <div>
              <p className="brand-name">固定收益客需部</p>
              <p className="brand-subtitle">量化策略展示平台</p>
            </div>
          </Link>
          <div className="nav-right">
            <nav aria-label="主导航" className="nav-links">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? 'nav-link nav-link-active' : 'nav-link'
                  }
                  end={item.to === '/'}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            {role === 'guest' ? (
              <div className="auth-actions">
                <Link className="btn btn-secondary" to="/login">
                  登录
                </Link>
                <Link className="btn btn-primary" to="/register">
                  注册
                </Link>
              </div>
            ) : (
              <div className="auth-actions">
                <span className="user-badge">{user?.username}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    logout()
                    setNotice('你已退出登录')
                  }}
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {routeNotice || notice ? (
        <div className="container notice-bar" role="status">
          <span>{routeNotice ?? notice}</span>
          <button
            className="notice-close"
            type="button"
            onClick={() => {
              setNotice(null)
              if (routeNotice) {
                navigate(location.pathname, { replace: true })
              }
            }}
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      ) : null}

      <main className="main-content container">{children}</main>
      <footer className="footer container">
        <p>固定收益客需部 | 数据仅用于策略研究与展示，不构成投资建议。</p>
      </footer>
    </div>
  )
}
