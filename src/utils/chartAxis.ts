export interface NumericAxisScale {
  domain: [number, number]
  ticks: number[]
}

interface NumericAxisScaleOptions {
  paddingRatio?: number
  minPadding?: number
  flatPaddingRatio?: number
  tickCount?: number
}

function toFixedSafe(value: number, digits = 8) {
  return Number(value.toFixed(digits))
}

function getNiceStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1
  }

  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / 10 ** exponent

  if (fraction <= 1) {
    return 1 * 10 ** exponent
  }
  if (fraction <= 2) {
    return 2 * 10 ** exponent
  }
  if (fraction <= 5) {
    return 5 * 10 ** exponent
  }
  return 10 * 10 ** exponent
}

export function buildNumericAxisScale(
  values: number[],
  {
    paddingRatio = 0.12,
    minPadding = 0.02,
    flatPaddingRatio = 0.003,
    tickCount = 5,
  }: NumericAxisScaleOptions = {},
): NumericAxisScale {
  const validValues = values.filter((value) => Number.isFinite(value))

  if (validValues.length === 0) {
    return {
      domain: [0, 1],
      ticks: [0, 0.25, 0.5, 0.75, 1],
    }
  }

  const min = Math.min(...validValues)
  const max = Math.max(...validValues)
  const spread = max - min
  const base = Math.max(Math.abs(min), Math.abs(max), 1)
  const padding =
    spread > 0
      ? Math.max(spread * paddingRatio, minPadding)
      : Math.max(base * flatPaddingRatio, minPadding)

  const roughMin = min - padding
  const roughMax = max + padding
  const rawStep = (roughMax - roughMin) / Math.max(tickCount - 1, 1)
  const step = getNiceStep(rawStep)
  const domainMin = Math.floor((roughMin + step * 1e-6) / step) * step
  const domainMax = Math.ceil((roughMax - step * 1e-6) / step) * step

  const ticks: number[] = []
  for (let value = domainMin; value <= domainMax + step * 0.5; value += step) {
    ticks.push(toFixedSafe(value))
  }

  return {
    domain: [toFixedSafe(domainMin), toFixedSafe(domainMax)],
    ticks,
  }
}

export function buildEquityAxisScale(values: number[]): NumericAxisScale {
  return buildNumericAxisScale(values, {
    paddingRatio: 0.08,
    minPadding: 0.0005,
    flatPaddingRatio: 0.0008,
    tickCount: 6,
  })
}
