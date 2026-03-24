import { seedStrategies } from '../data/seedStrategies'
import type {
  BacktestStrategyRecord,
  LiveStrategyRecord,
  StrategyChannel,
  StrategyCollection,
  StrategyRecord,
} from '../types/strategy'

const STORAGE_KEYS = {
  backtest: 'strategy-lab/backtest',
  live: 'strategy-lab/live',
} as const

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getSeedByChannel(channel: 'backtest'): BacktestStrategyRecord[]
function getSeedByChannel(channel: 'live'): LiveStrategyRecord[]
function getSeedByChannel(channel: StrategyChannel) {
  return deepClone(seedStrategies[channel])
}

function readStorage<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

function writeStorage<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function loadStrategies(channel: 'backtest'): BacktestStrategyRecord[]
export function loadStrategies(channel: 'live'): LiveStrategyRecord[]
export function loadStrategies(channel: StrategyChannel) {
  if (channel === 'backtest') {
    const key = STORAGE_KEYS.backtest
    const fromStorage = readStorage<BacktestStrategyRecord[]>(key)
    if (fromStorage) {
      return fromStorage
    }
    const seed = getSeedByChannel(channel)
    writeStorage(key, seed)
    return seed
  }

  const key = STORAGE_KEYS.live
  const fromStorage = readStorage<LiveStrategyRecord[]>(key)
  if (fromStorage) {
    return fromStorage
  }
  const seed = getSeedByChannel(channel)
  writeStorage(key, seed)
  return seed
}

export function loadAllStrategies(): StrategyCollection {
  return {
    backtest: loadStrategies('backtest'),
    live: loadStrategies('live'),
  }
}

export function saveStrategies(
  channel: 'backtest',
  strategies: BacktestStrategyRecord[],
): void
export function saveStrategies(
  channel: 'live',
  strategies: LiveStrategyRecord[],
): void
export function saveStrategies(
  channel: StrategyChannel,
  strategies: BacktestStrategyRecord[] | LiveStrategyRecord[],
) {
  if (channel === 'backtest') {
    writeStorage(STORAGE_KEYS.backtest, strategies as BacktestStrategyRecord[])
    return
  }
  writeStorage(STORAGE_KEYS.live, strategies as LiveStrategyRecord[])
}

export function upsertStrategy(strategy: StrategyRecord): StrategyRecord[] {
  if (strategy.channel === 'backtest') {
    const current = loadStrategies('backtest')
    const index = current.findIndex((item) => item.id === strategy.id)
    if (index >= 0) {
      current[index] = strategy
    } else {
      current.unshift(strategy)
    }
    saveStrategies('backtest', current)
    return current
  }

  const current = loadStrategies('live')
  const index = current.findIndex((item) => item.id === strategy.id)
  if (index >= 0) {
    current[index] = strategy
  } else {
    current.unshift(strategy)
  }
  saveStrategies('live', current)
  return current
}

export function deleteStrategy(channel: StrategyChannel, id: string): StrategyRecord[] {
  if (channel === 'backtest') {
    const next = loadStrategies(channel).filter((item) => item.id !== id)
    saveStrategies(channel, next)
    return next
  }

  const next = loadStrategies(channel).filter((item) => item.id !== id)
  saveStrategies(channel, next)
  return next
}

export function resetStorage() {
  localStorage.removeItem(STORAGE_KEYS.backtest)
  localStorage.removeItem(STORAGE_KEYS.live)
}
