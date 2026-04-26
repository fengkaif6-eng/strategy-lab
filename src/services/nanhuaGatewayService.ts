interface NanhuaCryptInstance {
  setIv(iv: string): void
  encode(plainText: string): Uint8Array | ArrayLike<number>
}

interface NanhuaCryptConstructor {
  new (key: string, mode: number, padding: number): NanhuaCryptInstance
  MODE: {
    CBC: number
  }
  PADDING: {
    PKCS5: number
  }
}

type WebpackModule = (
  module: { exports: unknown },
  exports: unknown,
  require: WebpackRequire,
) => void

type WebpackModules = Record<string, WebpackModule>

type WebpackChunk = [unknown, WebpackModules, ...unknown[]]

interface WebpackRequire {
  (id: string | number): unknown
  d: (exports: Record<string, unknown>, definition: Record<string, () => unknown>) => void
  o: (obj: object, prop: PropertyKey) => boolean
}

const NANHUA_VENDOR_URL = 'https://webhq.nanhua.net/js/vendor.95d3d7b1.js'
const NANHUA_WS_URL = 'wss://ipv46hqgatewaycr.nanhua.net:9443/gateway'

const AUTH_CONFIG = {
  apptype: 'nhwebquo',
  verifycode: 'funbird',
  key: '6eZYTeUf4{A3ZyG>',
  initializationVector: '4W!?EEPb',
} as const

const MSG_ID = {
  qryQuotation: 20,
  auth: 32,
} as const

const FREQ = {
  REALTIME: 0,
  MIN1: 3,
  DAY1: 10,
} as const

const DEFAULT_TIMEOUT_MS = 20_000

let vendorLoadPromise: Promise<void> | null = null
let cryptConstructorPromise: Promise<NanhuaCryptConstructor> | null = null

function encodeVarint(value: number | bigint): Uint8Array {
  let data = BigInt(value)
  if (data < 0n) {
    data = (1n << 64n) + data
  }

  const bytes: number[] = []
  while (data >= 0x80n) {
    bytes.push(Number((data & 0x7fn) | 0x80n))
    data >>= 7n
  }
  bytes.push(Number(data))

  return Uint8Array.from(bytes)
}

function decodeVarint(data: Uint8Array, offset: number): { value: bigint; offset: number } {
  let result = 0n
  let shift = 0n
  let cursor = offset

  for (let i = 0; i < 10; i += 1) {
    if (cursor >= data.length) {
      throw new Error('unexpected EOF when decoding varint')
    }

    const byte = BigInt(data[cursor])
    cursor += 1

    result |= (byte & 0x7fn) << shift
    if ((byte & 0x80n) === 0n) {
      return {
        value: result,
        offset: cursor,
      }
    }

    shift += 7n
  }

  throw new Error('invalid varint payload')
}

function zigzagEncodeInt32(value: number): number {
  return ((value << 1) ^ (value >> 31)) >>> 0
}

function zigzagDecodeInt32(value: number): number {
  return (value >>> 1) ^ -(value & 1)
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(length)

  let cursor = 0
  chunks.forEach((chunk) => {
    output.set(chunk, cursor)
    cursor += chunk.length
  })

  return output
}

function encodeKey(fieldNo: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNo << 3) | wireType)
}

function encodeStringField(fieldNo: number, value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value)
  return concatBytes([encodeKey(fieldNo, 2), encodeVarint(bytes.length), bytes])
}

function encodeBytesField(fieldNo: number, value: Uint8Array): Uint8Array {
  return concatBytes([encodeKey(fieldNo, 2), encodeVarint(value.length), value])
}

function encodeInt32Field(fieldNo: number, value: number): Uint8Array {
  return concatBytes([encodeKey(fieldNo, 0), encodeVarint(value >>> 0)])
}

function encodeSInt32Field(fieldNo: number, value: number): Uint8Array {
  return concatBytes([encodeKey(fieldNo, 0), encodeVarint(zigzagEncodeInt32(value))])
}

function encodePackedInt32Field(fieldNo: number, values: number[]): Uint8Array {
  const encoded = concatBytes(values.map((value) => encodeVarint(value >>> 0)))
  return concatBytes([encodeKey(fieldNo, 2), encodeVarint(encoded.length), encoded])
}

function encodeQueryConditionField(size: number): Uint8Array {
  const queryConditionPayload = encodeInt32Field(1, size)
  return encodeBytesField(3, queryConditionPayload)
}

function skipField(payload: Uint8Array, offset: number, wireType: number): number {
  if (wireType === 0) {
    return decodeVarint(payload, offset).offset
  }
  if (wireType === 1) {
    return offset + 8
  }
  if (wireType === 2) {
    const lengthMeta = decodeVarint(payload, offset)
    return lengthMeta.offset + Number(lengthMeta.value)
  }
  if (wireType === 5) {
    return offset + 4
  }
  throw new Error(`unsupported wire type: ${wireType}`)
}

function readDouble(payload: Uint8Array, offset: number): number {
  const view = new DataView(payload.buffer, payload.byteOffset + offset, 8)
  return view.getFloat64(0, true)
}

function readFixed64AsNumber(payload: Uint8Array, offset: number): number {
  const view = new DataView(payload.buffer, payload.byteOffset + offset, 8)
  const low = view.getUint32(0, true)
  const high = view.getUint32(4, true)
  return high * 2 ** 32 + low
}

function toUint8Array(data: ArrayLike<number> | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : Uint8Array.from(Array.from(data))
}

function createWebpackRequire(modules: WebpackModules): WebpackRequire {
  const cache: Record<string, { exports: unknown }> = {}

  const requireFunction = ((id: string | number) => {
    const moduleId = String(id)
    if (cache[moduleId]) {
      return cache[moduleId].exports
    }

    const moduleDefinition = modules[moduleId]
    if (!moduleDefinition) {
      throw new Error(`webpack module not found: ${moduleId}`)
    }

    const module = {
      exports: {},
    }
    cache[moduleId] = module

    moduleDefinition(module, module.exports, requireFunction)

    return module.exports
  }) as WebpackRequire

  requireFunction.d = (exports, definition) => {
    Object.keys(definition).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(exports, key)) {
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: definition[key],
        })
      }
    })
  }

  requireFunction.o = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop)

  return requireFunction
}

function appendScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-nanhua-vendor=\"1\"]`)
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`failed to load script: ${url}`)), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.src = url
    script.dataset.nanhuaVendor = '1'
    script.addEventListener('load', () => {
      script.dataset.loaded = '1'
      resolve()
    })
    script.addEventListener('error', () => reject(new Error(`failed to load script: ${url}`)))
    document.head.appendChild(script)
  })
}

async function ensureVendorScript(): Promise<void> {
  if (vendorLoadPromise) {
    return vendorLoadPromise
  }

  vendorLoadPromise = appendScript(NANHUA_VENDOR_URL)
  return vendorLoadPromise
}

function resolveCryptConstructorFromChunks(): NanhuaCryptConstructor {
  const globalWindow = window as Window & {
    webpackChunkquota_kline?: unknown[]
  }

  const chunks = globalWindow.webpackChunkquota_kline
  if (!Array.isArray(chunks)) {
    throw new Error('webpackChunkquota_kline is unavailable')
  }

  const targetChunk = chunks.find((chunk) => {
    if (!Array.isArray(chunk) || chunk.length < 2) {
      return false
    }
    const modules = chunk[1] as Record<string, unknown>
    return typeof modules === 'object' && modules !== null && Object.prototype.hasOwnProperty.call(modules, '7168')
  }) as WebpackChunk | undefined

  if (!targetChunk) {
    throw new Error('nanhua crypt module chunk not found')
  }

  const modules = targetChunk[1]
  const requireFunction = createWebpackRequire(modules)
  const cryptModule = requireFunction(7168)
  if (typeof cryptModule !== 'function') {
    throw new Error('nanhua crypt constructor is invalid')
  }

  return cryptModule as NanhuaCryptConstructor
}

async function getCryptConstructor(): Promise<NanhuaCryptConstructor> {
  if (cryptConstructorPromise) {
    return cryptConstructorPromise
  }

  cryptConstructorPromise = (async () => {
    await ensureVendorScript()
    return resolveCryptConstructorFromChunks()
  })()

  return cryptConstructorPromise
}

async function createAuthTokenBytes(): Promise<Uint8Array> {
  const Crypt = await getCryptConstructor()
  const crypt = new Crypt(AUTH_CONFIG.key, Crypt.MODE.CBC, Crypt.PADDING.PKCS5)
  crypt.setIv(AUTH_CONFIG.initializationVector)
  const plainText = `${AUTH_CONFIG.verifycode}${AUTH_CONFIG.apptype}${Date.now()}`
  return toUint8Array(crypt.encode(plainText))
}

type SupportedFreq = keyof typeof FREQ

export interface NanhuaRealtimeField {
  last?: number
  updown?: number
  updownRate?: number
  average?: number
}

export interface NanhuaQuotationField {
  code?: string
  freq?: number
  quoteTime?: number
  volume?: number
  freqTime?: number
  turnOver?: number
  rt?: NanhuaRealtimeField
  open?: number
  high?: number
  low?: number
  close?: number
  posi?: number
  preClose?: number
  settle?: number
}

interface ParsedQuotationResponse {
  quotation: NanhuaQuotationField[]
  errCode?: number
  msg?: string
}

interface ParsedQuotationMessage {
  msgid?: number
  seq?: number
  response: ParsedQuotationResponse[]
  jsonResp?: string
  errMsg?: string
}

function parseRealtimeField(payload: Uint8Array): NanhuaRealtimeField {
  const result: NanhuaRealtimeField = {}
  let offset = 0

  while (offset < payload.length) {
    const keyMeta = decodeVarint(payload, offset)
    offset = keyMeta.offset

    const key = Number(keyMeta.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 1) {
      result.last = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 11 && wireType === 1) {
      result.updown = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 12 && wireType === 1) {
      result.updownRate = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 13 && wireType === 1) {
      result.average = readDouble(payload, offset)
      offset += 8
      continue
    }

    offset = skipField(payload, offset, wireType)
  }

  return result
}

function parseQuotationField(payload: Uint8Array): NanhuaQuotationField {
  const result: NanhuaQuotationField = {}
  let offset = 0

  while (offset < payload.length) {
    const keyMeta = decodeVarint(payload, offset)
    offset = keyMeta.offset

    const key = Number(keyMeta.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 2) {
      const lengthMeta = decodeVarint(payload, offset)
      offset = lengthMeta.offset
      const length = Number(lengthMeta.value)
      result.code = new TextDecoder().decode(payload.subarray(offset, offset + length))
      offset += length
      continue
    }
    if (fieldNo === 2 && wireType === 0) {
      const valueMeta = decodeVarint(payload, offset)
      result.freq = Number(valueMeta.value)
      offset = valueMeta.offset
      continue
    }
    if (fieldNo === 3 && wireType === 1) {
      result.quoteTime = readFixed64AsNumber(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 4 && wireType === 0) {
      const valueMeta = decodeVarint(payload, offset)
      result.volume = Number(valueMeta.value)
      offset = valueMeta.offset
      continue
    }
    if (fieldNo === 5 && wireType === 0) {
      const valueMeta = decodeVarint(payload, offset)
      result.freqTime = Number(valueMeta.value)
      offset = valueMeta.offset
      continue
    }
    if (fieldNo === 6 && wireType === 1) {
      result.turnOver = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 7 && wireType === 2) {
      const lengthMeta = decodeVarint(payload, offset)
      offset = lengthMeta.offset
      const length = Number(lengthMeta.value)
      result.rt = parseRealtimeField(payload.subarray(offset, offset + length))
      offset += length
      continue
    }
    if (fieldNo === 8 && wireType === 1) {
      result.open = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 9 && wireType === 1) {
      result.high = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 10 && wireType === 1) {
      result.low = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 11 && wireType === 1) {
      result.close = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 12 && wireType === 1) {
      result.posi = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 13 && wireType === 1) {
      result.preClose = readDouble(payload, offset)
      offset += 8
      continue
    }
    if (fieldNo === 14 && wireType === 1) {
      result.settle = readDouble(payload, offset)
      offset += 8
      continue
    }

    offset = skipField(payload, offset, wireType)
  }

  return result
}

function parseQuotationResponse(payload: Uint8Array): ParsedQuotationResponse {
  const result: ParsedQuotationResponse = {
    quotation: [],
  }
  let offset = 0

  while (offset < payload.length) {
    const keyMeta = decodeVarint(payload, offset)
    offset = keyMeta.offset

    const key = Number(keyMeta.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 2) {
      const lengthMeta = decodeVarint(payload, offset)
      offset = lengthMeta.offset
      const length = Number(lengthMeta.value)
      result.quotation.push(parseQuotationField(payload.subarray(offset, offset + length)))
      offset += length
      continue
    }
    if (fieldNo === 3 && wireType === 0) {
      const valueMeta = decodeVarint(payload, offset)
      result.errCode = zigzagDecodeInt32(Number(valueMeta.value))
      offset = valueMeta.offset
      continue
    }
    if (fieldNo === 16 && wireType === 2) {
      const lengthMeta = decodeVarint(payload, offset)
      offset = lengthMeta.offset
      const length = Number(lengthMeta.value)
      result.msg = new TextDecoder().decode(payload.subarray(offset, offset + length))
      offset += length
      continue
    }

    offset = skipField(payload, offset, wireType)
  }

  return result
}

function parseQuotationMessage(payload: Uint8Array): ParsedQuotationMessage {
  const result: ParsedQuotationMessage = {
    response: [],
  }
  let offset = 0

  while (offset < payload.length) {
    const keyMeta = decodeVarint(payload, offset)
    offset = keyMeta.offset

    const key = Number(keyMeta.value)
    const fieldNo = key >>> 3
    const wireType = key & 0b111

    if (fieldNo === 1 && wireType === 0) {
      const valueMeta = decodeVarint(payload, offset)
      result.msgid = Number(valueMeta.value)
      offset = valueMeta.offset
      continue
    }
    if (fieldNo === 2 && wireType === 0) {
      const valueMeta = decodeVarint(payload, offset)
      result.seq = zigzagDecodeInt32(Number(valueMeta.value))
      offset = valueMeta.offset
      continue
    }
    if (fieldNo === 5 && wireType === 2) {
      const lengthMeta = decodeVarint(payload, offset)
      offset = lengthMeta.offset
      const length = Number(lengthMeta.value)
      result.response.push(parseQuotationResponse(payload.subarray(offset, offset + length)))
      offset += length
      continue
    }
    if (fieldNo === 7 && wireType === 2) {
      const lengthMeta = decodeVarint(payload, offset)
      offset = lengthMeta.offset
      const length = Number(lengthMeta.value)
      result.jsonResp = new TextDecoder().decode(payload.subarray(offset, offset + length))
      offset += length
      continue
    }
    if (fieldNo === 8 && wireType === 2) {
      const lengthMeta = decodeVarint(payload, offset)
      offset = lengthMeta.offset
      const length = Number(lengthMeta.value)
      result.errMsg = new TextDecoder().decode(payload.subarray(offset, offset + length))
      offset += length
      continue
    }

    offset = skipField(payload, offset, wireType)
  }

  return result
}

function encodeAuthMessage(seq: number, tokenBytes: Uint8Array): Uint8Array {
  const authPayload = concatBytes([
    encodeStringField(1, AUTH_CONFIG.apptype),
    encodeBytesField(2, tokenBytes),
  ])

  const requestPayload = encodeBytesField(5, authPayload)

  return concatBytes([
    encodeInt32Field(1, MSG_ID.auth),
    encodeSInt32Field(2, seq),
    encodeBytesField(4, requestPayload),
  ])
}

function encodeQuotationQueryMessage(
  seq: number,
  code: string,
  freq: number,
  size?: number,
): Uint8Array {
  const requestChunks: Uint8Array[] = [
    encodeStringField(1, code),
    encodePackedInt32Field(2, [freq]),
  ]

  if (size !== undefined && Number.isFinite(size) && size > 0) {
    requestChunks.push(encodeQueryConditionField(size))
  }

  const requestPayload = concatBytes(requestChunks)

  return concatBytes([
    encodeInt32Field(1, MSG_ID.qryQuotation),
    encodeSInt32Field(2, seq),
    encodeBytesField(4, requestPayload),
  ])
}

function waitForSocketOpen(socket: WebSocket, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let timeoutId = 0

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
    }

    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('nanhua socket open failed'))
    }
    const onClose = () => {
      cleanup()
      reject(new Error('nanhua socket closed before open'))
    }

    socket.addEventListener('open', onOpen)
    socket.addEventListener('error', onError)
    socket.addEventListener('close', onClose)

    timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('nanhua socket open timeout'))
    }, timeoutMs)
  })
}

interface Waiter {
  match: (message: ParsedQuotationMessage) => boolean
  resolve: (message: ParsedQuotationMessage) => void
  reject: (error: Error) => void
}

function waitForMessage(
  queue: Waiter[],
  match: (message: ParsedQuotationMessage) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ParsedQuotationMessage> {
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      match,
      resolve: (message) => {
        window.clearTimeout(timeoutId)
        resolve(message)
      },
      reject: (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    }

    queue.push(waiter)

    const timeoutId = window.setTimeout(() => {
      const index = queue.indexOf(waiter)
      if (index >= 0) {
        queue.splice(index, 1)
      }
      reject(new Error('nanhua socket message timeout'))
    }, timeoutMs)
  })
}

export interface NanhuaQuotationRequest {
  code: string
  freq: SupportedFreq
  size?: number
}

export async function fetchNanhuaQuotation(
  request: NanhuaQuotationRequest,
): Promise<NanhuaQuotationField[]> {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return []
  }

  let socket: WebSocket | null = null
  const queue: Waiter[] = []

  try {
    const tokenBytes = await createAuthTokenBytes()

    socket = new WebSocket(NANHUA_WS_URL)

    socket.addEventListener('message', async (event) => {
      try {
        const payload = event.data instanceof Blob
          ? new Uint8Array(await event.data.arrayBuffer())
          : event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : null

        if (!payload) {
          return
        }

        const message = parseQuotationMessage(payload)
        const waiterIndex = queue.findIndex((waiter) => waiter.match(message))
        if (waiterIndex < 0) {
          return
        }
        const [waiter] = queue.splice(waiterIndex, 1)
        waiter.resolve(message)
      } catch {
        // ignore unparseable socket frames
      }
    })

    socket.addEventListener('close', () => {
      while (queue.length > 0) {
        const waiter = queue.shift()
        waiter?.reject(new Error('nanhua socket closed unexpectedly'))
      }
    })

    await waitForSocketOpen(socket)

    let seq = 1
    socket.send(encodeAuthMessage(seq, tokenBytes))

    const authMessage = await waitForMessage(queue, (message) => message.msgid === MSG_ID.auth)
    const authErrCode = authMessage.response.find((item) => item.errCode !== undefined)?.errCode ?? 0
    if (authErrCode !== 0) {
      return []
    }

    seq += 1
    socket.send(
      encodeQuotationQueryMessage(seq, request.code, FREQ[request.freq], request.size),
    )

    const quoteMessage = await waitForMessage(
      queue,
      (message) =>
        message.msgid === MSG_ID.qryQuotation && Math.abs(message.seq ?? 0) === seq,
    )

    const quotes = quoteMessage.response.flatMap((item) =>
      Array.isArray(item.quotation) ? item.quotation : [],
    )
    return Array.isArray(quotes) ? quotes : []
  } catch {
    return []
  } finally {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close()
    }
  }
}
