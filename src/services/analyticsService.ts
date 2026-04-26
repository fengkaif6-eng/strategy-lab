import { apiJson } from './apiBase'
import type { UserRole } from '../types/auth'
import type { StrategyChannel } from '../types/strategy'

const SNAPSHOT_VERSION = 2

export interface VisitCounter {
  count: number
  lastVisitedAt: string
}

export interface StrategyVisitCounter extends VisitCounter {
  channel: StrategyChannel
  strategyId: string
  strategyName: string
}

export interface PermissionOpenLog {
  id: string
  action: 'approve' | 'update'
  targetUserId: string
  targetUsername: string
  summary: string
  timestamp: string
}

export interface AnalyticsSnapshot {
  version: number
  moduleVisits: Record<string, VisitCounter>
  strategyVisits: Record<string, StrategyVisitCounter>
  permissionOpens: PermissionOpenLog[]
}

function getDefaultSnapshot(): AnalyticsSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    moduleVisits: {},
    strategyVisits: {},
    permissionOpens: [],
  }
}

export async function loadAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  try {
    const payload = await apiJson<AnalyticsSnapshot>('/api/admin/analytics')
    if (payload.version !== SNAPSHOT_VERSION) {
      return getDefaultSnapshot()
    }
    return payload
  } catch {
    return getDefaultSnapshot()
  }
}

function isRegularUser(role: UserRole | null | undefined) {
  return role === 'user'
}

export async function trackModuleVisit(pathname: string, actorRole: UserRole | null | undefined) {
  if (!pathname || !isRegularUser(actorRole)) {
    return
  }
  try {
    await apiJson('/api/analytics/module-visit', {
      method: 'POST',
      body: JSON.stringify({
        pathname,
        actorRole,
      }),
    })
  } catch {
    // Ignore telemetry errors.
  }
}

export async function trackStrategyVisit(
  channel: StrategyChannel,
  strategyId: string,
  strategyName: string,
  actorRole: UserRole | null | undefined,
) {
  if (!strategyId || !isRegularUser(actorRole)) {
    return
  }
  try {
    await apiJson('/api/analytics/strategy-visit', {
      method: 'POST',
      body: JSON.stringify({
        channel,
        strategyId,
        strategyName,
        actorRole,
      }),
    })
  } catch {
    // Ignore telemetry errors.
  }
}

interface PermissionOpenPayload {
  action: PermissionOpenLog['action']
  targetUserId: string
  targetUsername: string
  summary: string
}

export async function trackPermissionOpen(payload: PermissionOpenPayload) {
  try {
    await apiJson('/api/analytics/permission-open', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch {
    // Ignore telemetry errors.
  }
}

export function resetAnalyticsSnapshot() {
  // Analytics is persisted on backend now.
}
