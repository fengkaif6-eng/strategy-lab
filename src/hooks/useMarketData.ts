import { useEffect, useState } from 'react'
import {
  fetchMarketIndexes,
  fetchMarketTickers,
  normalizeCodeName,
} from '../services/marketService'
import type { MarketIndexQuote, MarketTickerQuote } from '../types/market'

interface MarketSnapshot {
  indexes: MarketIndexQuote[]
  tickers: MarketTickerQuote[]
  updatedAt: string
}

interface MarketDataState {
  indexes: MarketIndexQuote[]
  tickers: MarketTickerQuote[]
  loading: boolean
  stale: boolean
  updatedAt: string | null
}

const SNAPSHOT_KEY = 'strategy-lab/market-snapshot'
const MAX_TREND_POINTS = 24
const POLL_INTERVAL_MS = 20_000

function readSnapshot(): MarketSnapshot | null {
  const raw = localStorage.getItem(SNAPSHOT_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as MarketSnapshot
    if (!Array.isArray(parsed.indexes) || !Array.isArray(parsed.tickers)) {
      return null
    }
    return {
      indexes: parsed.indexes.map((item) => ({
        ...item,
        name: normalizeCodeName(item.code, item.name),
      })),
      tickers: parsed.tickers.map((item) => ({
        ...item,
        name: normalizeCodeName(item.code, item.name),
      })),
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

function writeSnapshot(snapshot: MarketSnapshot) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
}

export function useMarketData() {
  const [state, setState] = useState<MarketDataState>(() => {
    const snapshot = readSnapshot()
    if (!snapshot) {
      return {
        indexes: [],
        tickers: [],
        loading: true,
        stale: false,
        updatedAt: null,
      }
    }
    return {
      indexes: snapshot.indexes,
      tickers: snapshot.tickers,
      loading: true,
      stale: true,
      updatedAt: snapshot.updatedAt,
    }
  })

  useEffect(() => {
    let isActive = true

    const sync = async () => {
      try {
        const [latestIndexes, latestTickers] = await Promise.all([
          fetchMarketIndexes(),
          fetchMarketTickers(),
        ])

        if (!isActive) {
          return
        }

        setState((previous) => {
          const nextIndexes = latestIndexes.map((item) => {
            const oldTrend =
              previous.indexes.find((prev) => prev.code === item.code)?.trend ?? []
            const trend = [...oldTrend, item.price].slice(-MAX_TREND_POINTS)
            return {
              ...item,
              trend,
            }
          })

          const snapshot: MarketSnapshot = {
            indexes: nextIndexes,
            tickers: latestTickers,
            updatedAt: new Date().toISOString(),
          }
          writeSnapshot(snapshot)
          return {
            ...snapshot,
            loading: false,
            stale: false,
          }
        })
      } catch {
        if (!isActive) {
          return
        }
        setState((previous) => ({
          ...previous,
          loading: false,
          stale: previous.indexes.length > 0 || previous.tickers.length > 0,
        }))
      }
    }

    void sync()
    const timer = window.setInterval(() => {
      void sync()
    }, POLL_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(timer)
    }
  }, [])

  return state
}
