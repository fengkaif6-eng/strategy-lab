import { describe, expect, test } from 'vitest'
import { normalizeCodeName, parseTencentQuotes } from './marketService'

describe('marketService parser', () => {
  test('parses short tencent payload and normalizes known names', () => {
    const payload =
      'v_s_sh000001="1~乱码名~000001~3881.28~68.00~1.78~680622039~93141884~~637996.64~ZS~";'
    const result = parseTencentQuotes(payload)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('上证指数')
    expect(result[0].changePct).toBe(1.78)
  })

  test('parses forex payload format', () => {
    const payload =
      'v_whUSDCNY="310~美元人民币~USDCNY~6.8976~0~20260325170040~6.8916~6.8900~6.9000~6.8823~6.8976~6.8981~0.0060~0.09~0.14~0.35~0.56~-2.03~-1.28~7.3509~6.8312~2026-03-25";'
    const result = parseTencentQuotes(payload)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('USDCNY')
    expect(result[0].code).toBe('USDCNY')
    expect(result[0].changePct).toBe(0.09)
  })

  test('ignores invalid rows', () => {
    const payload = 'invalid-line;v_s_sh000001="1~乱码~000001~x~68.00~1.78";'
    const result = parseTencentQuotes(payload)
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(0)
  })

  test('normalizes name by code', () => {
    expect(normalizeCodeName('399001', 'fallback')).toBe('深证成指')
    expect(normalizeCodeName('CN10Y', 'fallback')).toBe('十年期国债到期收益率')
    expect(normalizeCodeName('999999', 'fallback')).toBe('fallback')
  })
})

