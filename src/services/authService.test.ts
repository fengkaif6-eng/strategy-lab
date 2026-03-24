import { beforeEach, describe, expect, test } from 'vitest'
import {
  loadSession,
  loginUser,
  registerUser,
  resetAuthStorage,
} from './authService'

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAuthStorage()
  })

  test('registers user and writes session', async () => {
    const user = await registerUser('tester', '123456')
    expect(user.role).toBe('user')
    expect(loadSession()?.username).toBe('tester')
  })

  test('supports admin login with seeded account', async () => {
    const admin = await loginUser('admin', 'Admin@123456')
    expect(admin.role).toBe('admin')
    expect(loadSession()?.username).toBe('admin')
  })

  test('rejects invalid credentials', async () => {
    await expect(loginUser('missing', '123456')).rejects.toThrow('用户名或密码错误')
  })
})
