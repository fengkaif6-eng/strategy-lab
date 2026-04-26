import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppRoutes } from './App'
import { Layout } from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { LocaleProvider } from './context/LocaleContext'
import { StrategyProvider } from './context/StrategyContext'
import { seedBacktestStrategies, seedLiveStrategies } from './data/seedStrategies'
import {
  approveRegistrationRequest,
  loginUser,
  listManagedUsers,
  registerUser,
  resetAuthStorage,
} from './services/authService'
import { loadStrategies, resetStorage, saveStrategies } from './services/strategyStorage'

const homeMarketPayload = {
  updatedAt: '2026-03-26T03:00:00.000Z',
  tickerStrip: [
    { code: '600519', name: 'Kweichow Moutai', price: 1689, changePct: 0.66 },
    { code: '300750', name: 'CATL', price: 255.3, changePct: -1.2 },
  ],
  marketCards: [
    { code: '000001', name: '涓婅瘉鎸囨暟', kind: 'index', price: 3908.45, change: -23.39, changePct: -0.59, note: '60D Daily' },
    { code: 'CN10Y', name: '涓浗10骞存湡鍥藉€烘敹鐩婄巼', kind: 'rate', price: 1.823, change: -0.004, changePct: -0.22, note: '杩?0涓氦鏄撴棩鏃ョ嚎' },
    { code: 'NHCI', name: '鍗楀崕鍟嗗搧鎸囨暟', kind: 'index', price: 3062.27, change: 10.08, changePct: 0.33, note: '60D Daily' },
    { code: 'USDCNY', name: 'USD/CNY', kind: 'fx', price: 6.9056, change: 0.0145, changePct: 0.21, note: '60D Daily' },
  ],
  importantCards: [
    { code: 'CHINA_EPU', name: '鍥藉鍜屽湴鍖烘寚鏁', kind: 'index', price: 743.4, change: 139.66, changePct: 23.13, note: '杩?0涓氦鏄撴棩鏃ョ嚎' },
    { code: 'QVIX300ETF', name: '300ETF鏈熸潈娉㈠姩鐜?', kind: 'index', price: 20.09, change: 1.79, changePct: 9.78, note: '杩?0涓氦鏄撴棩鏃ョ嚎' },
    { code: 'SHIBOR', name: '3涓湀 Shibor', kind: 'rate', price: 1.514, change: -0.002, changePct: -0.13, note: '杩?0涓氦鏄撴棩鏃ョ嚎' },
    { code: 'LPR', name: '5骞存湡 LPR', kind: 'rate', price: 3.6, change: 0.1, changePct: 2.86, note: '杩?0涓氦鏄撴棩鏃ョ嚎' },
  ],
  seriesByCode: {
    '000001': {
      granularity: 'daily',
      points: [
        { label: '2026-03-25', isoTime: '2026-03-25', price: 3931.84, volume: 0 },
        { label: '2026-03-26', isoTime: '2026-03-26', price: 3908.45, volume: 0 },
      ],
      note: '60D Daily',
    },
    CN10Y: {
      granularity: 'daily',
      points: [
        { label: '2026-03-24', isoTime: '2026-03-24', price: 1.8272, volume: 0 },
        { label: '2026-03-25', isoTime: '2026-03-25', price: 1.8233, volume: 0 },
      ],
      note: '杩?0涓氦鏄撴棩鏃ョ嚎',
    },
    NHCI: {
      granularity: 'daily',
      points: [
        { label: '2026-03-25', isoTime: '2026-03-25', price: 3059.02, volume: 0 },
        { label: '2026-03-26', isoTime: '2026-03-26', price: 3062.27, volume: 0 },
      ],
      note: '60D Daily',
    },
    USDCNY: {
      granularity: 'daily',
      points: [
        { label: '2026-03-25', isoTime: '2026-03-25', price: 6.8911, volume: 0 },
        { label: '2026-03-26', isoTime: '2026-03-26', price: 6.9056, volume: 0 },
      ],
      note: '杩?0涓氦鏄撴棩鏃ョ嚎',
    },
  },
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleProvider>
        <AuthProvider>
          <StrategyProvider>
            <Layout>
              <AppRoutes />
            </Layout>
          </StrategyProvider>
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  )
}

async function seedStrategyAttachment() {
  const strategies = await loadStrategies('backtest')
  strategies[0] = {
    ...strategies[0],
    detail: {
      ...strategies[0].detail,
      attachments: [
        {
          id: 'att-001',
          title: '绛栫暐璇存槑鏂囨。',
          url: 'https://example.com/files/strategy-note.pdf',
          note: 'Attachment note',
          createdAt: '2026-03-26T08:30:00.000Z',
          createdBy: 'admin',
          sourceType: 'url',
          fileName: 'strategy-note.pdf',
        },
      ],
    },
  }
  await saveStrategies('backtest', strategies)
}

async function seedLocalStrategyAttachment() {
  const strategies = await loadStrategies('backtest')
  strategies[0] = {
    ...strategies[0],
    detail: {
      ...strategies[0].detail,
      attachments: [
        {
          id: 'att-local-001',
          title: 'local preview attachment',
          url: 'data:application/pdf;base64,JVBERi0xLjQKJQ==',
          note: 'local preview attachment note',
          createdAt: '2026-03-26T08:30:00.000Z',
          createdBy: 'admin',
          sourceType: 'file',
          fileName: 'local-preview.pdf',
          mimeType: 'application/pdf',
        },
      ],
    },
  }
  await saveStrategies('backtest', strategies)
}

describe('app integration', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('strategy_lab_locale', 'en')
    resetStorage()
    resetAuthStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify(homeMarketPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('guest is redirected to home from protected route', async () => {
    renderApp('/incubation-strategies')
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Quant Strategy Business Platform' }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByText('Please register or sign in before visiting this page.'),
    ).toBeInTheDocument()
  })

  test('home page shows market overview with 60-day cards on the first row', async () => {
    const { container } = renderApp('/')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Market Overview' })).toBeInTheDocument(),
    )

    expect(container.querySelector('.hero-slogan')).toHaveTextContent(
      /Where Innovation Happens,\s*For Clients We Serve/,
    )
    expect(screen.getByRole('heading', { name: 'Country & Region Index' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '300ETF Option Volatility' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '3M Shibor' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '5Y LPR' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Key Data' })).toBeInTheDocument()
    expect(screen.queryByText('Fixed Income Strategies')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Unified view of key market assets with real-time levels and selected daily history.',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Compact view across global rates, equity, money market, and precious metal indicators.',
      ),
    ).not.toBeInTheDocument()

    const marketHeadings = Array.from(
      container.querySelectorAll('.eficc-grid article header h3'),
    ).map((element) => element.textContent?.trim())
    expect(marketHeadings).toEqual([
      'SSE Composite',
      'Nanhua Commodity Index',
      'China 10Y Treasury Yield',
      'USD/CNY',
    ])

    const marketBadges = Array.from(
      container.querySelectorAll('.eficc-grid .market-curve-badge'),
    ).map((element) => element.textContent?.trim())
    expect(marketBadges).toEqual([
      '60D Daily',
      '60D Daily',
      '60D Daily',
      '60D Daily',
    ])

    expect(container.querySelector('.home-hero .ticker-strip')).not.toBeNull()
    expect(container.querySelector('.home-page > .ticker-strip')).toBeNull()

    const importantUpdatedLabels = Array.from(
      container.querySelectorAll('.market-grid-4 .market-card-updated'),
    ).map((element) => element.textContent?.trim())
    expect(importantUpdatedLabels).toHaveLength(4)
    expect(importantUpdatedLabels.every((label) => label?.startsWith('Updated: '))).toBe(true)
  })

  test('user navigation follows channel permissions', async () => {
    const user = userEvent.setup()
    const request = await registerUser({
      username: 'investor',
      password: '123456',
      fullName: '鎶曡祫缁忕悊',
      organization: '鏈烘瀯A',
      email: 'investor@example.com',
      contact: '13900000000',
    })

    await approveRegistrationRequest(request.id, {
      allowBacktest: false,
      allowLive: false,
      allowThirdParty: false,
      backtestStrategyIds: [seedBacktestStrategies[0].id],
      liveStrategyIds: [],
      thirdPartyStrategyIds: [],
    })
    await loginUser('investor', '123456')

    renderApp('/')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Strategies' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('link', { name: 'Incubation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Published' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Strategies' }))

    expect(screen.getByRole('menuitem', { name: 'Incubation' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Published' })).not.toBeInTheDocument()
  })

  test('user can open products dropdown in top navigation', async () => {
    const user = userEvent.setup()
    const request = await registerUser({
      username: 'client_user',
      password: '123456',
      fullName: '瀹㈡埛缁忕悊',
      organization: '鏈烘瀯B',
      email: 'client_user@example.com',
      contact: '13800000000',
    })

    await approveRegistrationRequest(request.id, {
      allowBacktest: true,
      allowLive: false,
      allowThirdParty: false,
      backtestStrategyIds: [seedBacktestStrategies[0].id],
      liveStrategyIds: [],
      thirdPartyStrategyIds: [],
    })
    await loginUser('client_user', '123456')

    renderApp('/')

    const productsButton = await screen.findByRole('button', { name: 'Products' })
    await user.click(productsButton)

    expect(screen.getByRole('menuitem', { name: 'Product Intro' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Product Quotes' })).toBeInTheDocument()
  })

  test('user can compare authorized strategies', async () => {
    const user = userEvent.setup()
    const request = await registerUser({
      username: 'compare_user',
      password: '123456',
      fullName: '策略对比用户',
      organization: '机构D',
      email: 'compare_user@example.com',
      contact: '13500000000',
    })

    await approveRegistrationRequest(request.id, {
      allowBacktest: false,
      allowLive: false,
      allowThirdParty: false,
      backtestStrategyIds: [seedBacktestStrategies[0].id],
      liveStrategyIds: [seedLiveStrategies[0].id],
      thirdPartyStrategyIds: [],
    })
    await loginUser('compare_user', '123456')

    renderApp('/strategy-compare')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Strategy Comparison' })).toBeInTheDocument(),
    )
    expect(screen.getByText('Choose at least two strategies')).toBeInTheDocument()

    const options = screen.getAllByRole('checkbox')
    expect(options).toHaveLength(2)

    await user.click(options[0])
    await user.click(options[1])

    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'Metric' })).toBeInTheDocument(),
    )
  })

  test('admin deletes strategy and plaza updates', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await loginUser('admin', 'Admin@123456')

    renderApp('/strategy-manage')
    const targetName = seedBacktestStrategies[0].name

    const deleteButton = await screen.findAllByRole('button', {
      name: /^(Delete|鍒犻櫎)$/,
    })
    await user.click(deleteButton[0])
    await user.click(screen.getByRole('button', { name: 'Strategies' }))
    await user.click(screen.getByRole('menuitem', { name: 'Incubation' }))

    await waitFor(() => expect(screen.queryByText(targetName)).not.toBeInTheDocument())
    confirmSpy.mockRestore()
  })

  test('admin can access product quote route directly', async () => {
    await loginUser('admin', 'Admin@123456')

    renderApp('/product-quote')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Product Quotes' })).toBeInTheDocument(),
    )
  })

  test('admin can filter users by organization and bulk grant full access', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const requestA1 = await registerUser({
      username: 'org_a_user_1',
      password: '123456',
      fullName: '机构A用户1',
      organization: '机构A',
      email: 'orga1@example.com',
      contact: '13600000001',
    })
    const requestA2 = await registerUser({
      username: 'org_a_user_2',
      password: '123456',
      fullName: '机构A用户2',
      organization: '机构A',
      email: 'orga2@example.com',
      contact: '13600000002',
    })
    const requestB1 = await registerUser({
      username: 'org_b_user_1',
      password: '123456',
      fullName: '机构B用户1',
      organization: '机构B',
      email: 'orgb1@example.com',
      contact: '13600000003',
    })

    const limitedPermissions = {
      allowBacktest: false,
      allowLive: false,
      allowThirdParty: false,
      backtestStrategyIds: [seedBacktestStrategies[0].id],
      liveStrategyIds: [],
      thirdPartyStrategyIds: [],
    }

    await approveRegistrationRequest(requestA1.id, limitedPermissions)
    await approveRegistrationRequest(requestA2.id, limitedPermissions)
    await approveRegistrationRequest(requestB1.id, limitedPermissions)
    await loginUser('admin', 'Admin@123456')

    renderApp('/admin-console')

    const filter = await screen.findByRole('combobox', { name: 'Organization Filter' })
    await user.selectOptions(filter, '机构A')

    expect(screen.getByText('Pending: 0')).toBeInTheDocument()
    expect(screen.getByText('Registered: 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Grant Full Access to Filtered Users' }))

    await waitFor(async () => {
      const managedUsers = await listManagedUsers()
      const orgAUsers = managedUsers.filter((item) => item.organization === '机构A')
      const orgBUsers = managedUsers.filter((item) => item.organization === '机构B')
      expect(orgAUsers).toHaveLength(2)
      expect(orgAUsers.every((item) => item.permissions.allowBacktest && item.permissions.allowLive)).toBe(true)
      expect(orgBUsers).toHaveLength(1)
      expect(orgBUsers[0].permissions.allowBacktest).toBe(false)
      expect(orgBUsers[0].permissions.allowLive).toBe(false)
    })

    confirmSpy.mockRestore()
  })

  test('admin sees four attachment columns and full action set', async () => {
    await seedStrategyAttachment()
    await loginUser('admin', 'Admin@123456')

    renderApp(`/strategy/backtest/${seedBacktestStrategies[0].id}`)

    await waitFor(() => expect(screen.getByRole('heading', { name: '策略附件' })).toBeInTheDocument())

    expect(screen.getAllByRole('columnheader').map((item) => item.textContent)).toEqual([
      '名称',
      '描述',
      '操作栏',
      '操作信息',
    ])
    expect(screen.getByLabelText('描述')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看附件' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载附件' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除附件' })).toBeInTheDocument()
    expect(screen.getByText('作者')).toBeInTheDocument()
    expect(screen.getByText('上传时间')).toBeInTheDocument()
    expect(screen.getByText('strategy-note.pdf')).toBeInTheDocument()
  })

  test('registered user only sees view action in attachment list', async () => {
    await seedStrategyAttachment()
    const request = await registerUser({
      username: 'attachment_user',
      password: '123456',
      fullName: '闄勪欢鐢ㄦ埛',
      organization: '鏈烘瀯C',
      email: 'attachment_user@example.com',
      contact: '13700000000',
    })

    await approveRegistrationRequest(request.id, {
      allowBacktest: false,
      allowLive: false,
      allowThirdParty: false,
      backtestStrategyIds: [seedBacktestStrategies[0].id],
      liveStrategyIds: [],
      thirdPartyStrategyIds: [],
    })
    await loginUser('attachment_user', '123456')

    renderApp(`/strategy/backtest/${seedBacktestStrategies[0].id}`)

    await waitFor(() => expect(screen.getByRole('button', { name: '查看附件' })).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: '下载附件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除附件' })).not.toBeInTheDocument()
  })
  test('local uploaded attachment opens through blob preview instead of raw data url', async () => {
    await seedLocalStrategyAttachment()
    await loginUser('admin', 'Admin@123456')

    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const createObjectURLSpy = vi.fn(() => 'blob:attachment-preview')
    const revokeObjectURLSpy = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLSpy,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLSpy,
    })

    const user = userEvent.setup()

    try {
      renderApp(`/strategy/backtest/${seedBacktestStrategies[0].id}`)

      await waitFor(() =>
        expect(screen.getByRole('button', { name: '查看附件' })).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: '查看附件' }))

      expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
      expect(openSpy).toHaveBeenCalledWith('blob:attachment-preview', '_blank')
      expect(alertSpy).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      })
      openSpy.mockRestore()
      alertSpy.mockRestore()
    }
  })
})
