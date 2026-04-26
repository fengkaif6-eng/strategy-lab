import type {
  BacktestStrategyRecord,
  LiveStrategyRecord,
  ThirdPartyStrategyRecord,
  StrategyChannel,
  StrategyCollection,
  StrategyRecord,
} from '../types/strategy'
import { apiJson } from './apiBase'
import { sanitizeStrategyCollection, sanitizeStrategyRecord } from '../utils/strategyTextSanitizer'

const EMPTY_STRATEGY_COLLECTION: StrategyCollection = {
  backtest: [],
  live: [],
  thirdparty: [],
}

let lastSuccessfulCollection: StrategyCollection | null = null

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeBacktest(record: BacktestStrategyRecord): BacktestStrategyRecord {
  return sanitizeStrategyRecord({
    ...record,
    detail: {
      ...record.detail,
      attachments: Array.isArray(record.detail.attachments) ? record.detail.attachments : [],
    },
  })
}

function normalizeLive(record: LiveStrategyRecord): LiveStrategyRecord {
  return sanitizeStrategyRecord({
    ...record,
    detail: {
      ...record.detail,
      attachments: Array.isArray(record.detail.attachments) ? record.detail.attachments : [],
    },
  })
}

function normalizeThirdParty(record: ThirdPartyStrategyRecord): ThirdPartyStrategyRecord {
  return sanitizeStrategyRecord({
    ...record,
    detail: {
      ...record.detail,
      attachments: Array.isArray(record.detail.attachments) ? record.detail.attachments : [],
    },
  })
}

function normalizeCollection(payload: Partial<StrategyCollection> | null | undefined): StrategyCollection {
  return sanitizeStrategyCollection({
    backtest: Array.isArray(payload?.backtest)
      ? payload.backtest.map((item) => normalizeBacktest(item as BacktestStrategyRecord))
      : [],
    live: Array.isArray(payload?.live)
      ? payload.live.map((item) => normalizeLive(item as LiveStrategyRecord))
      : [],
    thirdparty: Array.isArray(payload?.thirdparty)
      ? payload.thirdparty.map((item) => normalizeThirdParty(item as ThirdPartyStrategyRecord))
      : [],
  })
}

function rememberLatest(collection: StrategyCollection): StrategyCollection {
  const cloned = deepClone(collection)
  lastSuccessfulCollection = cloned
  return cloned
}

function getFallbackCollection(): StrategyCollection {
  if (lastSuccessfulCollection) {
    return deepClone(lastSuccessfulCollection)
  }
  return deepClone(EMPTY_STRATEGY_COLLECTION)
}

export async function loadAllStrategies(): Promise<StrategyCollection> {
  try {
    const response = await apiJson<StrategyCollection>('/api/strategies')
    return rememberLatest(normalizeCollection(response))
  } catch {
    return getFallbackCollection()
  }
}

export async function loadStrategies(channel: 'backtest'): Promise<BacktestStrategyRecord[]>
export async function loadStrategies(channel: 'live'): Promise<LiveStrategyRecord[]>
export async function loadStrategies(channel: 'thirdparty'): Promise<ThirdPartyStrategyRecord[]>
export async function loadStrategies(channel: StrategyChannel): Promise<StrategyRecord[]> {
  const all = await loadAllStrategies()
  if (channel === 'backtest') {
    return all.backtest
  }
  if (channel === 'live') {
    return all.live
  }
  return all.thirdparty
}

export async function upsertStrategy(strategy: StrategyRecord): Promise<StrategyRecord[]> {
  const response = await apiJson<StrategyCollection>('/api/admin/strategies', {
    method: 'POST',
    body: JSON.stringify({ strategy }),
  })
  const normalized = rememberLatest(normalizeCollection(response))
  if (strategy.channel === 'backtest') {
    return normalized.backtest
  }
  if (strategy.channel === 'live') {
    return normalized.live
  }
  return normalized.thirdparty
}

export async function moveStrategy(
  fromChannel: StrategyChannel,
  toChannel: StrategyChannel,
  strategyId: string,
): Promise<StrategyCollection> {
  const response = await apiJson<StrategyCollection>('/api/admin/strategies/move', {
    method: 'POST',
    body: JSON.stringify({
      fromChannel,
      toChannel,
      strategyId,
    }),
  })
  return rememberLatest(normalizeCollection(response))
}

export async function deleteStrategy(
  channel: StrategyChannel,
  id: string,
): Promise<StrategyRecord[]> {
  const encodedChannel = encodeURIComponent(channel)
  const encodedId = encodeURIComponent(id)
  const response = await apiJson<StrategyCollection>(
    `/api/admin/strategies/${encodedChannel}/${encodedId}`,
    {
      method: 'DELETE',
    },
  )
  const normalized = rememberLatest(normalizeCollection(response))
  if (channel === 'backtest') {
    return normalized.backtest
  }
  if (channel === 'live') {
    return normalized.live
  }
  return normalized.thirdparty
}

export async function saveStrategies(
  channel: 'backtest',
  strategies: BacktestStrategyRecord[],
): Promise<void>
export async function saveStrategies(
  channel: 'live',
  strategies: LiveStrategyRecord[],
): Promise<void>
export async function saveStrategies(
  channel: 'thirdparty',
  strategies: ThirdPartyStrategyRecord[],
): Promise<void>
export async function saveStrategies(
  channel: StrategyChannel,
  strategies: BacktestStrategyRecord[] | LiveStrategyRecord[] | ThirdPartyStrategyRecord[],
): Promise<void> {
  const response = await apiJson<StrategyCollection>(`/api/admin/strategies/${channel}`, {
    method: 'PUT',
    body: JSON.stringify({ strategies }),
  })
  rememberLatest(normalizeCollection(response))
}

export function resetStorage() {
  lastSuccessfulCollection = null
}
