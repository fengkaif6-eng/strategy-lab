import { beforeEach, describe, expect, test } from 'vitest'
import {
  deleteStrategy,
  loadAllStrategies,
  loadStrategies,
  resetStorage,
  saveStrategies,
  upsertStrategy,
} from './strategyStorage'

describe('strategyStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorage()
  })

  test('loads seed data when storage is empty', () => {
    const all = loadAllStrategies()
    expect(all.backtest.length).toBeGreaterThan(0)
    expect(all.live.length).toBeGreaterThan(0)
  })

  test('supports upsert and delete in backtest channel', () => {
    const first = loadStrategies('backtest')[0]
    const updated = { ...first, name: '测试策略-updated' }
    upsertStrategy(updated)

    const afterUpdate = loadStrategies('backtest').find((item) => item.id === first.id)
    expect(afterUpdate?.name).toBe('测试策略-updated')

    deleteStrategy('backtest', first.id)
    const afterDelete = loadStrategies('backtest').find((item) => item.id === first.id)
    expect(afterDelete).toBeUndefined()
  })

  test('keeps backtest and live channels isolated', () => {
    const backtest = loadStrategies('backtest')
    const live = loadStrategies('live')
    saveStrategies('backtest', backtest.slice(0, 1))

    const nextBacktest = loadStrategies('backtest')
    const nextLive = loadStrategies('live')
    expect(nextBacktest).toHaveLength(1)
    expect(nextLive).toHaveLength(live.length)
  })

  test('normalizes missing attachments on legacy records', () => {
    const legacy = JSON.parse(JSON.stringify(loadStrategies('backtest'))) as Array<{
      detail: { attachments?: unknown }
    }>
    legacy.forEach((item) => {
      item.detail.attachments = undefined
    })
    localStorage.setItem('strategy-lab/backtest', JSON.stringify(legacy))

    const normalized = loadStrategies('backtest')
    expect(Array.isArray(normalized[0].detail.attachments)).toBe(true)
  })
})
