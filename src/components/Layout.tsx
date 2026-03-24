import type { PropsWithChildren } from 'react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import type { UserRole } from '../types/auth'

interface NavItem {
  to: string
  labelZh: string
  labelEn: string
  minRole: UserRole
}

const navItems: NavItem[] = [
  { to: '/', labelZh: '首页', labelEn: 'Home', minRole: 'guest' },
  {
    to: '/strategy-manage',
    labelZh: '策略管理',
    labelEn: 'Strategy Admin',
    minRole: 'admin',
  },
  {
    to: '/incubation-strategies',
    labelZh: '孵化策略',
    labelEn: 'Incubation',
    minRole: 'user',
  },
  {
    to: '/published-strategies',
    labelZh: '已发布策略',
    labelEn: 'Published',
    minRole: 'user',
  },
  { to: '/faq', labelZh: 'FAQ', labelEn: 'FAQ', minRole: 'user' },
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
  const { locale, setLocale, t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const noticeCode = searchParams.get('notice')
  const routeNotice =
    noticeCode === 'auth-required'
      ? t('请先注册或登录后访问该页面', 'Please register or sign in before visiting this page.')
      : noticeCode === 'forbidden'
        ? t('当前账号无权限访问该页面', 'Your account does not have access to this page.')
        : null

  const visibleNavItems = navItems.filter((item) => canView(role, item.minRole))

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="container nav-inner">
          <Link className="brand-block" to="/">
            <img
              src="/guotai-haitong-logo.png"
              alt={t('国泰海通', 'Guotai Haitong')}
              className="brand-logo-image"
            />
            <div>
              <p className="brand-name">
                {t('固定收益客需部', 'Fixed Income Client Solutions')}
              </p>
              <p className="brand-subtitle">
                {t('量化策略平台', 'Quant Strategy Platform')}
              </p>
            </div>
          </Link>

          <div className="nav-right">
            <nav
              aria-label={t('主导航', 'Primary Navigation')}
              className="nav-links"
            >
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? 'nav-link nav-link-active' : 'nav-link'
                  }
                  end={item.to === '/'}
                >
                  {locale === 'zh' ? item.labelZh : item.labelEn}
                </NavLink>
              ))}
            </nav>

            <button
              type="button"
              className="lang-toggle"
              onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
              aria-label={
                locale === 'zh'
                  ? 'Switch language to English'
                  : '切换语言为简体中文'
              }
              title={t('切换语言', 'Switch language')}
            >
              <span className={locale === 'zh' ? 'lang-segment lang-active' : 'lang-segment'}>
                简
              </span>
              <span className="lang-divider">|</span>
              <span className={locale === 'en' ? 'lang-segment lang-active' : 'lang-segment'}>
                EN
              </span>
            </button>

            {role === 'guest' ? (
              <div className="auth-actions">
                <Link className="btn btn-secondary" to="/login">
                  {t('登录', 'Sign In')}
                </Link>
                <Link className="btn btn-primary" to="/register">
                  {t('注册', 'Register')}
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
                    setNotice(t('你已退出登录', 'You have signed out.'))
                  }}
                >
                  {t('退出登录', 'Sign Out')}
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
            aria-label={t('关闭提示', 'Close notice')}
          >
            ×
          </button>
        </div>
      ) : null}

      <main className="main-content container">{children}</main>
      <footer className="footer container">
        <p>
          {t(
            '固定收益客需部 | 数据仅用于策略研究与展示，不构成投资建议。',
            'Fixed Income Client Solutions | For strategy research and presentation only, not investment advice.',
          )}
        </p>
      </footer>
    </div>
  )
}
