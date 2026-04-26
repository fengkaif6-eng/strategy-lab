import { beforeEach, describe, expect, test } from 'vitest'
import {
  approveRegistrationRequest,
  listManagedUsers,
  listRegistrationRequests,
  loadSession,
  loginUser,
  registerUser,
  resetAuthStorage,
  updateUserPermissions,
} from './authService'

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAuthStorage()
  })

  test('registration creates pending request instead of auto login', async () => {
    await registerUser({
      username: 'tester',
      password: '123456',
      fullName: 'tester',
      organization: 'org',
      email: 'tester@example.com',
      contact: '13800000000',
    })

    const managedUsernames = (await listManagedUsers()).map((item) => item.username)
    expect(await listRegistrationRequests()).toHaveLength(1)
    expect(managedUsernames).toContain('user_demo')
    expect(managedUsernames).not.toContain('tester')
    expect(loadSession()).toBeNull()
  })

  test('admin can approve registration with strategy permissions', async () => {
    const request = await registerUser({
      username: 'investor',
      password: '123456',
      fullName: 'investor',
      organization: 'orgA',
      email: 'investor@example.com',
      contact: '13900000000',
    })

    const created = await approveRegistrationRequest(request.id, {
      allowBacktest: false,
      allowLive: false,
      allowThirdParty: false,
      backtestStrategyIds: ['bt_alpha'],
      liveStrategyIds: [],
      thirdPartyStrategyIds: [],
    })

    expect(created.username).toBe('investor')
    expect(created.permissions.backtestStrategyIds).toContain('bt_alpha')
    expect(await listRegistrationRequests()).toHaveLength(0)
    expect((await listManagedUsers()).map((item) => item.username)).toContain('investor')
  })

  test('supports admin login with seeded account', async () => {
    const admin = await loginUser('admin', 'Admin@123456')
    expect(admin.role).toBe('admin')
    expect(loadSession()?.username).toBe('admin')
  })

  test('supports normal user login with seeded demo account', async () => {
    const user = await loginUser('user_demo', 'User@123456')
    expect(user.role).toBe('user')
    expect(user.permissions.allowBacktest).toBe(true)
    expect(loadSession()?.username).toBe('user_demo')
  })

  test('updates existing user permissions', async () => {
    const request = await registerUser({
      username: 'operator',
      password: '123456',
      fullName: 'operator',
      organization: 'orgB',
      email: 'operator@example.com',
      contact: '13600000000',
    })

    const created = await approveRegistrationRequest(request.id, {
      allowBacktest: true,
      allowLive: false,
      allowThirdParty: false,
      backtestStrategyIds: [],
      liveStrategyIds: [],
      thirdPartyStrategyIds: [],
    })

    const updated = await updateUserPermissions(created.id, {
      allowBacktest: false,
      allowLive: true,
      allowThirdParty: false,
      backtestStrategyIds: [],
      liveStrategyIds: ['live_beta'],
      thirdPartyStrategyIds: [],
    })

    expect(updated.permissions.allowBacktest).toBe(false)
    expect(updated.permissions.allowLive).toBe(true)
    expect(updated.permissions.liveStrategyIds).toContain('live_beta')
  })

  test('rejects invalid credentials', async () => {
    await expect(loginUser('missing', '123456')).rejects.toThrow('用户名或密码错误')
  })
})
