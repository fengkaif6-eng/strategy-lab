import { metricTone } from '../utils/format'

interface MetricChipProps {
  label: string
  value: string
  rawValue?: number
}

export function MetricChip({ label, value, rawValue }: MetricChipProps) {
  const toneClass =
    rawValue === undefined ? 'metric-chip-neutral' : `metric-chip-${metricTone(rawValue)}`

  return (
    <div className={`metric-chip ${toneClass}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  )
}
