import type {
  HomeMarketPayload,
  MarketCard,
  MarketSeries,
  MarketSeriesPoint,
  MarketTickerQuote,
} from '../types/market'
import { API_BASE_URL } from './apiBase'

const HOME_MARKET_ENDPOINT = API_BASE_URL
  ? `${API_BASE_URL}/api/market/home`
  : '/api/market/home'
const HOME_MARKET_REQUEST_TIMEOUT_MS = 9_000
const HOME_MARKET_FALLBACK_TIMEOUT_MS = 3_000

function getFallbackEndpoints() {
  if (typeof window === 'undefined') {
    return []
  }

  const { hostname, origin, protocol } = window.location
  const sameHostBackend = hostname
    ? `${protocol}//${hostname}:8000/api/market/home`
    : null

  const candidates = [
    `${origin}/api/market/home`,
    '/backend/api/market/home',
    sameHostBackend,
    'http://127.0.0.1:8000/api/market/home',
    'http://localhost:8000/api/market/home',
  ].filter((endpoint): endpoint is string => Boolean(endpoint))

  return Array.from(new Set(candidates)).filter((endpoint) => endpoint !== HOME_MARKET_ENDPOINT)
}

function toFiniteOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeTicker(value: unknown): MarketTickerQuote | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Record<string, unknown>
  const code = String(candidate.code ?? '').trim()
  const name = String(candidate.name ?? code).trim()
  if (!code) {
    return null
  }
  return {
    code,
    name,
    price: toFiniteOrNull(candidate.price),
    changePct: toFiniteOrNull(candidate.changePct),
  }
}

function normalizeCard(value: unknown): MarketCard | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Record<string, unknown>
  const code = String(candidate.code ?? '').trim()
  const name = String(candidate.name ?? code).trim()
  const kind = candidate.kind
  if (!code || !name || (kind !== 'index' && kind !== 'rate' && kind !== 'fx' && kind !== 'gold')) {
    return null
  }
  return {
    code,
    name,
    kind,
    price: toFiniteOrNull(candidate.price),
    change: toFiniteOrNull(candidate.change),
    changePct: toFiniteOrNull(candidate.changePct),
    note: candidate.note == null ? null : String(candidate.note),
  }
}

function normalizeSeriesPoint(value: unknown): MarketSeriesPoint | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Record<string, unknown>
  const label = String(candidate.label ?? '').trim()
  const isoTime = String(candidate.isoTime ?? label).trim()
  const price = toFiniteOrNull(candidate.price)
  const volume = toFiniteOrNull(candidate.volume) ?? 0
  if (!label || !isoTime || price === null) {
    return null
  }
  return {
    label,
    isoTime,
    price,
    volume,
  }
}

function normalizeSeries(value: unknown): MarketSeries {
  if (!value || typeof value !== 'object') {
    return { granularity: 'none', points: [], note: null }
  }
  const candidate = value as Record<string, unknown>
  const granularity = candidate.granularity
  const points = Array.isArray(candidate.points)
    ? candidate.points
        .map((item) => normalizeSeriesPoint(item))
        .filter((item): item is MarketSeriesPoint => item !== null)
    : []

  return {
    granularity:
      granularity === 'intraday' || granularity === 'daily' || granularity === 'none'
        ? granularity
        : points.length > 0
          ? 'daily'
          : 'none',
    points,
    note: candidate.note == null ? null : String(candidate.note),
  }
}

function normalizeHomeMarketPayload(value: unknown): HomeMarketPayload {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const tickerStrip = Array.isArray(candidate.tickerStrip)
    ? candidate.tickerStrip
        .map((item) => normalizeTicker(item))
        .filter((item): item is MarketTickerQuote => item !== null)
    : []
  const marketCards = Array.isArray(candidate.marketCards)
    ? candidate.marketCards
        .map((item) => normalizeCard(item))
        .filter((item): item is MarketCard => item !== null)
    : []
  const importantCards = Array.isArray(candidate.importantCards)
    ? candidate.importantCards
        .map((item) => normalizeCard(item))
        .filter((item): item is MarketCard => item !== null)
    : []

  const seriesByCode = Object.fromEntries(
    Object.entries(
      candidate.seriesByCode && typeof candidate.seriesByCode === 'object'
        ? (candidate.seriesByCode as Record<string, unknown>)
        : {},
    ).map(([code, series]) => [code, normalizeSeries(series)]),
  )

  return {
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt
        ? candidate.updatedAt
        : new Date().toISOString(),
    tickerStrip,
    marketCards,
    importantCards,
    seriesByCode,
  }
}

async function fetchWithTimeout(endpoint: string, timeoutMs = HOME_MARKET_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(endpoint, { signal: controller.signal })
  } finally {
    globalThis.clearTimeout(timerId)
  }
}

export async function fetchHomeMarketPayload(): Promise<HomeMarketPayload> {
  const endpoints = [HOME_MARKET_ENDPOINT, ...getFallbackEndpoints()]
  let lastError: Error | null = null

  for (const [index, endpoint] of endpoints.entries()) {
    try {
      const timeoutMs = index === 0 ? HOME_MARKET_REQUEST_TIMEOUT_MS : HOME_MARKET_FALLBACK_TIMEOUT_MS
      const response = await fetchWithTimeout(endpoint, timeoutMs)
      if (!response.ok) {
        lastError = new Error(`Market API request failed: ${response.status}`)
        continue
      }
      return normalizeHomeMarketPayload(await response.json())
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Market API request failed')
    }
  }

  throw lastError ?? new Error('Market API unavailable')
}
