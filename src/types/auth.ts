export type UserRole = 'guest' | 'user' | 'admin'

export interface StrategyPermissionSet {
  allowBacktest: boolean
  allowLive: boolean
  allowThirdParty: boolean
  backtestStrategyIds: string[]
  liveStrategyIds: string[]
  thirdPartyStrategyIds: string[]
}

export interface AuthUser {
  id: string
  username: string
  fullName: string
  organization: string
  email: string
  contact: string
  role: Exclude<UserRole, 'guest'>
  token: string
  registeredAt: string
  permissions: StrategyPermissionSet
}

export interface RegistrationPayload {
  username: string
  password: string
  fullName: string
  organization: string
  email: string
  contact: string
}

export interface RegistrationRequest {
  id: string
  username: string
  fullName: string
  organization: string
  email: string
  contact: string
  requestedAt: string
}
