import { describe, expect, test } from 'vitest'
import { buildEquityAxisScale, buildNumericAxisScale } from './chartAxis'

describe('chart axis utils', () => {
  test('keeps fx axis compact for small moves', () => {
    const scale = buildNumericAxisScale([7.2312, 7.2319, 7.2326, 7.2321], {
      paddingRatio: 0.18,
      minPadding: 0.0003,
      flatPaddingRatio: 0.0002,
      tickCount: 5,
    })

    expect(scale.domain[0]).toBeGreaterThan(7.23)
    expect(scale.domain[1]).toBeLessThan(7.234)
    expect(scale.ticks).toEqual([7.2305, 7.231, 7.2315, 7.232, 7.2325, 7.233])
  })

  test('provides a stable domain for flat values', () => {
    const scale = buildNumericAxisScale([7.22, 7.22, 7.22], {
      paddingRatio: 0.18,
      minPadding: 0.0003,
      flatPaddingRatio: 0.0002,
      tickCount: 5,
    })

    expect(scale.domain).toEqual([7.218, 7.222])
    expect(scale.ticks).toEqual([7.218, 7.219, 7.22, 7.221, 7.222])
  })

  test('keeps equity axis close to the curve', () => {
    const scale = buildEquityAxisScale([0.0121, 0.0134, 0.0128, 0.0142])

    expect(scale.domain).toEqual([0.011, 0.015])
    expect(scale.ticks).toEqual([0.011, 0.012, 0.013, 0.014, 0.015])
  })
})
