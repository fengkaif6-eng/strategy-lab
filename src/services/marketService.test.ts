import { describe, expect, test } from 'vitest'
import { normalizeCodeName, parseTencentQuotes } from './marketService'

describe('marketService parser', () => {
  test('parses tencent payload and normalizes known names', () => {
    const payload =
      'v_s_sh000001="1~乱码~000001~3881.28~68.00~1.78~680622039~93141884~~637996.64~ZS~";'
    const result = parseTencentQuotes(payload)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('上证指数')
    expect(result[0].changePct).toBe(1.78)
  })

  test('ignores invalid rows', () => {
    const payload = 'invalid-line;v_s_sh000001="1~乱码~000001~x~68.00~1.78";'
    const result = parseTencentQuotes(payload)
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(0)
  })

  test('normalizes name by code', () => {
    expect(normalizeCodeName('399001', 'fallback')).toBe('深证成指')
    expect(normalizeCodeName('999999', 'fallback')).toBe('fallback')
  })
})
