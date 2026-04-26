const VENDOR_URL = 'https://webhq.nanhua.net/js/vendor.95d3d7b1.js'
const WS_URL = 'wss://ipv46hqgatewaycr.nanhua.net:9443/gateway'
const APP = {
  apptype: 'nhwebquo',
  verifycode: 'funbird',
  key: '6eZYTeUf4{A3ZyG>',
  iv: '4W!?EEPb',
}

const QuoteMsgID = {
  qryQuotation: 20,
  auth: 32,
}

const Freq = {
  REALTIME: 0,
  MIN1: 3,
  DAY1: 10,
}

function encodeVarint(value) {
  let v = BigInt(value)
  if (v < 0n) {
    v = (1n << 64n) + v
  }
  const out = []
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n))
    v >>= 7n
  }
  out.push(Number(v))
  return Uint8Array.from(out)
}

function decodeVarint(buf, offset) {
  let result = 0n
  let shift = 0n
  let pos = offset
  for (let i = 0; i < 10; i += 1) {
    if (pos >= buf.length) {
      throw new Error('unexpected EOF while reading varint')
    }
    const b = BigInt(buf[pos])
    pos += 1
    result |= (b & 0x7fn) << shift
    if ((b & 0x80n) === 0n) {
      return { value: result, offset: pos }
    }
    shift += 7n
  }
  throw new Error('varint too long')
}

function zigZagEncode32(n) {
  return (n << 1) ^ (n >> 31)
}

function zigZagDecode32(n) {
  return (n >>> 1) ^ -(n & 1)
}

function encodeKey(fieldNo, wireType) {
  return encodeVarint((fieldNo << 3) | wireType)
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function encodeStringField(fieldNo, str) {
  const bytes = new TextEncoder().encode(str)
  return concatBytes([encodeKey(fieldNo, 2), encodeVarint(bytes.length), bytes])
}

function encodeBytesField(fieldNo, bytes) {
  return concatBytes([encodeKey(fieldNo, 2), encodeVarint(bytes.length), bytes])
}

function encodeInt32Field(fieldNo, n) {
  return concatBytes([encodeKey(fieldNo, 0), encodeVarint(n >>> 0)])
}

function encodeSInt32Field(fieldNo, n) {
  return concatBytes([encodeKey(fieldNo, 0), encodeVarint(zigZagEncode32(n) >>> 0)])
}

function encodePackedInt32Field(fieldNo, values) {
  const encoded = values.map((v) => encodeVarint(v >>> 0))
  const payload = concatBytes(encoded)
  return concatBytes([encodeKey(fieldNo, 2), encodeVarint(payload.length), payload])
}

function encodeQueryCondition(queryCondition = {}) {
  const chunks = []
  if (queryCondition.size !== undefined) {
    chunks.push(encodeInt32Field(1, queryCondition.size | 0))
  }
  return concatBytes(chunks)
}

function encodeQuotationRequest({ codes = [], freq = [], queryCondition = null } = {}) {
  const chunks = []
  for (const code of codes) {
    chunks.push(encodeStringField(1, code))
  }
  if (freq.length > 0) {
    chunks.push(encodePackedInt32Field(2, freq))
  }
  if (queryCondition && Object.keys(queryCondition).length > 0) {
    const q = encodeQueryCondition(queryCondition)
    chunks.push(encodeBytesField(3, q))
  }
  return concatBytes(chunks)
}

function encodeRequestMsg(msgid, seq, requestObj) {
  const req = encodeQuotationRequest(requestObj)
  return concatBytes([
    encodeInt32Field(1, msgid),
    encodeSInt32Field(2, seq),
    encodeBytesField(4, req),
  ])
}

function readFixed64AsNumber(buf, offset) {
  if (offset + 8 > buf.length) {
    throw new Error('fixed64 overflow')
  }
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8)
  const low = view.getUint32(0, true)
  const high = view.getUint32(4, true)
  return high * 2 ** 32 + low
}

function readDouble(buf, offset) {
  if (offset + 8 > buf.length) {
    throw new Error('double overflow')
  }
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8)
  return view.getFloat64(0, true)
}

function skipField(buf, offset, wireType) {
  if (wireType === 0) {
    return decodeVarint(buf, offset).offset
  }
  if (wireType === 1) {
    return offset + 8
  }
  if (wireType === 2) {
    const len = decodeVarint(buf, offset)
    return len.offset + Number(len.value)
  }
  if (wireType === 5) {
    return offset + 4
  }
  throw new Error(`unsupported wire type ${wireType}`)
}

function parseRealtimeField(buf) {
  const out = {}
  let offset = 0
  while (offset < buf.length) {
    const k = decodeVarint(buf, offset)
    offset = k.offset
    const key = Number(k.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 1) {
      out.last = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 11 && wireType === 1) {
      out.updown = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 12 && wireType === 1) {
      out.updownRate = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 13 && wireType === 1) {
      out.average = readDouble(buf, offset)
      offset += 8
      continue
    }

    offset = skipField(buf, offset, wireType)
  }
  return out
}

function parseQuotationField(buf) {
  const out = {}
  let offset = 0
  while (offset < buf.length) {
    const k = decodeVarint(buf, offset)
    offset = k.offset
    const key = Number(k.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 2) {
      const len = decodeVarint(buf, offset)
      offset = len.offset
      out.code = new TextDecoder().decode(buf.subarray(offset, offset + Number(len.value)))
      offset += Number(len.value)
      continue
    }
    if (fieldNo === 2 && wireType === 0) {
      const v = decodeVarint(buf, offset)
      out.freq = Number(v.value)
      offset = v.offset
      continue
    }
    if (fieldNo === 3 && wireType === 1) {
      out.quoteTime = readFixed64AsNumber(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 4 && wireType === 0) {
      const v = decodeVarint(buf, offset)
      out.volume = Number(v.value)
      offset = v.offset
      continue
    }
    if (fieldNo === 5 && wireType === 0) {
      const v = decodeVarint(buf, offset)
      out.freqTime = Number(v.value)
      offset = v.offset
      continue
    }
    if (fieldNo === 6 && wireType === 1) {
      out.turnOver = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 7 && wireType === 2) {
      const len = decodeVarint(buf, offset)
      offset = len.offset
      out.rt = parseRealtimeField(buf.subarray(offset, offset + Number(len.value)))
      offset += Number(len.value)
      continue
    }
    if (fieldNo === 8 && wireType === 1) {
      out.open = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 9 && wireType === 1) {
      out.high = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 10 && wireType === 1) {
      out.low = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 11 && wireType === 1) {
      out.close = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 12 && wireType === 1) {
      out.posi = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 13 && wireType === 1) {
      out.preClose = readDouble(buf, offset)
      offset += 8
      continue
    }
    if (fieldNo === 14 && wireType === 1) {
      out.settle = readDouble(buf, offset)
      offset += 8
      continue
    }

    offset = skipField(buf, offset, wireType)
  }
  return out
}

function parseQuotationResponse(buf) {
  const out = { quotation: [] }
  let offset = 0
  while (offset < buf.length) {
    const k = decodeVarint(buf, offset)
    offset = k.offset
    const key = Number(k.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 2) {
      const len = decodeVarint(buf, offset)
      offset = len.offset
      out.quotation.push(parseQuotationField(buf.subarray(offset, offset + Number(len.value))))
      offset += Number(len.value)
      continue
    }
    if (fieldNo === 3 && wireType === 0) {
      const v = decodeVarint(buf, offset)
      out.errCode = zigZagDecode32(Number(v.value))
      offset = v.offset
      continue
    }
    if (fieldNo === 16 && wireType === 2) {
      const len = decodeVarint(buf, offset)
      offset = len.offset
      out.msg = new TextDecoder().decode(buf.subarray(offset, offset + Number(len.value)))
      offset += Number(len.value)
      continue
    }

    offset = skipField(buf, offset, wireType)
  }
  return out
}

function parseQuotationMsg(rawBuf) {
  const buf = rawBuf instanceof Uint8Array ? rawBuf : new Uint8Array(rawBuf)
  const out = { response: [] }
  let offset = 0
  while (offset < buf.length) {
    const k = decodeVarint(buf, offset)
    offset = k.offset
    const key = Number(k.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 0) {
      const v = decodeVarint(buf, offset)
      out.msgid = Number(v.value)
      offset = v.offset
      continue
    }
    if (fieldNo === 2 && wireType === 0) {
      const v = decodeVarint(buf, offset)
      out.seq = zigZagDecode32(Number(v.value))
      offset = v.offset
      continue
    }
    if (fieldNo === 5 && wireType === 2) {
      const len = decodeVarint(buf, offset)
      offset = len.offset
      out.response.push(parseQuotationResponse(buf.subarray(offset, offset + Number(len.value))))
      offset += Number(len.value)
      continue
    }
    if (fieldNo === 7 && wireType === 2) {
      const len = decodeVarint(buf, offset)
      offset = len.offset
      out.jsonResp = new TextDecoder().decode(buf.subarray(offset, offset + Number(len.value)))
      offset += Number(len.value)
      continue
    }
    if (fieldNo === 8 && wireType === 2) {
      const len = decodeVarint(buf, offset)
      offset = len.offset
      out.errMsg = new TextDecoder().decode(buf.subarray(offset, offset + Number(len.value)))
      offset += Number(len.value)
      continue
    }

    offset = skipField(buf, offset, wireType)
  }
  return out
}

function createWebpackRequire(modules) {
  const cache = {}

  function req(id) {
    const moduleId = String(id)
    if (cache[moduleId]) {
      return cache[moduleId].exports
    }
    const moduleDefinition = modules[moduleId]
    if (!moduleDefinition) {
      throw new Error(`module ${moduleId} not found`)
    }
    const module = { exports: {} }
    cache[moduleId] = module
    moduleDefinition(module, module.exports, req)
    return module.exports
  }

  req.d = (exports, definition) => {
    for (const key of Object.keys(definition)) {
      if (!Object.prototype.hasOwnProperty.call(exports, key)) {
        Object.defineProperty(exports, key, { enumerable: true, get: definition[key] })
      }
    }
  }
  req.o = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop)

  return req
}

async function loadVendorCode() {
  const response = await fetch(VENDOR_URL)
  if (!response.ok) {
    throw new Error(`failed to load nanhua vendor script: ${response.status}`)
  }
  return response.text()
}

async function makeAuthTokenBytes() {
  globalThis.self = globalThis.self || { webpackChunkquota_kline: [] }
  if (!Array.isArray(globalThis.self.webpackChunkquota_kline)) {
    globalThis.self.webpackChunkquota_kline = []
  }

  const vendorCode = await loadVendorCode()
  eval(vendorCode)

  const chunks = globalThis.self.webpackChunkquota_kline
  if (!Array.isArray(chunks)) {
    throw new Error('webpackChunkquota_kline is unavailable')
  }

  const targetChunk = chunks.find((chunk) => {
    if (!Array.isArray(chunk) || chunk.length < 2) {
      return false
    }
    const modules = chunk[1]
    return typeof modules === 'object' && modules !== null && Object.prototype.hasOwnProperty.call(modules, '7168')
  })

  if (!targetChunk) {
    throw new Error('nanhua crypt module chunk not found')
  }

  const modules = targetChunk[1]
  const req = createWebpackRequire(modules)
  const Crypt = req(7168)
  const crypt = new Crypt(APP.key, Crypt.MODE.CBC, Crypt.PADDING.PKCS5)
  crypt.setIv(APP.iv)
  const token = crypt.encode(`${APP.verifycode}${APP.apptype}${Date.now()}`)
  return token instanceof Uint8Array ? token : new Uint8Array(token)
}

function encodeAuthRequest(seq) {
  return makeAuthTokenBytes().then((token) => {
    const authReq = concatBytes([
      encodeStringField(1, APP.apptype),
      encodeBytesField(2, token),
    ])

    const quotationRequest = encodeBytesField(5, authReq)

    return concatBytes([
      encodeInt32Field(1, QuoteMsgID.auth),
      encodeSInt32Field(2, seq),
      encodeBytesField(4, quotationRequest),
    ])
  })
}

function createClient() {
  const ws = new WebSocket(WS_URL)
  let opened = false
  let closed = false
  const pending = []

  function dispatch(msg) {
    for (let i = 0; i < pending.length; i += 1) {
      const item = pending[i]
      if (item.match(msg)) {
        pending.splice(i, 1)
        item.resolve(msg)
        return
      }
    }
  }

  ws.onopen = () => {
    opened = true
  }

  ws.onmessage = async (event) => {
    try {
      let payload = null
      if (event.data instanceof Blob) {
        payload = new Uint8Array(await event.data.arrayBuffer())
      } else if (event.data instanceof ArrayBuffer) {
        payload = new Uint8Array(event.data)
      } else if (ArrayBuffer.isView(event.data)) {
        payload = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
      }
      if (!payload) {
        return
      }
      dispatch(parseQuotationMsg(payload))
    } catch {
      // ignore frame parse errors
    }
  }

  ws.onerror = () => {
    while (pending.length) {
      pending.shift().reject(new Error('socket error'))
    }
  }

  ws.onclose = () => {
    closed = true
    while (pending.length) {
      pending.shift().reject(new Error('socket closed'))
    }
  }

  function waitMessage(match, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const item = { match, resolve: null, reject: null }
      const timer = setTimeout(() => {
        const idx = pending.indexOf(item)
        if (idx >= 0) {
          pending.splice(idx, 1)
        }
        reject(new Error(`wait message timeout ${timeoutMs}ms`))
      }, timeoutMs)

      item.resolve = (msg) => {
        clearTimeout(timer)
        resolve(msg)
      }
      item.reject = (err) => {
        clearTimeout(timer)
        reject(err)
      }
      pending.push(item)
    })
  }

  async function waitOpen() {
    const started = Date.now()
    while (!opened) {
      if (closed) {
        throw new Error('socket closed before open')
      }
      if (Date.now() - started > 10000) {
        throw new Error('wait open timeout')
      }
      await new Promise((r) => setTimeout(r, 20))
    }
  }

  return {
    waitOpen,
    waitMessage,
    send(bytes) {
      ws.send(bytes)
    },
    close() {
      ws.close()
    },
  }
}

function parseNumber(value) {
  return Number.isFinite(value) ? value : null
}

function computePct(change, base) {
  if (!Number.isFinite(change) || !Number.isFinite(base) || Math.abs(base) < 1e-9) {
    return 0
  }
  return (change / base) * 100
}

function normalizeUnixSeconds(rawSeconds) {
  if (!Number.isFinite(rawSeconds) || rawSeconds <= 0) {
    return null
  }
  return rawSeconds > 2 ** 32 ? Math.floor(rawSeconds / 1000) : Math.floor(rawSeconds)
}

function toShanghaiDateTimeByUnixSeconds(seconds) {
  const normalized = normalizeUnixSeconds(seconds)
  if (!normalized) {
    return null
  }
  const instant = new Date(normalized * 1000)

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant)

  const year = dateParts.find((item) => item.type === 'year')?.value
  const month = dateParts.find((item) => item.type === 'month')?.value
  const day = dateParts.find((item) => item.type === 'day')?.value
  const hour = timeParts.find((item) => item.type === 'hour')?.value
  const minute = timeParts.find((item) => item.type === 'minute')?.value
  if (!year || !month || !day || !hour || !minute) {
    return null
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    isoTime: `${year}-${month}-${day}T${hour}:${minute}:00+08:00`,
    epochSeconds: normalized,
  }
}

function toParsedQuote(quote) {
  if (!quote) {
    return null
  }
  const price = parseNumber(quote.rt?.last) ?? parseNumber(quote.close) ?? parseNumber(quote.open) ?? 0
  if (!Number.isFinite(price) || price <= 0) {
    return null
  }

  const preClose = parseNumber(quote.preClose) ?? (parseNumber(quote.rt?.updown) !== null ? price - quote.rt.updown : null)
  const change = parseNumber(quote.rt?.updown) ?? (preClose !== null ? price - preClose : 0)
  const changePct = parseNumber(quote.rt?.updownRate) ?? computePct(change, preClose ?? price - change)

  return {
    code: 'NHCI',
    name: '南华商品指数',
    price,
    change,
    changePct,
  }
}

function toNhciTimeline(rows) {
  const timeline = []
  for (const row of rows) {
    const localDateTime = toShanghaiDateTimeByUnixSeconds(parseNumber(row.freqTime))
    if (!localDateTime) {
      continue
    }
    const price = parseNumber(row.close) ?? parseNumber(row.rt?.last) ?? parseNumber(row.open)
    if (price === null || price <= 0) {
      continue
    }
    timeline.push({
      date: localDateTime.date,
      time: localDateTime.time,
      isoTime: localDateTime.isoTime,
      epochSeconds: localDateTime.epochSeconds,
      price,
      volume: parseNumber(row.volume) ?? 0,
    })
  }
  timeline.sort((a, b) => a.epochSeconds - b.epochSeconds)
  return timeline
}

function keepLatestShanghaiTradingDate(points) {
  if (points.length === 0) {
    return []
  }
  const latestDate = points[points.length - 1].date
  const sameDatePoints = points.filter((point) => point.date === latestDate)
  return sameDatePoints.length > 0 ? sameDatePoints : points
}

function toNhciDailyTimeline(rows) {
  const byDate = new Map()
  for (const row of rows) {
    const localDateTime = toShanghaiDateTimeByUnixSeconds(parseNumber(row.freqTime))
    if (!localDateTime) {
      continue
    }
    const price = parseNumber(row.close) ?? parseNumber(row.rt?.last) ?? parseNumber(row.open)
    if (price === null || price <= 0) {
      continue
    }
    byDate.set(localDateTime.date, {
      date: localDateTime.date,
      label: localDateTime.date,
      isoTime: `${localDateTime.date}T00:00:00+08:00`,
      epochSeconds: localDateTime.epochSeconds,
      price,
      volume: parseNumber(row.volume) ?? 0,
    })
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.epochSeconds - b.epochSeconds)
    .slice(-60)
}

function mergeNhciRealtimePoint(points, realtimeRow) {
  if (!realtimeRow) {
    return points
  }

  const localDateTime = toShanghaiDateTimeByUnixSeconds(parseNumber(realtimeRow.freqTime) ?? parseNumber(realtimeRow.quoteTime))
  if (!localDateTime) {
    return points
  }
  if (points.length > 0 && localDateTime.date !== points[points.length - 1].date) {
    return points
  }

  const price = parseNumber(realtimeRow.rt?.last) ?? parseNumber(realtimeRow.close) ?? parseNumber(realtimeRow.open)
  if (price === null || price <= 0) {
    return points
  }

  const next = [...points]
  const latestIndex = next.findLastIndex(
    (point) => point.date === localDateTime.date && point.time === localDateTime.time,
  )

  if (latestIndex >= 0) {
    next[latestIndex] = { ...next[latestIndex], price }
    return next
  }

  next.push({
    date: localDateTime.date,
    time: localDateTime.time,
    isoTime: localDateTime.isoTime,
    epochSeconds: localDateTime.epochSeconds,
    price,
    volume: 0,
  })
  next.sort((a, b) => a.epochSeconds - b.epochSeconds)
  return next
}

async function main() {
  const client = createClient()
  await client.waitOpen()

  let seq = 1
  const authPayload = await encodeAuthRequest(seq)
  client.send(authPayload)
  const authResp = await client.waitMessage((m) => m.msgid === QuoteMsgID.auth)
  const authErrCode = authResp.response?.find((item) => item.errCode !== undefined)?.errCode ?? 0
  if (authErrCode !== 0) {
    throw new Error(`NHCI auth failed: ${authErrCode}`)
  }

  seq += 1
  const realtimeSeq = seq
  client.send(encodeRequestMsg(QuoteMsgID.qryQuotation, realtimeSeq, {
    codes: ['NHCI'],
    freq: [Freq.REALTIME],
  }))

  seq += 1
  const dailySeq = seq
  client.send(encodeRequestMsg(QuoteMsgID.qryQuotation, dailySeq, {
    codes: ['NHCI'],
    freq: [Freq.DAY1],
    queryCondition: { size: 90 },
  }))

  const [realtimeResp, dailyResp] = await Promise.all([
    client.waitMessage((m) => m.msgid === QuoteMsgID.qryQuotation && Math.abs(m.seq ?? 0) === realtimeSeq),
    client.waitMessage((m) => m.msgid === QuoteMsgID.qryQuotation && Math.abs(m.seq ?? 0) === dailySeq),
  ])

  client.close()

  const realtimeRow = realtimeResp.response?.[0]?.quotation?.[0] ?? null
  const dailyRows = dailyResp.response?.[0]?.quotation ?? []
  const latestDaily = dailyRows.reduce((picked, current) => {
    if (!picked) {
      return current
    }
    return (parseNumber(current.freqTime) ?? 0) >= (parseNumber(picked.freqTime) ?? 0) ? current : picked
  }, null)

  const quote = toParsedQuote(realtimeRow) ?? toParsedQuote(latestDaily)
  if (!quote) {
    throw new Error('NHCI quote unavailable')
  }

  const dailyTimeline = toNhciDailyTimeline(dailyRows)

  const payload = {
    updatedAt: new Date().toISOString(),
    granularity: 'daily',
    note: '近60个交易日日线',
    quote,
    series: dailyTimeline.map((point) => ({
      date: point.date,
      label: point.label,
      isoTime: point.isoTime,
      price: point.price,
      volume: point.volume,
    })),
  }

  process.stdout.write(JSON.stringify(payload))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
