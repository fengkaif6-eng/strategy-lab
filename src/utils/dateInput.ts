export function sanitizeDateInput(value: string): string {
  return value.replace(/[^\d/-]/g, '').replace(/-/g, '/')
}

export function formatDateInputDisplay(value: string): string {
  const normalized = sanitizeDateInput(value).trim()
  if (!normalized) {
    return ''
  }

  const fullDateMatch = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!fullDateMatch) {
    return normalized
  }

  const [, year, month, day] = fullDateMatch
  return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`
}
