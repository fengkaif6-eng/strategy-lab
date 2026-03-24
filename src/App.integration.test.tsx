import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppRoutes } from './App'
import { Layout } from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { StrategyProvider } from './context/StrategyContext'
import { seedBacktestStrategies } from './data/seedStrategies'
import { loginUser, registerUser, resetAuthStorage } from './services/authService'
import { resetStorage } from './services/strategyStorage'

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <StrategyProvider>
          <Layout>
            <AppRoutes />
          </Layout>
        </StrategyProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('app integration', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorage()
    resetAuthStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          'v_s_sh000001="1~上证指数~000001~3881.28~68.00~1.78~";v_s_sz399001="51~深证成指~399001~13536.56~191.05~1.43~";v_s_sz399006="51~创业板指~399006~3251.55~16.33~0.50~";v_s_sh000688="1~科创50~000688~1290.79~29.35~2.33~";v_s_sh600519="1~贵州茅台~600519~1689.00~11.00~0.66~";',
          {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          },
        )
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('guest is redirected to home from protected route', async () => {
    renderApp('/incubation-strategies')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '量化策略平台' })).toBeInTheDocument(),
    )
    expect(screen.getByText('请先注册或登录后访问该页面')).toBeInTheDocument()
  })

  test('registered user sees non-admin navigation only', async () => {
    await registerUser('investor', '123456')
    renderApp('/')

    await waitFor(() =>
      expect(screen.getByRole('link', { name: '孵化策略' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('link', { name: '策略管理' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'FAQ' })).toBeInTheDocument()
  })

  test('admin deletes strategy and plaza updates', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await loginUser('admin', 'Admin@123456')

    renderApp('/strategy-manage')
    const targetName = seedBacktestStrategies[0].name

    const deleteButton = await screen.findAllByRole('button', { name: '删除' })
    await user.click(deleteButton[0])
    await user.click(screen.getByRole('link', { name: '孵化策略' }))

    await waitFor(() =>
      expect(screen.queryByText(targetName)).not.toBeInTheDocument(),
    )
    confirmSpy.mockRestore()
  })
})
