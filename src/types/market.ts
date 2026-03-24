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
  price: number
  changePct: number
}

export interface MarketIntradayPoint {
  time: string
  price: number
  volume: number
}
