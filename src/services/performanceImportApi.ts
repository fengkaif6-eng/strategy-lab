import { buildApiUrl } from './apiBase'
import type { ImportedPerformanceData } from '../utils/performanceImport'

export interface BpImportPayload {
  signalFile: File
  yieldFile: File
  signalDateCol?: string
  signalCol?: string
  yieldDateCol?: string
  yieldCol?: string
  signalName?: string
  feeBpsPerSide?: number
  stopLossBp?: number | null
  executionDelayBars?: number
  externalStopCol?: string
}

export async function importBpPerformanceFiles(
  payload: BpImportPayload,
): Promise<ImportedPerformanceData> {
  const formData = new FormData()
  formData.append('signalFile', payload.signalFile)
  formData.append('yieldFile', payload.yieldFile)
  formData.append('signalCol', payload.signalCol?.trim() || 'signal')
  formData.append('yieldDateCol', payload.yieldDateCol?.trim() || 'date')
  formData.append('yieldCol', payload.yieldCol?.trim() || 'yield')
  formData.append('signalName', payload.signalName?.trim() || 'signal')
  formData.append(
    'feeBpsPerSide',
    String(Number.isFinite(payload.feeBpsPerSide) ? payload.feeBpsPerSide : 0),
  )
  formData.append(
    'executionDelayBars',
    String(
      Number.isInteger(payload.executionDelayBars) && (payload.executionDelayBars ?? 0) >= 0
        ? payload.executionDelayBars
        : 1,
    ),
  )

  if (payload.signalDateCol?.trim()) {
    formData.append('signalDateCol', payload.signalDateCol.trim())
  }
  if (payload.stopLossBp !== null && payload.stopLossBp !== undefined) {
    formData.append('stopLossBp', String(payload.stopLossBp))
  }
  if (payload.externalStopCol?.trim()) {
    formData.append('externalStopCol', payload.externalStopCol.trim())
  }

  const response = await fetch(buildApiUrl('/api/admin/performance-import/bp'), {
    method: 'POST',
    body: formData,
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

  return (await response.json()) as ImportedPerformanceData
}
