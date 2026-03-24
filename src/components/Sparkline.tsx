interface SparklineProps {
  values: number[]
  className?: string
}

function buildPath(values: number[]) {
  if (values.length === 0) {
    return ''
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export function Sparkline({ values, className }: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        className={className}
      />
    )
  }

  const path = buildPath(values)
  const positive = values[values.length - 1] >= values[0]

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <path
        d={path}
        fill="none"
        stroke={positive ? 'var(--color-profit)' : 'var(--color-loss)'}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}
