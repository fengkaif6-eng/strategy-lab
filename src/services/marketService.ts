import type {
  MarketIndexQuote,
  MarketIntradayMap,
  MarketIntradayPoint,
  MarketTickerQuote,
} from '../types/market'
import {
  fetchNanhuaQuotation,
  type NanhuaQuotationField,
} from './nanhuaGatewayService'

interface QuoteSource {
  code: string
  name: string
  tencentSymbol?: string
  tencentIntradayCode?: string
  sinaGlobalBondSymbol?: string
  nanhuaCode?: string
}

type ParsedQuote = {
  symbol: string
  name: string
  code: string
  price: number
  change: number
  changePct: number
}

interface MinuteApiResponse {
  data?: Record<
    string,
    {
      data?: {
        data?: string[]
      }
    }
  >
}

interface SinaForexKlineItem {
  d?: string
  c?: string
}

const INDEX_SOURCES: QuoteSource[] = [
  {
    code: '000001',
    name: '\u4e0a\u8bc1\u6307\u6570',
    tencentSymbol: 's_sh000001',
    tencentIntradayCode: 'sh000001',
  },
  {
    code: 'CN10Y',
    name: '\u5341\u5e74\u671f\u56fd\u503a\u5230\u671f\u6536\u76ca\u7387',
    sinaGlobalBondSymbol: 'cn10yt',
  },
  {
    code: 'NHCI',
    name: '\u5357\u534e\u5546\u54c1\u6307\u6570',
    nanhuaCode: 'NHCI',
  },
  {
    code: 'USDCNY',
    name: 'USDCNY',
    tencentSymbol: 'whUSDCNY',
  },
  {
    code: '399001',
    name: '\u6df1\u8bc1\u6210\u6307',
    tencentSymbol: 's_sz399001',
    tencentIntradayCode: 'sz399001',
  },
  {
    code: '399006',
    name: '\u521b\u4e1a\u677f\u6307',
    tencentSymbol: 's_sz399006',
    tencentIntradayCode: 'sz399006',
  },
  {
    code: '000688',
    name: '\u79d1\u521b50',
    tencentSymbol: 's_sh000688',
    tencentIntradayCode: 'sh000688',
  },
  {
    code: '000300',
    name: '\u6caa\u6df1300',
    tencentSymbol: 's_sh000300',
    tencentIntradayCode: 'sh000300',
  },
  {
    code: '000680',
    name: '\u79d1\u521b\u7efc\u6307',
    tencentSymbol: 's_sh000680',
    tencentIntradayCode: 'sh000680',
  },
]

const SOURCE_BY_CODE = new Map(INDEX_SOURCES.map((item) => [item.code, item] as const))
const TENCENT_INDEX_SOURCES = INDEX_SOURCES.filter((item) => item.tencentSymbol)

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

const NAME_BY_SYMBOL: Record<string, string> = {
  s_sh000001: '\u4e0a\u8bc1\u6307\u6570',
  whUSDCNY: 'USDCNY',
  s_sz399001: '\u6df1\u8bc1\u6210\u6307',
  s_sz399006: '\u521b\u4e1a\u677f\u6307',
  s_sh000688: '\u79d1\u521b50',
  s_sh000300: '\u6caa\u6df1300',
  s_sh000680: '\u79d1\u521b\u7efc\u6307',
  s_sh600519: '\u8d35\u5dde\u8305\u53f0',
  s_sh601318: '\u4e2d\u56fd\u5e73\u5b89',
  s_sz000858: '\u4e94\u7cae\u6db2',
  s_sz300750: '\u5b81\u5fb7\u65f6\u4ee3',
  s_sz002594: '\u6bd4\u4e9a\u8fea',
  s_sh601398: '\u5de5\u5546\u94f6\u884c',
  s_sh688981: '\u4e2d\u82af\u56fd\u9645',
  s_sz000333: '\u7f8e\u7684\u96c6\u56e2',
}

const NAME_BY_CODE: Record<string, string> = {
  '000001': '\u4e0a\u8bc1\u6307\u6570',
  CN10Y: '\u5341\u5e74\u671f\u56fd\u503a\u5230\u671f\u6536\u76ca\u7387',
  NHCI: '\u5357\u534e\u5546\u54c1\u6307\u6570',
  USDCNY: 'USDCNY',
  '399001': '\u6df1\u8bc1\u6210\u6307',
  '399006': '\u521b\u4e1a\u677f\u6307',
  '000688': '\u79d1\u521b50',
  '000300': '\u6caa\u6df1300',
  '000680': '\u79d1\u521b\u7efc\u6307',
  '600519': '\u8d35\u5dde\u8305\u53f0',
  '601318': '\u4e2d\u56fd\u5e73\u5b89',
  '000858': '\u4e94\u7cae\u6db2',
  '300750': '\u5b81\u5fb7\u65f6\u4ee3',
  '002594': '\u6bd4\u4e9a\u8fea',
  '601398': '\u5de5\u5546\u94f6\u884c',
  '688981': '\u4e2d\u82af\u56fd\u9645',
  '000333': '\u7f8e\u7684\u96c6\u56e2',
}
function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseMaybeNumber(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function computePct(change: number, base: number) {
  if (!Number.isFinite(base) || base === 0) {
    return 0
  }
  return (change / base) * 100
}

function getShanghaiDateText(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((item) => item.type === 'year')?.value ?? '1970'
  const month = parts.find((item) => item.type === 'month')?.value ?? '01'
  const day = parts.find((item) => item.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

async function fetchBySymbols(symbols: string[]) {
  const url = `https://qt.gtimg.cn/q=${symbols.join(',')}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`闂佽崵鍋炵粙鎴﹀嫉椤掑嫬纾块煫鍥ㄧ☉缁犳娊鏌曟径鍫濆姎缂傚秵鎹囬幃褰掑炊椤掍焦鏆犻梺娲讳簽婢ф顕ラ崟顒佺秶妞ゆ劑鍎? ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return new TextDecoder().decode(buffer)
  }
}

async function loadScriptVariable<T>(
  url: string,
  variableName: string,
  timeoutMs = 10_000,
): Promise<T> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('script loader only works in browser')
  }

  const target = window as unknown as Record<string, unknown>

  return new Promise<T>((resolve, reject) => {
    const script = document.createElement('script')
    let timerId = 0

    const cleanup = () => {
      window.clearTimeout(timerId)
      script.onload = null
      script.onerror = null
      script.remove()
    }

    const finalize = () => {
      const raw = target[variableName]
      cleanup()
      Reflect.deleteProperty(target, variableName)

      if (raw === undefined) {
        reject(new Error(`script variable not found: ${variableName}`))
        return
      }

      resolve(raw as T)
    }

    Reflect.deleteProperty(target, variableName)

    script.async = true
    script.src = url
    script.onload = finalize
    script.onerror = () => {
      cleanup()
      Reflect.deleteProperty(target, variableName)
      reject(new Error(`script load failed: ${url}`))
    }

    timerId = window.setTimeout(() => {
      cleanup()
      Reflect.deleteProperty(target, variableName)
      reject(new Error(`script load timeout: ${url}`))
    }, timeoutMs)

    document.head.appendChild(script)
  })
}

async function fetchCn10yQuote(): Promise<ParsedQuote | null> {
  const symbol = 'cn10yt'
  const variableName = `hq_str_globalbd_${symbol}`
  const url = `https://hq.sinajs.cn/?rn=${Date.now()}&list=globalbd_${symbol}`

  try {
    const raw = await loadScriptVariable<string>(url, variableName)
    const fields = (raw ?? '').split(',')
    if (fields.length < 6) {
      return null
    }

    const price = parseMaybeNumber(fields[3]) ?? parseMaybeNumber(fields[1]) ?? 0
    const directChange = parseMaybeNumber(fields[8])
    const baseCandidate =
      parseMaybeNumber(fields[2]) ??
      parseMaybeNumber(fields[1]) ??
      (directChange !== null ? price - directChange : null)
    const change =
      directChange !== null
        ? directChange
        : baseCandidate !== null
          ? price - baseCandidate
          : 0
    const changePct =
      parseMaybeNumber(fields[7]) ?? computePct(change, baseCandidate ?? price - change)

    return {
      symbol: `globalbd_${symbol}`,
      name: NAME_BY_CODE.CN10Y,
      code: 'CN10Y',
      price,
      change,
      changePct,
    }
  } catch {
    return null
  }
}

async function fetchUsdcnyQuote(): Promise<ParsedQuote | null> {
  const symbol = 'fx_susdcny'
  const variableName = `hq_str_${symbol}`
  const url = `https://hq.sinajs.cn/?rn=${Date.now()}&list=${symbol}`

  try {
    const raw = await loadScriptVariable<string>(url, variableName)
    const fields = (raw ?? '').split(',')
    if (fields.length < 9) {
      return null
    }

    const price = parseMaybeNumber(fields[8]) ?? parseMaybeNumber(fields[1]) ?? 0
    if (!Number.isFinite(price) || price <= 0) {
      return null
    }

    const preClose = parseMaybeNumber(fields[3]) ?? parseMaybeNumber(fields[1]) ?? null
    const change = preClose !== null ? price - preClose : 0
    const changePct = computePct(change, preClose ?? price - change)

    return {
      symbol,
      name: NAME_BY_CODE.USDCNY,
      code: 'USDCNY',
      price,
      change,
      changePct,
    }
  } catch {
    return null
  }
}

function parseNanhuaQuoteNumber(value: number | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null
  }
  return value as number
}

function toShanghaiDateTimeByUnixSeconds(seconds: number) {
  const milliseconds = seconds * 1000
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null
  }

  const instant = new Date(milliseconds)

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const year = dateParts.find((item) => item.type === 'year')?.value
  const month = dateParts.find((item) => item.type === 'month')?.value
  const day = dateParts.find((item) => item.type === 'day')?.value
  if (!year || !month || !day) {
    return null
  }

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant)
  const hour = timeParts.find((item) => item.type === 'hour')?.value
  const minute = timeParts.find((item) => item.type === 'minute')?.value
  if (!hour || !minute) {
    return null
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  }
}

interface NhciTimelinePoint extends MarketIntradayPoint {
  epochSeconds: number
  date: string
}

function toNanhuaParsedQuote(quote: NanhuaQuotationField): ParsedQuote | null {
  const price =
    parseNanhuaQuoteNumber(quote.rt?.last) ??
    parseNanhuaQuoteNumber(quote.close) ??
    parseNanhuaQuoteNumber(quote.open) ??
    0

  if (!Number.isFinite(price) || price <= 0) {
    return null
  }

  const preClose =
    parseNanhuaQuoteNumber(quote.preClose) ??
    (parseNanhuaQuoteNumber(quote.rt?.updown) !== null
      ? price - (quote.rt?.updown as number)
      : null)

  const change =
    parseNanhuaQuoteNumber(quote.rt?.updown) ??
    (preClose !== null ? price - preClose : 0)

  const changePct =
    parseNanhuaQuoteNumber(quote.rt?.updownRate) ??
    computePct(change, preClose ?? price - change)

  return {
    symbol: 'nanhua_NHCI',
    name: NAME_BY_CODE.NHCI,
    code: 'NHCI',
    price,
    change,
    changePct,
  }
}

async function fetchNhciRealtimeRow(): Promise<NanhuaQuotationField | null> {
  const rows = await fetchNanhuaQuotation({
    code: 'NHCI',
    freq: 'REALTIME',
  })
  return rows[0] ?? null
}

async function fetchNhciMinuteRows(size: number): Promise<NanhuaQuotationField[]> {
  return fetchNanhuaQuotation({
    code: 'NHCI',
    freq: 'MIN1',
    size,
  })
}

function toNhciTimeline(rows: NanhuaQuotationField[]): NhciTimelinePoint[] {
  const timeline: NhciTimelinePoint[] = []

  rows.forEach((row) => {
    const seconds = parseNanhuaQuoteNumber(row.freqTime)
    if (seconds === null) {
      return
    }

    const localDateTime = toShanghaiDateTimeByUnixSeconds(seconds)
    if (!localDateTime) {
      return
    }

    const price =
      parseNanhuaQuoteNumber(row.close) ??
      parseNanhuaQuoteNumber(row.rt?.last) ??
      parseNanhuaQuoteNumber(row.open)
    if (price === null || price <= 0) {
      return
    }

    timeline.push({
      time: localDateTime.time,
      price,
      volume: parseNanhuaQuoteNumber(row.volume) ?? 0,
      epochSeconds: seconds,
      date: localDateTime.date,
    })
  })

  timeline.sort((a, b) => a.epochSeconds - b.epochSeconds)
  return timeline
}

function keepLatestShanghaiTradingDate(points: NhciTimelinePoint[]): NhciTimelinePoint[] {
  if (points.length === 0) {
    return []
  }

  const latestDate = points[points.length - 1].date
  const sameDatePoints = points.filter((point) => point.date === latestDate)
  return sameDatePoints.length > 0 ? sameDatePoints : points
}

function mergeNhciRealtimePoint(
  points: NhciTimelinePoint[],
  realtimeRow: NanhuaQuotationField | null,
): NhciTimelinePoint[] {
  if (!realtimeRow) {
    return points
  }

  const rawSeconds =
    parseNanhuaQuoteNumber(realtimeRow.freqTime) ??
    parseNanhuaQuoteNumber(realtimeRow.quoteTime)
  if (rawSeconds === null) {
    return points
  }

  const seconds = rawSeconds > 2 ** 32 ? Math.floor(rawSeconds / 1000) : rawSeconds
  const localDateTime = toShanghaiDateTimeByUnixSeconds(seconds)
  if (!localDateTime) {
    return points
  }

  if (points.length > 0 && localDateTime.date !== points[points.length - 1].date) {
    return points
  }

  const price =
    parseNanhuaQuoteNumber(realtimeRow.rt?.last) ??
    parseNanhuaQuoteNumber(realtimeRow.close) ??
    parseNanhuaQuoteNumber(realtimeRow.open)
  if (price === null || price <= 0) {
    return points
  }

  const next = [...points]
  const latestIndex = next.findLastIndex(
    (point) => point.date === localDateTime.date && point.time === localDateTime.time,
  )

  if (latestIndex >= 0) {
    next[latestIndex] = {
      ...next[latestIndex],
      price,
    }
    return next
  }

  next.push({
    time: localDateTime.time,
    price,
    volume: 0,
    epochSeconds: seconds,
    date: localDateTime.date,
  })
  next.sort((a, b) => a.epochSeconds - b.epochSeconds)
  return next
}

async function fetchNhciQuote(): Promise<ParsedQuote | null> {
  try {
    const realtimeRow = await fetchNhciRealtimeRow()
    if (!realtimeRow) {
      return null
    }
    return toNanhuaParsedQuote(realtimeRow)
  } catch {
    try {
      const minuteRows = await fetchNhciMinuteRows(8)
      if (minuteRows.length === 0) {
        return null
      }

      const latest = minuteRows.reduce((picked, current) => {
        const pickedTime = parseNanhuaQuoteNumber(picked.freqTime) ?? 0
        const currentTime = parseNanhuaQuoteNumber(current.freqTime) ?? 0
        return currentTime >= pickedTime ? current : picked
      })
      return toNanhuaParsedQuote(latest)
    } catch {
      return null
    }
  }
}

async function fetchNhciIntradayCurve(): Promise<MarketIntradayPoint[]> {
  try {
    const [minuteRows, realtimeRow] = await Promise.all([
      fetchNhciMinuteRows(1_000),
      fetchNhciRealtimeRow().catch(() => null),
    ])

    const minuteTimeline = keepLatestShanghaiTradingDate(toNhciTimeline(minuteRows))
    const mergedTimeline = mergeNhciRealtimePoint(minuteTimeline, realtimeRow)

    if (mergedTimeline.length === 0) {
      return []
    }

    return mergedTimeline.map((point) => ({
      time: point.time,
      price: point.price,
      volume: point.volume,
    }))
  } catch {
    return []
  }
}

function normalizeQuoteName(symbol: string, code: string, fallback: string) {
  return NAME_BY_SYMBOL[symbol] ?? NAME_BY_CODE[code] ?? fallback
}

export function normalizeCodeName(code: string, fallback: string) {
  return NAME_BY_CODE[code] ?? fallback
}

function parseShortQuote(symbol: string, fields: string[]): ParsedQuote | null {
  if (fields.length < 6) {
    return null
  }
  return {
    symbol,
    name: normalizeQuoteName(symbol, fields[2], fields[1]),
    code: fields[2],
    price: toNumber(fields[3]),
    change: toNumber(fields[4]),
    changePct: toNumber(fields[5]),
  }
}

function parseForexQuote(symbol: string, fields: string[]): ParsedQuote | null {
  if (fields.length < 7) {
    return null
  }

  const price = toNumber(fields[3])
  const listedChange = parseMaybeNumber(fields[12])
  const listedPct = parseMaybeNumber(fields[13])
  const prevCloseCandidate = parseMaybeNumber(fields[6]) ?? 0
  const change = listedChange ?? price - prevCloseCandidate
  const changePct =
    listedPct ?? computePct(change, prevCloseCandidate || price - change)

  return {
    symbol,
    name: normalizeQuoteName(symbol, fields[2] || 'USDCNY', fields[1] || 'USDCNY'),
    code: fields[2] || 'USDCNY',
    price,
    change,
    changePct,
  }
}

export function parseTencentQuotes(payload: string): ParsedQuote[] {
  return payload
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^v_([^=]+)="(.*)"$/i)
      if (!match) {
        return null
      }
      const symbol = match[1]
      const fields = match[2].split('~')

      if (symbol.startsWith('s_')) {
        return parseShortQuote(symbol, fields)
      }
      if (symbol.startsWith('wh')) {
        return parseForexQuote(symbol, fields)
      }
      return null
    })
    .filter((item): item is ParsedQuote => item !== null)
}

export function getMarketIndexSeeds(): Omit<MarketIndexQuote, 'trend'>[] {
  return INDEX_SOURCES.map((source) => ({
    code: source.code,
    name: source.name,
    price: 0,
    change: 0,
    changePct: 0,
  }))
}

export async function fetchMarketIndexes(): Promise<Omit<MarketIndexQuote, 'trend'>[]> {
  const parsedMap = new Map<string, ParsedQuote>()

  try {
    const payload = await fetchBySymbols(
      TENCENT_INDEX_SOURCES.map((item) => item.tencentSymbol).filter(
        (item): item is string => Boolean(item),
      ),
    )
    parseTencentQuotes(payload).forEach((item) => {
      parsedMap.set(item.symbol, item)
    })
  } catch {
    // keep seed values when Tencent endpoint is temporarily unavailable
  }

  const cn10yQuote = await fetchCn10yQuote()
  const nhciQuote = await fetchNhciQuote()
  const usdcnyQuote = await fetchUsdcnyQuote()

  return getMarketIndexSeeds().map((seed) => {
    const source = SOURCE_BY_CODE.get(seed.code)
    if (!source) {
      return seed
    }

    if (source.code === 'CN10Y' && cn10yQuote) {
      return {
        code: source.code,
        name: source.name,
        price: cn10yQuote.price,
        change: cn10yQuote.change,
        changePct: cn10yQuote.changePct,
      }
    }

    if (source.code === 'NHCI' && nhciQuote) {
      return {
        code: source.code,
        name: source.name,
        price: nhciQuote.price,
        change: nhciQuote.change,
        changePct: nhciQuote.changePct,
      }
    }

    if (source.code === 'USDCNY' && usdcnyQuote) {
      return {
        code: source.code,
        name: source.name,
        price: usdcnyQuote.price,
        change: usdcnyQuote.change,
        changePct: usdcnyQuote.changePct,
      }
    }

    if (!source.tencentSymbol) {
      return seed
    }

    const quote = parsedMap.get(source.tencentSymbol)
    if (!quote) {
      return seed
    }

    return {
      code: source.code,
      name: source.name,
      price: quote.price,
      change: quote.change,
      changePct: quote.changePct,
    }
  })
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

function normalizeTime(rawTime: string) {
  if (/^\d{4}$/.test(rawTime)) {
    return `${rawTime.slice(0, 2)}:${rawTime.slice(2, 4)}`
  }
  return null
}

function toMinutePoint(raw: string): MarketIntradayPoint | null {
  const parts = raw.trim().split(/\s+/)
  if (parts.length < 2) {
    return null
  }

  const time = normalizeTime(parts[0])
  if (!time) {
    return null
  }

  const price = Number(parts[1])
  const volume = Number(parts[2] ?? '0')
  if (!Number.isFinite(price) || !Number.isFinite(volume)) {
    return null
  }

  return {
    time,
    price,
    volume,
  }
}

async function fetchTencentIndexIntradayCurve(code: string): Promise<MarketIntradayPoint[]> {
  const source = SOURCE_BY_CODE.get(code)
  const targetCode = source?.tencentIntradayCode
  if (!targetCode) {
    return []
  }

  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${targetCode}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`闂備礁鎲＄敮鎺懳涘▎蹇ｆ富闁稿瞼鍋涚粻鎶芥煏婢跺牆鍔氱紓宥嗘崌閹綊宕堕浣规殸闂佹椿浜炴晶妤€顕ラ崟顒佺秶妞ゆ劑鍎? ${response.status}`)
  }
  const payload = (await response.json()) as MinuteApiResponse
  const rows = payload.data?.[targetCode]?.data?.data ?? []
  return rows
    .map((row) => toMinutePoint(row))
    .filter((item): item is MarketIntradayPoint => item !== null)
}

async function fetchUsdcnyIntradayCurve(): Promise<MarketIntradayPoint[]> {
  const variableName = `strategy_lab_fx_usdcny_${Date.now()}_${Math.floor(Math.random() * 10_000)}`
  const url = `https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/${variableName}=/NewForexService.getMinKline?symbol=fx_susdcny&scale=5&datalen=480`

  try {
    const raw = await loadScriptVariable<unknown>(url, variableName)
    if (!Array.isArray(raw)) {
      return []
    }

    const parsedRows = raw
      .map((item) => item as SinaForexKlineItem)
      .filter((item) => typeof item.d === 'string' && typeof item.c === 'string')

    if (parsedRows.length === 0) {
      return []
    }

    const todayInShanghai = getShanghaiDateText()
    let targetRows = parsedRows.filter((item) =>
      (item.d as string).startsWith(todayInShanghai),
    )

    if (targetRows.length === 0) {
      const latestDate = (parsedRows[parsedRows.length - 1].d as string).slice(0, 10)
      targetRows = parsedRows.filter((item) => (item.d as string).startsWith(latestDate))
    }

    const byTime = new Map<string, MarketIntradayPoint>()
    targetRows.forEach((item) => {
      const timestamp = item.d as string
      const time = timestamp.slice(11, 16)
      const price = Number(item.c)
      if (!Number.isFinite(price)) {
        return
      }

      byTime.set(time, {
        time,
        price,
        volume: 0,
      })
    })

    return Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time))
  } catch {
    return []
  }
}

export async function fetchIndexIntradayCurve(code: string): Promise<MarketIntradayPoint[]> {
  if (code === 'USDCNY') {
    return fetchUsdcnyIntradayCurve()
  }
  if (code === 'NHCI') {
    return fetchNhciIntradayCurve()
  }
  return fetchTencentIndexIntradayCurve(code)
}

export async function fetchAllIndexIntradayCurves(): Promise<MarketIntradayMap> {
  const entries = await Promise.all(
    INDEX_SOURCES.map(async (source) => {
      try {
        const points = await fetchIndexIntradayCurve(source.code)
        return [source.code, points] as const
      } catch {
        return [source.code, []] as const
      }
    }),
  )

  return Object.fromEntries(entries)
}



