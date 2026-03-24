import { describe, expect, test } from 'vitest'
import { formatPercent, metricTone, safeParseNumber } from './format'

describe('format utils', () => {
  test('formats positive and negative percentages', () => {
    expect(formatPercent(0.1234)).toBe('+12.34%')
    expect(formatPercent(-0.051)).toBe('-5.10%')
  })

  test('maps metric tone correctly', () => {
    expect(metricTone(1)).toBe('positive')
    expect(metricTone(-0.1)).toBe('negative')
    expect(metricTone(0)).toBe('neutral')
  })

  test('parses numbers with fallback', () => {
    expect(safeParseNumber('12.8')).toBe(12.8)
    expect(safeParseNumber('abc', 5)).toBe(5)
  })
})
