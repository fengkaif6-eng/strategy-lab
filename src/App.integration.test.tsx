import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AppRoutes } from './App'
import { Layout } from './components/Layout'
import { StrategyProvider } from './context/StrategyContext'
import { seedBacktestStrategies } from './data/seedStrategies'
import { resetStorage } from './services/strategyStorage'

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <StrategyProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </StrategyProvider>
    </MemoryRouter>,
  )
}

describe('app integration', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorage()
  })

  test('navigates from plaza card to strategy detail', async () => {
    const user = userEvent.setup()
    renderApp('/backtest-plaza')

    const strategy = seedBacktestStrategies[0]
    const link = screen.getByRole('link', { name: `查看策略 ${strategy.name} 详情` })
    await user.click(link)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: strategy.name }),
      ).toBeInTheDocument(),
    )
  })

  test('deleting a strategy in manager syncs to plaza', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp('/strategy-manage')

    const targetName = seedBacktestStrategies[0].name
    const deleteButton = screen.getAllByRole('button', { name: '删除' })[0]
    await user.click(deleteButton)

    await user.click(screen.getByRole('link', { name: '回测广场' }))
    await waitFor(() =>
      expect(screen.queryByText(targetName)).not.toBeInTheDocument(),
    )
    confirmSpy.mockRestore()
  })
})
