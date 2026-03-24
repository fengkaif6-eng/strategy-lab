export type UserRole = 'guest' | 'user' | 'admin'

export interface AuthUser {
  id: string
  username: string
  role: Exclude<UserRole, 'guest'>
  token: string
  registeredAt: string
}
