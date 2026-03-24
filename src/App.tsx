import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { StrategyProvider } from './context/StrategyContext'
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
      <Route path="/strategy-manage" element={<StrategyManagePage />} />
      <Route
        path="/backtest-plaza"
        element={<PlazaPage channel="backtest" title="回测广场" />}
      />
      <Route
        path="/live-plaza"
        element={<PlazaPage channel="live" title="实盘广场" />}
      />
      <Route path="/help-docs" element={<HelpDocsPage />} />
      <Route path="/strategy/:channel/:id" element={<StrategyDetailPage />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <StrategyProvider>
      <Layout>
        <AppRoutes />
      </Layout>
    </StrategyProvider>
  )
}
