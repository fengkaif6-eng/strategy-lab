import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { seedBacktestStrategies } from '../data/seedStrategies'
import { StrategyCard } from './StrategyCard'

describe('StrategyCard', () => {
  test('renders major metrics and detail link', () => {
    const strategy = seedBacktestStrategies[0]
    render(
      <MemoryRouter>
        <StrategyCard strategy={strategy} />
      </MemoryRouter>,
    )

    expect(screen.getByText(strategy.name)).toBeInTheDocument()
    expect(screen.getByText('年化收益')).toBeInTheDocument()
    const detailLink = screen.getByRole('link', { name: `查看策略 ${strategy.name} 详情` })
    expect(detailLink).toHaveAttribute(
      'href',
      `/strategy/${strategy.channel}/${strategy.id}`,
    )
  })
})
