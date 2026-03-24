import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { StrategyProvider } from './context/StrategyContext'
import { AuthPage } from './pages/AuthPage'
import { HelpDocsPage } from './pages/HelpDocsPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlazaPage } from './pages/PlazaPage'
import { StrategyDetailPage } from './pages/StrategyDetailPage'
import { StrategyManagePage } from './pages/StrategyManagePage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route element={<ProtectedRoute allowedRoles={['user', 'admin']} />}>
        <Route
          path="/incubation-strategies"
          element={<PlazaPage channel="backtest" title="孵化策略" />}
        />
        <Route
          path="/published-strategies"
          element={<PlazaPage channel="live" title="已发布策略" />}
        />
        <Route path="/faq" element={<HelpDocsPage />} />
        <Route path="/strategy/:channel/:id" element={<StrategyDetailPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/strategy-manage" element={<StrategyManagePage />} />
      </Route>

      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="/backtest-plaza" element={<Navigate to="/incubation-strategies" replace />} />
      <Route path="/live-plaza" element={<Navigate to="/published-strategies" replace />} />
      <Route path="/help-docs" element={<Navigate to="/faq" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <StrategyProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </StrategyProvider>
    </AuthProvider>
  )
}
