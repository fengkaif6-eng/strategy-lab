import { useEffect, useState } from 'react'
import {
  fetchMarketIndexes,
  fetchMarketTickers,
  fetchShanghaiIntradayCurve,
  normalizeCodeName,
} from '../services/marketService'
import type {
  MarketIndexQuote,
  MarketIntradayPoint,
  MarketTickerQuote,
} from '../types/market'

interface MarketSnapshot {
  indexes: MarketIndexQuote[]
  tickers: MarketTickerQuote[]
  shanghaiIntraday: MarketIntradayPoint[]
  updatedAt: string
}

interface MarketDataState {
  indexes: MarketIndexQuote[]
  tickers: MarketTickerQuote[]
  shanghaiIntraday: MarketIntradayPoint[]
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
    if (
      !Array.isArray(parsed.indexes) ||
      !Array.isArray(parsed.tickers) ||
      !Array.isArray(parsed.shanghaiIntraday)
    ) {
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
      shanghaiIntraday: parsed.shanghaiIntraday,
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
        shanghaiIntraday: [],
        loading: true,
        stale: false,
        updatedAt: null,
      }
    }
    return {
      indexes: snapshot.indexes,
      tickers: snapshot.tickers,
      shanghaiIntraday: snapshot.shanghaiIntraday,
      loading: true,
      stale: true,
      updatedAt: snapshot.updatedAt,
    }
  })

  useEffect(() => {
    let isActive = true

    const sync = async () => {
      const [indexesResult, tickersResult, intradayResult] = await Promise.allSettled([
        fetchMarketIndexes(),
        fetchMarketTickers(),
        fetchShanghaiIntradayCurve(),
      ])

      if (!isActive) {
        return
      }

      setState((previous) => {
        const nextIndexes =
          indexesResult.status === 'fulfilled'
            ? indexesResult.value.map((item) => {
                const oldTrend =
                  previous.indexes.find((prev) => prev.code === item.code)?.trend ?? []
                const trend = [...oldTrend, item.price].slice(-MAX_TREND_POINTS)
                return {
                  ...item,
                  trend,
                }
              })
            : previous.indexes

        const nextTickers =
          tickersResult.status === 'fulfilled'
            ? tickersResult.value
            : previous.tickers

        const nextIntraday =
          intradayResult.status === 'fulfilled' && intradayResult.value.length > 0
            ? intradayResult.value
            : previous.shanghaiIntraday

        const hasFresh =
          indexesResult.status === 'fulfilled' ||
          tickersResult.status === 'fulfilled' ||
          intradayResult.status === 'fulfilled'

        const nextUpdatedAt = hasFresh
          ? new Date().toISOString()
          : previous.updatedAt ?? null

        if (hasFresh) {
          writeSnapshot({
            indexes: nextIndexes,
            tickers: nextTickers,
            shanghaiIntraday: nextIntraday,
            updatedAt: nextUpdatedAt ?? new Date().toISOString(),
          })
        }

        return {
          indexes: nextIndexes,
          tickers: nextTickers,
          shanghaiIntraday: nextIntraday,
          loading: false,
          stale: !hasFresh && (nextIndexes.length > 0 || nextTickers.length > 0),
          updatedAt: nextUpdatedAt,
        }
      })
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
