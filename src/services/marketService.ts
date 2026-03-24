import type { MarketIndexQuote, MarketTickerQuote } from '../types/market'

const INDEX_SYMBOLS = ['s_sh000001', 's_sz399001', 's_sz399006', 's_sh000688']
const TICKER_SYMBOLS = [
  's_sh600519',
  's_sh601318',
  's_sz000858',
  's_sz300750',
  's_sz002594',
  's_sh601398',
  's_sh688981',
  's_sz000333',
]

type ParsedQuote = {
  symbol: string
  name: string
  code: string
  price: number
  change: number
  changePct: number
}

async function fetchBySymbols(symbols: string[]) {
  const url = `https://qt.gtimg.cn/q=${symbols.join(',')}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`行情接口请求失败: ${response.status}`)
  }
  return response.text()
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseTencentQuotes(payload: string): ParsedQuote[] {
  return payload
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^v_(s_[a-z]{2}\d+)="(.+)"$/i)
      if (!match) {
        return null
      }
      const symbol = match[1]
      const fields = match[2].split('~')
      if (fields.length < 6) {
        return null
      }
      return {
        symbol,
        name: fields[1],
        code: fields[2],
        price: toNumber(fields[3]),
        change: toNumber(fields[4]),
        changePct: toNumber(fields[5]),
      } satisfies ParsedQuote
    })
    .filter((item): item is ParsedQuote => item !== null)
}

export async function fetchMarketIndexes(): Promise<Omit<MarketIndexQuote, 'trend'>[]> {
  const payload = await fetchBySymbols(INDEX_SYMBOLS)
  return parseTencentQuotes(payload).map((item) => ({
    code: item.code,
    name: item.name,
    price: item.price,
    change: item.change,
    changePct: item.changePct,
  }))
}

export async function fetchMarketTickers(): Promise<MarketTickerQuote[]> {
  const payload = await fetchBySymbols(TICKER_SYMBOLS)
  const parsed = parseTencentQuotes(payload).map((item) => ({
    code: item.code,
    name: item.name,
    price: item.price,
    changePct: item.changePct,
  }))
  return parsed.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
}
