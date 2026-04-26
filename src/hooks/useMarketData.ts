import { useEffect, useState } from 'react'
import { fetchHomeMarketPayload } from '../services/homeMarketApi'
import type {
  MarketCard,
  MarketSeries,
  MarketTickerQuote,
} from '../types/market'

interface MarketDataState {
  marketCards: MarketCard[]
  importantCards: MarketCard[]
  tickerStrip: MarketTickerQuote[]
  seriesByCode: Record<string, MarketSeries>
  loading: boolean
  stale: boolean
  updatedAt: string | null
  error: string | null
}

const POLL_INTERVAL_MS = 20_000

const TICKER_SEEDS: MarketTickerQuote[] = [
  { code: '600519', name: 'Kweichow Moutai', price: null, changePct: null },
  { code: '601318', name: 'Ping An', price: null, changePct: null },
  { code: '000858', name: 'Wuliangye', price: null, changePct: null },
  { code: '300750', name: 'CATL', price: null, changePct: null },
  { code: '002594', name: 'BYD', price: null, changePct: null },
  { code: '601398', name: 'ICBC', price: null, changePct: null },
  { code: '688981', name: 'SMIC', price: null, changePct: null },
  { code: '000333', name: 'Midea', price: null, changePct: null },
]

function hasRenderableData(
  state: Pick<MarketDataState, 'marketCards' | 'importantCards' | 'tickerStrip' | 'seriesByCode'>,
) {
  const hasMarketPrice = state.marketCards.some((card) => card.price !== null)
  const hasImportantPrice = state.importantCards.some((card) => card.price !== null)
  const hasTickerPrice = state.tickerStrip.some((item) => item.price !== null)
  const hasSeries = Object.values(state.seriesByCode).some((series) => series.points.length > 0)
  return hasMarketPrice || hasImportantPrice || hasTickerPrice || hasSeries
}

export function useMarketData() {
  const [state, setState] = useState<MarketDataState>({
    marketCards: [],
    importantCards: [],
    tickerStrip: TICKER_SEEDS,
    seriesByCode: {},
    loading: true,
    stale: false,
    updatedAt: null,
    error: null,
  })

  useEffect(() => {
    let isActive = true
    let syncInFlight = false

    const sync = async () => {
      if (syncInFlight) {
        return
      }

      syncInFlight = true
      try {
        const payload = await fetchHomeMarketPayload()
        if (!isActive) {
          return
        }

        setState({
          marketCards: payload.marketCards,
          importantCards: payload.importantCards,
          tickerStrip: payload.tickerStrip.length > 0 ? payload.tickerStrip : TICKER_SEEDS,
          seriesByCode: payload.seriesByCode,
          loading: false,
          stale: false,
          updatedAt: payload.updatedAt,
          error: null,
        })
      } catch (error) {
        if (!isActive) {
          return
        }

        const errorMessage = error instanceof Error ? error.message : 'Market API unavailable'
        setState((previous) => {
          const renderable = hasRenderableData(previous)
          return {
            ...previous,
            tickerStrip: previous.tickerStrip.length > 0 ? previous.tickerStrip : TICKER_SEEDS,
            loading: false,
            stale: renderable,
            error: renderable ? null : errorMessage,
          }
        })
      } finally {
        syncInFlight = false
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sync()
      }
    }

    const handleWindowFocus = () => {
      void sync()
    }

    void sync()
    const marketTimer = window.setInterval(() => {
      void sync()
    }, POLL_INTERVAL_MS)

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isActive = false
      window.clearInterval(marketTimer)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return state
}
