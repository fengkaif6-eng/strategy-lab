export interface MarketIndexQuote {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  trend: number[]
}

export interface MarketTickerQuote {
  code: string
  name: string
  price: number | null
  changePct: number | null
}

export interface MarketIntradayPoint {
  time: string
  price: number
  volume: number
}

export type MarketIntradayMap = Record<string, MarketIntradayPoint[]>

export type MarketCardKind = 'index' | 'rate' | 'fx' | 'gold'
export type MarketSeriesGranularity = 'intraday' | 'daily' | 'none'

export interface MarketCard {
  code: string
  name: string
  kind: MarketCardKind
  price: number | null
  change: number | null
  changePct: number | null
  note?: string | null
}

export interface MarketSeriesPoint {
  label: string
  isoTime: string
  price: number
  volume: number
}

export interface MarketSeries {
  granularity: MarketSeriesGranularity
  points: MarketSeriesPoint[]
  note?: string | null
}

export interface HomeMarketPayload {
  updatedAt: string
  tickerStrip: MarketTickerQuote[]
  marketCards: MarketCard[]
  importantCards: MarketCard[]
  seriesByCode: Record<string, MarketSeries>
}
