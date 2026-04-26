const configuredBaseUrl = (import.meta.env.VITE_MARKET_API_BASE_URL ?? '').trim()
const DEV_API_BASE_URL = 'http://127.0.0.1:8000'

export const API_BASE_URL = (
  import.meta.env.DEV ? DEV_API_BASE_URL : configuredBaseUrl
).replace(/\/+$/, '')

const DEFAULT_ORIGIN =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const base = API_BASE_URL || DEFAULT_ORIGIN
  return `${base}${path}`
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method ?? 'GET').toUpperCase()
  const cacheMode = method === 'GET' || method === 'HEAD' ? 'no-store' : init?.cache
  const response = await fetch(buildApiUrl(path), {
    ...init,
    cache: cacheMode,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = `Request failed: ${response.status}`
    try {
      const data = (await response.json()) as { detail?: string }
      if (typeof data.detail === 'string' && data.detail.trim()) {
        message = data.detail
      }
    } catch {
      // ignore non-json error payloads
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
