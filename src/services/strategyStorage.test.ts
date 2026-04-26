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

  test('loads seed data when storage is empty', async () => {
    const all = await loadAllStrategies()
    expect(all.backtest.length).toBeGreaterThan(0)
    expect(all.live.length).toBeGreaterThan(0)
  })

  test('supports upsert and delete in backtest channel', async () => {
    const first = (await loadStrategies('backtest'))[0]
    const updated = { ...first, name: 'test-updated' }
    await upsertStrategy(updated)

    const afterUpdate = (await loadStrategies('backtest')).find((item) => item.id === first.id)
    expect(afterUpdate?.name).toBe('test-updated')

    await deleteStrategy('backtest', first.id)
    const afterDelete = (await loadStrategies('backtest')).find((item) => item.id === first.id)
    expect(afterDelete).toBeUndefined()
  })

  test('keeps backtest and live channels isolated', async () => {
    const backtest = await loadStrategies('backtest')
    const live = await loadStrategies('live')
    await saveStrategies('backtest', backtest.slice(0, 1))

    const nextBacktest = await loadStrategies('backtest')
    const nextLive = await loadStrategies('live')
    expect(nextBacktest).toHaveLength(1)
    expect(nextLive).toHaveLength(live.length)
  })

  test('normalizes missing attachments on records', async () => {
    const legacy = JSON.parse(JSON.stringify(await loadStrategies('backtest'))) as Array<{
      detail: { attachments?: unknown }
    }>
    legacy.forEach((item) => {
      item.detail.attachments = undefined
    })
    await saveStrategies('backtest', legacy as any)

    const normalized = await loadStrategies('backtest')
    expect(Array.isArray(normalized[0].detail.attachments)).toBe(true)
  })
})
