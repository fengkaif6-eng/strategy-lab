import type { PropsWithChildren } from 'react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: '首页' },
  { to: '/strategy-manage', label: '策略管理' },
  { to: '/backtest-plaza', label: '回测广场' },
  { to: '/live-plaza', label: '实盘广场' },
  { to: '/help-docs', label: '帮助文档' },
]

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="container nav-inner">
          <div className="brand-block">
            <div className="brand-logo" aria-hidden>
              SL
            </div>
            <div>
              <p className="brand-name">Strategy Lab</p>
              <p className="brand-subtitle">量化策略验证与实盘平台</p>
            </div>
          </div>
          <nav aria-label="主导航" className="nav-links">
            {navItems.map((item) => (
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
        </div>
      </header>
      <main className="main-content container">{children}</main>
      <footer className="footer container">
        <p>Strategy Lab · 数据仅用于策略研究演示，不构成投资建议。</p>
      </footer>
    </div>
  )
}
