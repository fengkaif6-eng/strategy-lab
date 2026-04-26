import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { LocaleProvider, useLocale } from './context/LocaleContext'
import { StrategyProvider } from './context/StrategyContext'
import { AdminConsolePage } from './pages/AdminConsolePage'
import { AboutSectionPage } from './pages/AboutSectionPage'
import { AuthPage } from './pages/AuthPage'
import { HelpDocsPage } from './pages/HelpDocsPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlazaPage } from './pages/PlazaPage'
import { ProductIntroPage } from './pages/ProductIntroPage'
import { ProductQuotePage } from './pages/ProductQuotePage'
import { StrategyComparePage } from './pages/StrategyComparePage'
import { StrategyDetailPage } from './pages/StrategyDetailPage'
import { StrategyManagePage } from './pages/StrategyManagePage'

export function AppRoutes() {
  const { t } = useLocale()

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route
        element={
          <ProtectedRoute
            allowedRoles={['user', 'admin']}
            requiredChannel="backtest"
          />
        }
      >
        <Route
          path="/incubation-strategies"
          element={<PlazaPage channel="backtest" title={t('孵化策略', 'Incubation Strategies')} />}
        />
      </Route>

      <Route
        element={
          <ProtectedRoute
            allowedRoles={['user', 'admin']}
            requiredChannel="live"
          />
        }
      >
        <Route
          path="/published-strategies"
          element={<PlazaPage channel="live" title={t('已发布策略', 'Published Strategies')} />}
        />
      </Route>

      <Route
        element={
          <ProtectedRoute
            allowedRoles={['user', 'admin']}
            requiredChannel="thirdparty"
          />
        }
      >
        <Route
          path="/third-party-strategies"
          element={<PlazaPage channel="thirdparty" title={t('第三方策略', 'Third-Party Strategies')} />}
        />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['user', 'admin']} />}>
        <Route path="/faq" element={<HelpDocsPage />} />
        <Route
          path="/about-us/market-insights"
          element={<AboutSectionPage section="market-insights" />}
        />
        <Route
          path="/about-us/business-updates"
          element={<AboutSectionPage section="business-updates" />}
        />
        <Route
          path="/about-us/team-profile"
          element={<AboutSectionPage section="team-profile" />}
        />
        <Route path="/product-intro" element={<ProductIntroPage />} />
        <Route path="/product-intro/*" element={<ProductIntroPage />} />
        <Route path="/product-quote" element={<ProductQuotePage />} />
        <Route path="/product-quote/*" element={<ProductQuotePage />} />
        <Route path="/strategy-compare" element={<StrategyComparePage />} />
        <Route path="/strategy/:channel/:id" element={<StrategyDetailPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/strategy-manage" element={<StrategyManagePage />} />
        <Route path="/admin-console" element={<AdminConsolePage />} />
      </Route>

      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route
        path="/backtest-plaza"
        element={<Navigate to="/incubation-strategies" replace />}
      />
      <Route
        path="/live-plaza"
        element={<Navigate to="/published-strategies" replace />}
      />
      <Route
        path="/thirdparty-plaza"
        element={<Navigate to="/third-party-strategies" replace />}
      />
      <Route path="/help-docs" element={<Navigate to="/faq" replace />} />
      <Route
        path="/about-us"
        element={<Navigate to="/about-us/market-insights" replace />}
      />
      <Route path="/product" element={<Navigate to="/product-intro" replace />} />
      <Route path="/products" element={<Navigate to="/product-intro" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <StrategyProvider>
          <Layout>
            <AppRoutes />
          </Layout>
        </StrategyProvider>
      </AuthProvider>
    </LocaleProvider>
  )
}
