import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PropsWithChildren,
} from 'react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { trackModuleVisit } from '../services/analyticsService'
import type { UserRole } from '../types/auth'
import type { StrategyChannel } from '../types/strategy'

interface NavItem {
  to: string
  labelZh: string
  labelEn: string
  minRole: UserRole
  requiredChannel?: StrategyChannel
}

const topNavItems: NavItem[] = [
  { to: '/', labelZh: '首页', labelEn: 'Home', minRole: 'guest' },
  { to: '/admin-console', labelZh: '后台管理', labelEn: 'Admin Console', minRole: 'admin' },
  { to: '/faq', labelZh: 'FAQ', labelEn: 'FAQ', minRole: 'user' },
]

const strategySubNavItems: NavItem[] = [
  {
    to: '/strategy-manage',
    labelZh: '策略管理',
    labelEn: 'Strategy Management',
    minRole: 'admin',
  },
  {
    to: '/incubation-strategies',
    labelZh: '孵化策略',
    labelEn: 'Incubation',
    minRole: 'user',
    requiredChannel: 'backtest',
  },
  {
    to: '/published-strategies',
    labelZh: '已发布策略',
    labelEn: 'Published',
    minRole: 'user',
    requiredChannel: 'live',
  },
  {
    to: '/third-party-strategies',
    labelZh: '第三方策略',
    labelEn: 'Third-Party',
    minRole: 'user',
    requiredChannel: 'thirdparty',
  },
  {
    to: '/strategy-compare',
    labelZh: '策略对比',
    labelEn: 'Strategy Comparison',
    minRole: 'user',
  },
]

const productSubNavItems: NavItem[] = [
  {
    to: '/product-intro',
    labelZh: '产品介绍',
    labelEn: 'Product Intro',
    minRole: 'user',
  },
  {
    to: '/product-quote',
    labelZh: '产品报价',
    labelEn: 'Product Quotes',
    minRole: 'user',
  },
]

const aboutSubNavItems: NavItem[] = [
  {
    to: '/about-us/market-insights',
    labelZh: '市场洞察',
    labelEn: 'Market Insights',
    minRole: 'user',
  },
  {
    to: '/about-us/business-updates',
    labelZh: '业务动态',
    labelEn: 'Business Updates',
    minRole: 'user',
  },
  {
    to: '/about-us/team-profile',
    labelZh: '团队简介',
    labelEn: 'Team Profile',
    minRole: 'user',
  },
]

const roleWeight: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
}
const MENU_CLOSE_DELAY_MS = 650

function canView(role: UserRole, minRole: UserRole) {
  return roleWeight[role] >= roleWeight[minRole]
}

export function Layout({ children }: PropsWithChildren) {
  const { role, user, logout, notice, setNotice, canAccessChannel } = useAuth()
  const { locale, setLocale, t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [strategyMenuOpen, setStrategyMenuOpen] = useState(false)
  const [productMenuOpen, setProductMenuOpen] = useState(false)
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false)
  const strategyCloseTimerRef = useRef<number | null>(null)
  const productCloseTimerRef = useRef<number | null>(null)
  const aboutCloseTimerRef = useRef<number | null>(null)
  const navLinksRef = useRef<HTMLElement | null>(null)

  const clearCloseTimer = (timerRef: MutableRefObject<number | null>) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clearAllCloseTimers = () => {
    clearCloseTimer(strategyCloseTimerRef)
    clearCloseTimer(productCloseTimerRef)
    clearCloseTimer(aboutCloseTimerRef)
  }

  const closeAllMenus = () => {
    setStrategyMenuOpen(false)
    setProductMenuOpen(false)
    setAboutMenuOpen(false)
  }

  useEffect(() => {
    void trackModuleVisit(location.pathname, role)
    clearAllCloseTimers()
    closeAllMenus()
  }, [location.pathname, role])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isJsdom =
        typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom')

      if (isJsdom) {
        document.documentElement.scrollTop = 0
        document.body.scrollTop = 0
        return
      }

      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }, [location.pathname])

  const noticeCode = searchParams.get('notice')
  const routeNotice =
    noticeCode === 'auth-required'
      ? t(
          '请先注册或登录后访问该页面。',
          'Please register or sign in before visiting this page.',
        )
      : noticeCode === 'forbidden'
        ? t(
            '当前账号暂无权限访问该页面。',
            'Your account does not have access to this page.',
          )
        : null

  const visibleTopNavItems = topNavItems.filter((item) => {
    if (!canView(role, item.minRole)) {
      return false
    }
    if (!item.requiredChannel) {
      return true
    }
    return canAccessChannel(item.requiredChannel)
  })

  const visibleStrategySubNavItems = strategySubNavItems.filter((item) => {
    if (!canView(role, item.minRole)) {
      return false
    }
    if (item.to === '/strategy-compare') {
      return (
        role === 'admin' ||
        canAccessChannel('backtest') ||
        canAccessChannel('live') ||
        canAccessChannel('thirdparty')
      )
    }
    if (!item.requiredChannel) {
      return true
    }
    return canAccessChannel(item.requiredChannel)
  })

  const visibleProductSubNavItems = productSubNavItems.filter((item) => {
    if (!canView(role, item.minRole)) {
      return false
    }
    if (!item.requiredChannel) {
      return true
    }
    return canAccessChannel(item.requiredChannel)
  })

  const visibleAboutSubNavItems = aboutSubNavItems.filter((item) => {
    if (!canView(role, item.minRole)) {
      return false
    }
    if (!item.requiredChannel) {
      return true
    }
    return canAccessChannel(item.requiredChannel)
  })

  const isStrategyRouteActive = strategySubNavItems.some((item) =>
    location.pathname.startsWith(item.to),
  )
  const isProductRouteActive = productSubNavItems.some((item) =>
    location.pathname.startsWith(item.to),
  )
  const isAboutRouteActive = aboutSubNavItems.some((item) =>
    location.pathname.startsWith(item.to),
  )

  const strategyDropdownItems =
    role === 'admin'
      ? visibleStrategySubNavItems
      : visibleStrategySubNavItems.filter((item) => item.to !== '/strategy-manage')

  const shouldUseStrategyDropdown = strategyDropdownItems.length > 0

  const scheduleClose = (
    timerRef: MutableRefObject<number | null>,
    closeMenu: () => void,
  ) => {
    clearCloseTimer(timerRef)
    timerRef.current = window.setTimeout(() => {
      closeMenu()
      timerRef.current = null
    }, MENU_CLOSE_DELAY_MS)
  }

  const openStrategyMenu = () => {
    clearCloseTimer(strategyCloseTimerRef)
    setStrategyMenuOpen(true)
    setProductMenuOpen(false)
    setAboutMenuOpen(false)
  }
  const closeStrategyMenu = () => {
    setStrategyMenuOpen(false)
  }

  const openProductMenu = () => {
    clearCloseTimer(productCloseTimerRef)
    setStrategyMenuOpen(false)
    setProductMenuOpen(true)
    setAboutMenuOpen(false)
  }
  const closeProductMenu = () => {
    setProductMenuOpen(false)
  }

  const openAboutMenu = () => {
    clearCloseTimer(aboutCloseTimerRef)
    setStrategyMenuOpen(false)
    setProductMenuOpen(false)
    setAboutMenuOpen(true)
  }
  const closeAboutMenu = () => {
    setAboutMenuOpen(false)
  }

  useEffect(() => {
    return () => {
      clearAllCloseTimers()
    }
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (navLinksRef.current?.contains(target)) {
        return
      }

      clearAllCloseTimers()
      closeAllMenus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      clearAllCloseTimers()
      closeAllMenus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const homeNavItem = visibleTopNavItems.find((item) => item.to === '/')
  const secondaryTopNavItems = visibleTopNavItems.filter((item) => item.to !== '/')

  const renderTopNavLink = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
      end={item.to === '/'}
    >
      {locale === 'zh' ? item.labelZh : item.labelEn}
    </NavLink>
  )

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
              <p className="brand-name">{t('固定收益客需部', 'Fixed Income Client Solutions')}</p>
              <p className="brand-subtitle">{t('量化策略展业平台', 'Quant Strategy Business Platform')}</p>
            </div>
          </Link>

          <div className="nav-right">
            <nav ref={navLinksRef} aria-label={t('主导航', 'Primary Navigation')} className="nav-links">
              {homeNavItem ? renderTopNavLink(homeNavItem) : null}

              {shouldUseStrategyDropdown ? (
                <div
                  className="nav-dropdown"
                  onMouseEnter={openStrategyMenu}
                  onMouseLeave={() => scheduleClose(strategyCloseTimerRef, closeStrategyMenu)}
                >
                  <button
                    type="button"
                    className={
                      isStrategyRouteActive || strategyMenuOpen
                        ? 'nav-link nav-link-active nav-dropdown-trigger'
                        : 'nav-link nav-dropdown-trigger'
                    }
                    aria-expanded={strategyMenuOpen}
                    aria-haspopup="menu"
                    onClick={openStrategyMenu}
                  >
                    {t('策略', 'Strategies')}
                  </button>
                  {strategyMenuOpen ? (
                    <div className="nav-dropdown-menu" role="menu">
                      {strategyDropdownItems.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          role="menuitem"
                          onClick={() => {
                            clearCloseTimer(strategyCloseTimerRef)
                            closeStrategyMenu()
                          }}
                          className={({ isActive }) =>
                            isActive
                              ? 'nav-dropdown-item nav-dropdown-item-active'
                              : 'nav-dropdown-item'
                          }
                        >
                          {locale === 'zh' ? item.labelZh : item.labelEn}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {visibleProductSubNavItems.length > 0 ? (
                <div
                  className="nav-dropdown"
                  onMouseEnter={openProductMenu}
                  onMouseLeave={() => scheduleClose(productCloseTimerRef, closeProductMenu)}
                >
                  <button
                    type="button"
                    className={
                      isProductRouteActive || productMenuOpen
                        ? 'nav-link nav-link-active nav-dropdown-trigger'
                        : 'nav-link nav-dropdown-trigger'
                    }
                    aria-expanded={productMenuOpen}
                    aria-haspopup="menu"
                    onClick={openProductMenu}
                  >
                    {t('产品', 'Products')}
                  </button>
                  {productMenuOpen ? (
                    <div className="nav-dropdown-menu" role="menu">
                      {visibleProductSubNavItems.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          role="menuitem"
                          onClick={() => {
                            clearCloseTimer(productCloseTimerRef)
                            closeProductMenu()
                          }}
                          className={({ isActive }) =>
                            isActive
                              ? 'nav-dropdown-item nav-dropdown-item-active'
                              : 'nav-dropdown-item'
                          }
                        >
                          {locale === 'zh' ? item.labelZh : item.labelEn}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {visibleAboutSubNavItems.length > 0 ? (
                <div
                  className="nav-dropdown"
                  onMouseEnter={openAboutMenu}
                  onMouseLeave={() => scheduleClose(aboutCloseTimerRef, closeAboutMenu)}
                >
                  <button
                    type="button"
                    className={
                      isAboutRouteActive || aboutMenuOpen
                        ? 'nav-link nav-link-active nav-dropdown-trigger'
                        : 'nav-link nav-dropdown-trigger'
                    }
                    aria-expanded={aboutMenuOpen}
                    aria-haspopup="menu"
                    onClick={openAboutMenu}
                  >
                    {t('关于我们', 'About Us')}
                  </button>
                  {aboutMenuOpen ? (
                    <div className="nav-dropdown-menu" role="menu">
                      {visibleAboutSubNavItems.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          role="menuitem"
                          onClick={() => {
                            clearCloseTimer(aboutCloseTimerRef)
                            closeAboutMenu()
                          }}
                          className={({ isActive }) =>
                            isActive
                              ? 'nav-dropdown-item nav-dropdown-item-active'
                              : 'nav-dropdown-item'
                          }
                        >
                          {locale === 'zh' ? item.labelZh : item.labelEn}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {secondaryTopNavItems.map((item) => renderTopNavLink(item))}
            </nav>

            <button
              type="button"
              className="lang-toggle"
              onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
              aria-label={locale === 'zh' ? 'Switch language to English' : '切换语言为简体中文'}
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
                    setNotice(t('你已退出登录。', 'You have signed out.'))
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

      <main
        className={
          location.pathname === '/'
            ? 'main-content main-content-home container'
            : 'main-content container'
        }
      >
        {children}
      </main>
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
