export interface BpFileInspection {
  columns: string[]
  dateColumns: string[]
  suggestedDateColumn: string | null
  suggestedValueColumn: string | null
  suggestedExternalStopColumn: string | null
  candidateValueColumns: string[]
  headerRowLabel: string
  requiresExplicitValueColumnSelection: boolean
}

type CellValue = string | number | boolean | Date | null | undefined
type TableRow = CellValue[]

const DATE_ALIASES = ['date', '日期', '交易日', '时间', 'datetime', '指标名称']
const SIGNAL_ALIASES = ['signal', '最终信号', '交易信号', '信号']
const YIELD_ALIASES = ['yield', '收益率', '到期收益率']
const EXTERNAL_STOP_ALIASES = [
  'bp_stop_loss_triggered',
  'stop_loss_triggered',
  '外部止损',
  '止损触发',
]
const EXCLUDED_VALUE_KEYWORDS = ['指标id', 'id', 'code', '代码']

function normalizeHeaderName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/.]+/g, '')
}

function isImplicitFirstColumnName(value: string, index: number) {
  if (index !== 0) {
    return false
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return true
  }
  if (/^Unnamed:\s*0$/i.test(trimmed)) {
    return true
  }
  return normalizeHeaderName(trimmed) === 'column0'
}

function isRecognizedDateColumn(value: string) {
  const normalized = normalizeHeaderName(value)
  return DATE_ALIASES.some((alias) => normalizeHeaderName(alias) === normalized)
}

function isExcludedValueColumn(value: string) {
  const normalized = normalizeHeaderName(value)
  return EXCLUDED_VALUE_KEYWORDS.some((keyword) =>
    normalized.includes(normalizeHeaderName(keyword)),
  )
}

function findHeaderRowIndex(rows: TableRow[]) {
  const aliases = new Set(DATE_ALIASES.map(normalizeHeaderName))
  const scanLimit = Math.min(rows.length, 10)
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const normalizedCells = row
      .filter((cell) => cell !== null && cell !== undefined && String(cell).trim())
      .map((cell) => normalizeHeaderName(String(cell)))
    if (normalizedCells.some((cell) => aliases.has(cell))) {
      return rowIndex
    }
  }
  return 0
}

function readRows(file: File): Promise<TableRow[]> {
  return file.arrayBuffer().then(async (buffer) => {
    const XLSX = await import('xlsx')
    const extension = file.name.split('.').pop()?.toLowerCase()
    const workbook =
      extension === 'csv'
        ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string' })
        : XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }) as TableRow[]
  })
}

function normalizeRows(rows: TableRow[]) {
  const headerRowIndex = findHeaderRowIndex(rows)
  const headerRow = rows[headerRowIndex] ?? []
  const rawColumns = headerRow.map((value, index) => {
    const column = String(value ?? '').trim()
    if (isImplicitFirstColumnName(column, index)) {
      return index === 0 ? 'Unnamed: 0' : `column_${index}`
    }
    if (!column) {
      return `column_${index}`
    }
    if (index === 0 && isRecognizedDateColumn(column)) {
      return 'date'
    }
    return column
  })

  let dataStartIndex = headerRowIndex + 1
  while (dataStartIndex < rows.length - 1) {
    const currentFirstCell = rows[dataStartIndex]?.[0]
    const nextFirstCell = rows[dataStartIndex + 1]?.[0]
    const normalizedCurrent = normalizeHeaderName(String(currentFirstCell ?? '').trim())
    if (
      normalizedCurrent === '指标id' ||
      normalizedCurrent === 'metricid' ||
      (!looksLikeDate(currentFirstCell) && looksLikeDate(nextFirstCell))
    ) {
      dataStartIndex += 1
      continue
    }
    break
  }

  const dataRows = rows
    .slice(dataStartIndex)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim()))

  return {
    columns: rawColumns,
    dataRows,
    headerRowIndex,
  }
}

function pickColumn(columns: string[], aliases: string[]) {
  const normalizedColumns = columns.map((column) => ({
    raw: column,
    normalized: normalizeHeaderName(column),
  }))

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderName(alias)
    const exact = normalizedColumns.find((column) => column.normalized === normalizedAlias)
    if (exact) {
      return exact.raw
    }
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderName(alias)
    const include = normalizedColumns.find((column) => column.normalized.includes(normalizedAlias))
    if (include) {
      return include.raw
    }
  }

  return null
}

function looksNumeric(value: CellValue) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }
  const normalized = trimmed.replace(/[,%\s]/g, '').replace(/，/g, '')
  return Number.isFinite(Number(normalized))
}

function looksLikeDate(value: CellValue) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime())
  }
  if (typeof value === 'number') {
    const parsed = new Date((value - 25569) * 86400 * 1000)
    return !Number.isNaN(parsed.getTime())
  }
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }
  return !Number.isNaN(new Date(trimmed.replace(/\./g, '-')).getTime())
}

function inferCandidateValueColumns(columns: string[], dataRows: TableRow[]) {
  return columns.filter((column, index) => {
    if (index === 0 || isRecognizedDateColumn(column) || isExcludedValueColumn(column)) {
      return false
    }
    const sample = dataRows
      .slice(0, 20)
      .map((row) => row[index])
      .filter((value) => value !== null && value !== undefined && String(value).trim())
    if (sample.length === 0) {
      return false
    }
    const numericCount = sample.filter(looksNumeric).length
    return numericCount / sample.length >= 0.6
  })
}

export async function inspectBpFile(file: File, kind: 'signal' | 'yield'): Promise<BpFileInspection> {
  const rows = await readRows(file)
  const { columns, dataRows, headerRowIndex } = normalizeRows(rows)
  const candidateValueColumns = inferCandidateValueColumns(columns, dataRows)
  const firstColumn = columns[0] ?? null
  const suggestedDateColumnCandidate = pickColumn(columns, DATE_ALIASES) ?? firstColumn
  const suggestedDateColumn =
    suggestedDateColumnCandidate && isImplicitFirstColumnName(suggestedDateColumnCandidate, 0)
      ? null
      : suggestedDateColumnCandidate

  const aliasMatchedValueColumn = pickColumn(
    columns,
    kind === 'signal' ? SIGNAL_ALIASES : YIELD_ALIASES,
  )
  const requiresExplicitValueColumnSelection =
    kind === 'yield' &&
    aliasMatchedValueColumn === null &&
    candidateValueColumns.length > 1
  const suggestedValueColumn =
    aliasMatchedValueColumn ??
    (requiresExplicitValueColumnSelection ? null : candidateValueColumns[0] ?? null)
  const suggestedExternalStopColumn = kind === 'signal'
    ? pickColumn(columns, EXTERNAL_STOP_ALIASES)
    : null

  return {
    columns,
    dateColumns: columns.filter(
      (column, index) => !isImplicitFirstColumnName(column, index) && (index === 0 || isRecognizedDateColumn(column)),
    ),
    suggestedDateColumn,
    suggestedValueColumn,
    suggestedExternalStopColumn,
    candidateValueColumns,
    headerRowLabel: `已识别第 ${headerRowIndex + 1} 行为表头`,
    requiresExplicitValueColumnSelection,
  }
}
