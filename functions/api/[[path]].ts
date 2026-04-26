import seedStrategiesJson from '../../backend/data/seed_strategies.json'
import homeMarketSnapshotJson from '../../backend/data/home_market_snapshot.json'

type StrategyChannel = 'backtest' | 'live' | 'thirdparty'
type UserRole = 'user' | 'admin'

interface KvNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

interface Env {
  STRATEGY_LAB_STATE?: KvNamespace
  MARKET_API_ALLOWED_ORIGINS?: string
}

interface StrategyPermissionSet {
  allowBacktest: boolean
  allowLive: boolean
  allowThirdParty: boolean
  backtestStrategyIds: string[]
  liveStrategyIds: string[]
  thirdPartyStrategyIds: string[]
}

interface AppUser {
  id: string
  username: string
  password: string
  fullName: string
  organization: string
  email: string
  contact: string
  role: UserRole
  token: string
  registeredAt: string
  permissions: StrategyPermissionSet
}

interface RegistrationRequest {
  id: string
  username: string
  password: string
  fullName: string
  organization: string
  email: string
  contact: string
  requestedAt: string
}

interface AppState {
  users: AppUser[]
  registrationRequests: RegistrationRequest[]
  strategies: Record<StrategyChannel, Record<string, unknown>[]>
  siteContent: {
    heroImages: Array<{ id: string; src: string; sourceType: 'default' | 'custom' }>
  }
  analytics: {
    version: number
    moduleVisits: Record<string, { count: number; lastVisitedAt: string }>
    strategyVisits: Record<
      string,
      {
        channel: StrategyChannel
        strategyId: string
        strategyName: string
        count: number
        lastVisitedAt: string
      }
    >
    permissionOpens: Array<{
      id: string
      action: 'approve' | 'update'
      targetUserId: string
      targetUsername: string
      summary: string
      timestamp: string
    }>
  }
}

type RouteHandler = (request: Request, env: Env, segments: string[]) => Promise<Response>

const STATE_KEY = 'app_state'
const MAX_PERMISSION_LOGS = 200
const SNAPSHOT_VERSION = 2

const FULL_ACCESS: StrategyPermissionSet = {
  allowBacktest: true,
  allowLive: true,
  allowThirdParty: true,
  backtestStrategyIds: [],
  liveStrategyIds: [],
  thirdPartyStrategyIds: [],
}

const EMPTY_ACCESS: StrategyPermissionSet = {
  allowBacktest: false,
  allowLive: false,
  allowThirdParty: false,
  backtestStrategyIds: [],
  liveStrategyIds: [],
  thirdPartyStrategyIds: [],
}

const DEFAULT_SITE_CONTENT: AppState['siteContent'] = {
  heroImages: [
    { id: 'hero-bg-default-1', src: '', sourceType: 'default' },
    { id: 'hero-bg-default-2', src: '', sourceType: 'default' },
    { id: 'hero-bg-default-3', src: '', sourceType: 'default' },
  ],
}

const DEFAULT_ANALYTICS: AppState['analytics'] = {
  version: SNAPSHOT_VERSION,
  moduleVisits: {},
  strategyVisits: {},
  permissionOpens: [],
}

const DEFAULT_THIRDPARTY_STRATEGIES: Record<string, unknown>[] = [
  {
    id: 'tp-201',
    name: '第三方 CTA 指数增强',
    channel: 'thirdparty',
    author: '第三方管理人 AlphaQuant',
    tags: ['第三方', 'CTA', '趋势'],
    riskLevel: 'medium',
    status: 'active',
    updatedAt: '2026-03-25',
    summary: '第三方管理人提供的多品种趋势策略，强调回撤控制与稳健年化。',
    metrics: {
      annualReturn: 0.183,
      sharpe: 1.46,
      maxDrawdown: -0.071,
      winRate: 0.59,
      tradeCount: 138,
      volatility: 0.131,
    },
    detail: {
      description: '基于第三方托管账户回传数据构建指标，按周同步最新净值。',
      logic: '多品种趋势打分 + 风险预算 + 动态仓位约束。',
      params: { rebalanceFreq: 'weekly', maxLeverage: 1.1, riskBudget: '8%' },
      equityCurve: [
        { date: '2025-12', value: 1.109 },
        { date: '2026-01', value: 1.123 },
        { date: '2026-02', value: 1.137 },
        { date: '2026-03', value: 1.152 },
      ],
      drawdownCurve: [
        { date: '2025-12', value: -0.012 },
        { date: '2026-01', value: -0.011 },
        { date: '2026-02', value: -0.009 },
        { date: '2026-03', value: -0.008 },
      ],
      monthlyReturns: [
        { month: '2025-12', return: 0.014 },
        { month: '2026-01', return: 0.014 },
        { month: '2026-02', return: 0.013 },
        { month: '2026-03', return: 0.013 },
      ],
      riskNotes: ['第三方数据回传口径需定期核验', '极端行情下波动可能放大'],
      attachments: [],
    },
  },
]

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowIso() {
  return new Date().toISOString()
}

function jsonResponse(request: Request, env: Env, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      ...corsHeaders(request, env),
    },
  })
}

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get('Origin') ?? ''
  const configured = (env.MARKET_API_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const devAllowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  const allowedOrigin =
    origin && (configured.length === 0 || configured.includes(origin) || devAllowed)
      ? origin
      : configured[0] ?? '*'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }
}

async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, '请求体不是有效 JSON')
  }
}

function publicUser(user: AppUser) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    organization: user.organization,
    email: user.email,
    contact: user.contact,
    role: user.role,
    token: user.token,
    registeredAt: user.registeredAt,
    permissions: user.permissions,
  }
}

function publicRegistrationRequest(request: RegistrationRequest) {
  return {
    id: request.id,
    username: request.username,
    fullName: request.fullName,
    organization: request.organization,
    email: request.email,
    contact: request.contact,
    requestedAt: request.requestedAt,
  }
}

function normalizePermissions(value: unknown, fallback: StrategyPermissionSet): StrategyPermissionSet {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    allowBacktest: Boolean(source.allowBacktest ?? fallback.allowBacktest),
    allowLive: Boolean(source.allowLive ?? fallback.allowLive),
    allowThirdParty: Boolean(source.allowThirdParty ?? fallback.allowThirdParty),
    backtestStrategyIds: normalizeStringList(source.backtestStrategyIds ?? fallback.backtestStrategyIds),
    liveStrategyIds: normalizeStringList(source.liveStrategyIds ?? fallback.liveStrategyIds),
    thirdPartyStrategyIds: normalizeStringList(source.thirdPartyStrategyIds ?? fallback.thirdPartyStrategyIds),
  }
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))).sort()
}

function assertValidPermissions(permissions: StrategyPermissionSet) {
  if (
    !permissions.allowBacktest &&
    !permissions.allowLive &&
    !permissions.allowThirdParty &&
    permissions.backtestStrategyIds.length === 0 &&
    permissions.liveStrategyIds.length === 0 &&
    permissions.thirdPartyStrategyIds.length === 0
  ) {
    throw new HttpError(400, '请至少授予一个策略或板块权限')
  }
}

function assertValidRegistration(payload: Record<string, unknown>) {
  if (String(payload.username ?? '').trim().length < 3) {
    throw new HttpError(400, '用户名至少 3 位')
  }
  if (String(payload.password ?? '').length < 6) {
    throw new HttpError(400, '密码至少 6 位')
  }
  if (String(payload.fullName ?? '').trim().length < 2) {
    throw new HttpError(400, '客户姓名至少 2 个字符')
  }
  if (String(payload.organization ?? '').trim().length < 2) {
    throw new HttpError(400, '机构信息不能为空')
  }
  const email = String(payload.email ?? '').trim()
  if (email.length < 3 || !email.includes('@')) {
    throw new HttpError(400, '邮箱格式不正确')
  }
  if (String(payload.contact ?? '').trim().length < 6) {
    throw new HttpError(400, '联系方式至少 6 位')
  }
}

function normalizeUser(value: unknown): AppUser | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  const username = String(source.username ?? '').trim()
  if (!username) {
    return null
  }
  const role: UserRole = source.role === 'admin' ? 'admin' : 'user'
  return {
    id: String(source.id ?? `usr_${crypto.randomUUID()}`),
    username,
    password: String(source.password ?? ''),
    fullName: String(source.fullName ?? username).trim() || username,
    organization: String(source.organization ?? '未填写').trim() || '未填写',
    email: String(source.email ?? '').trim(),
    contact: String(source.contact ?? '').trim(),
    role,
    token: String(source.token ?? `tk_${crypto.randomUUID()}`),
    registeredAt: String(source.registeredAt ?? new Date().toISOString().slice(0, 10)),
    permissions: role === 'admin' ? clone(FULL_ACCESS) : normalizePermissions(source.permissions, EMPTY_ACCESS),
  }
}

function normalizeRegistrationRequest(value: unknown): RegistrationRequest | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  const username = String(source.username ?? '').trim()
  const password = String(source.password ?? '')
  const fullName = String(source.fullName ?? '').trim()
  const organization = String(source.organization ?? '').trim()
  const email = String(source.email ?? '').trim()
  const contact = String(source.contact ?? '').trim()
  if (
    username.length < 3 ||
    password.length < 6 ||
    fullName.length < 2 ||
    organization.length < 2 ||
    email.length < 3 ||
    contact.length < 3
  ) {
    return null
  }
  return {
    id: String(source.id ?? `req_${crypto.randomUUID()}`),
    username,
    password,
    fullName,
    organization,
    email,
    contact,
    requestedAt: String(source.requestedAt ?? nowIso()),
  }
}

function normalizeAnalytics(value: unknown): AppState['analytics'] {
  const source = value && typeof value === 'object' ? (value as Partial<AppState['analytics']>) : {}
  const analytics: AppState['analytics'] = clone(DEFAULT_ANALYTICS)

  if (source.moduleVisits && typeof source.moduleVisits === 'object') {
    for (const [pathname, counter] of Object.entries(source.moduleVisits)) {
      if (!pathname || !counter || typeof counter !== 'object') {
        continue
      }
      analytics.moduleVisits[pathname] = {
        count: Math.max(0, Number((counter as { count?: unknown }).count) || 0),
        lastVisitedAt: String((counter as { lastVisitedAt?: unknown }).lastVisitedAt ?? '1970-01-01T00:00:00Z'),
      }
    }
  }

  if (source.strategyVisits && typeof source.strategyVisits === 'object') {
    for (const [key, counter] of Object.entries(source.strategyVisits)) {
      if (!key || !counter || typeof counter !== 'object') {
        continue
      }
      const item = counter as Record<string, unknown>
      const channel = item.channel
      const strategyId = String(item.strategyId ?? '').trim()
      if (!isStrategyChannel(channel) || !strategyId) {
        continue
      }
      analytics.strategyVisits[key] = {
        channel,
        strategyId,
        strategyName: String(item.strategyName ?? strategyId),
        count: Math.max(0, Number(item.count) || 0),
        lastVisitedAt: String(item.lastVisitedAt ?? '1970-01-01T00:00:00Z'),
      }
    }
  }

  if (Array.isArray(source.permissionOpens)) {
    analytics.permissionOpens = source.permissionOpens
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const sourceItem = item as Record<string, unknown>
        const action = sourceItem.action
        if (action !== 'approve' && action !== 'update') {
          return null
        }
        return {
          id: String(sourceItem.id ?? `permission_${crypto.randomUUID()}`),
          action,
          targetUserId: String(sourceItem.targetUserId ?? ''),
          targetUsername: String(sourceItem.targetUsername ?? ''),
          summary: String(sourceItem.summary ?? ''),
          timestamp: String(sourceItem.timestamp ?? nowIso()),
        }
      })
      .filter((item): item is AppState['analytics']['permissionOpens'][number] => item !== null)
      .slice(0, MAX_PERMISSION_LOGS)
  }

  return analytics
}

function buildDefaultState(): AppState {
  const seed = seedStrategiesJson as Partial<Record<StrategyChannel, Record<string, unknown>[]>>
  return {
    users: [
      {
        id: 'admin-local',
        username: 'admin',
        password: 'Admin@123456',
        fullName: '系统管理员',
        organization: '固定收益客需部',
        email: 'admin@strategy-lab.local',
        contact: '000-0000-0000',
        role: 'admin',
        token: 'admin-token-local',
        registeredAt: '2026-03-24',
        permissions: clone(FULL_ACCESS),
      },
      {
        id: 'user-demo-local',
        username: 'user_demo',
        password: 'User@123456',
        fullName: '测试用户',
        organization: '固定收益客需部',
        email: 'user-demo@strategy-lab.local',
        contact: '138-0000-0000',
        role: 'user',
        token: 'user-demo-token-local',
        registeredAt: '2026-03-24',
        permissions: clone(FULL_ACCESS),
      },
    ],
    registrationRequests: [],
    strategies: {
      backtest: Array.isArray(seed.backtest) ? clone(seed.backtest) : [],
      live: Array.isArray(seed.live) ? clone(seed.live) : [],
      thirdparty:
        Array.isArray(seed.thirdparty) && seed.thirdparty.length > 0
          ? clone(seed.thirdparty)
          : clone(DEFAULT_THIRDPARTY_STRATEGIES),
    },
    siteContent: clone(DEFAULT_SITE_CONTENT),
    analytics: clone(DEFAULT_ANALYTICS),
  }
}

function normalizeState(value: unknown): AppState {
  const source = value && typeof value === 'object' ? (value as Partial<AppState>) : {}
  const fallback = buildDefaultState()
  const users = Array.isArray(source.users)
    ? source.users.map((item) => normalizeUser(item)).filter((item): item is AppUser => item !== null)
    : []

  const existingAdmin = users.find((item) => item.username.toLowerCase() === 'admin')
  if (existingAdmin) {
    existingAdmin.role = 'admin'
    existingAdmin.permissions = clone(FULL_ACCESS)
    existingAdmin.password = existingAdmin.password || 'Admin@123456'
  } else {
    users.unshift(fallback.users[0])
  }
  if (!users.some((item) => item.username === 'user_demo')) {
    users.push(fallback.users[1])
  }

  const registrationRequests = Array.isArray(source.registrationRequests)
    ? source.registrationRequests
        .map((item) => normalizeRegistrationRequest(item))
        .filter((item): item is RegistrationRequest => item !== null)
    : []

  const sourceStrategies =
    source.strategies && typeof source.strategies === 'object' ? source.strategies : fallback.strategies
  const siteContent =
    source.siteContent && typeof source.siteContent === 'object'
      ? {
          heroImages: Array.isArray(source.siteContent.heroImages)
            ? source.siteContent.heroImages
                .map((item) => {
                  if (!item || typeof item !== 'object') {
                    return null
                  }
                  const image = item as Record<string, unknown>
                  const id = String(image.id ?? '').trim()
                  const sourceType = image.sourceType === 'custom' ? 'custom' : 'default'
                  const src = String(image.src ?? '').trim()
                  if (!id) {
                    return null
                  }
                  if (sourceType === 'custom' && !src.startsWith('data:image/')) {
                    return null
                  }
                  return { id, src, sourceType }
                })
                .filter((item): item is AppState['siteContent']['heroImages'][number] => item !== null)
            : [],
        }
      : clone(DEFAULT_SITE_CONTENT)

  if (siteContent.heroImages.length === 0) {
    siteContent.heroImages = clone(DEFAULT_SITE_CONTENT.heroImages)
  }

  return {
    users,
    registrationRequests,
    strategies: {
      backtest: Array.isArray(sourceStrategies.backtest) ? clone(sourceStrategies.backtest) : [],
      live: Array.isArray(sourceStrategies.live) ? clone(sourceStrategies.live) : [],
      thirdparty:
        Array.isArray(sourceStrategies.thirdparty) && sourceStrategies.thirdparty.length > 0
          ? clone(sourceStrategies.thirdparty)
          : clone(fallback.strategies.thirdparty),
    },
    siteContent,
    analytics: normalizeAnalytics(source.analytics),
  }
}

async function readState(env: Env): Promise<AppState> {
  if (!env.STRATEGY_LAB_STATE) {
    return buildDefaultState()
  }
  const raw = await env.STRATEGY_LAB_STATE.get(STATE_KEY)
  if (!raw) {
    const initial = buildDefaultState()
    await env.STRATEGY_LAB_STATE.put(STATE_KEY, JSON.stringify(initial))
    return initial
  }
  try {
    return normalizeState(JSON.parse(raw) as unknown)
  } catch {
    return buildDefaultState()
  }
}

async function writeState(env: Env, state: AppState) {
  if (!env.STRATEGY_LAB_STATE) {
    throw new HttpError(503, 'Cloudflare KV binding `STRATEGY_LAB_STATE` 尚未配置')
  }
  const normalized = normalizeState(state)
  await env.STRATEGY_LAB_STATE.put(STATE_KEY, JSON.stringify(normalized))
  return normalized
}

async function updateState(env: Env, updater: (state: AppState) => AppState) {
  const current = await readState(env)
  return writeState(env, updater(clone(current)))
}

function isStrategyChannel(value: unknown): value is StrategyChannel {
  return value === 'backtest' || value === 'live' || value === 'thirdparty'
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function safeNonNegativeInt(value: unknown, fallback = 0) {
  return Math.max(0, Math.round(safeNumber(value, fallback)))
}

function normalizeBacktestLikeMetrics(metrics: Record<string, unknown>) {
  const annualReturn = safeNumber(metrics.annualReturn, safeNumber(metrics.totalReturn, 0))
  const totalReturn = safeNumber(metrics.totalReturn, annualReturn)
  const tradeCount = safeNonNegativeInt(metrics.tradeCount, safeNonNegativeInt(metrics.positionCount, 0))
  const winRate = safeNumber(metrics.winRate, safeNumber(metrics.monthlyWinRate, 0))
  return {
    annualReturn,
    sharpe: safeNumber(metrics.sharpe, 0),
    maxDrawdown: safeNumber(metrics.maxDrawdown, 0),
    winRate,
    tradeCount,
    volatility: safeNumber(metrics.volatility, 0),
    runningDays: Math.max(1, safeNonNegativeInt(metrics.runningDays, 1)),
    totalReturn,
    startDate: typeof metrics.startDate === 'string' ? metrics.startDate : undefined,
  }
}

function normalizeLiveMetrics(metrics: Record<string, unknown>) {
  const annualReturn = safeNumber(metrics.annualReturn, safeNumber(metrics.totalReturn, 0))
  const totalReturn = safeNumber(metrics.totalReturn, annualReturn)
  const tradeCount = safeNonNegativeInt(metrics.tradeCount, safeNonNegativeInt(metrics.positionCount, 0))
  const positionCount = safeNonNegativeInt(metrics.positionCount, tradeCount)
  const winRate = safeNumber(metrics.winRate, safeNumber(metrics.monthlyWinRate, 0))
  return {
    annualReturn,
    sharpe: safeNumber(metrics.sharpe, 0),
    winRate,
    tradeCount,
    totalReturn,
    alpha: safeNumber(metrics.alpha, 0),
    maxDrawdown: safeNumber(metrics.maxDrawdown, 0),
    volatility: safeNumber(metrics.volatility, 0),
    runningDays: Math.max(1, safeNonNegativeInt(metrics.runningDays, 1)),
    startDate: typeof metrics.startDate === 'string' ? metrics.startDate : undefined,
    positionCount,
    monthlyWinRate: safeNumber(metrics.monthlyWinRate, winRate),
  }
}

function convertStrategyChannel(strategy: Record<string, unknown>, toChannel: StrategyChannel) {
  const metrics = strategy.metrics && typeof strategy.metrics === 'object' ? (strategy.metrics as Record<string, unknown>) : {}
  return {
    ...strategy,
    channel: toChannel,
    metrics: toChannel === 'live' ? normalizeLiveMetrics(metrics) : normalizeBacktestLikeMetrics(metrics),
  }
}

async function handleHealth(request: Request, env: Env) {
  return jsonResponse(request, env, {
    status: 'ok',
    runtime: 'cloudflare-pages-functions',
    sharedStoreMode: env.STRATEGY_LAB_STATE ? 'cloudflare-kv' : 'unconfigured',
    sharedStoreStrict: true,
  })
}

async function handleMarketHome(request: Request, env: Env) {
  return jsonResponse(request, env, homeMarketSnapshotJson)
}

async function handleBootstrap(request: Request, env: Env) {
  const state = await readState(env)
  return jsonResponse(request, env, {
    strategies: state.strategies,
    pendingRequests: state.registrationRequests.map(publicRegistrationRequest),
    managedUsers: state.users.filter((item) => item.role === 'user').map(publicUser),
    siteContent: state.siteContent,
  })
}

async function handleAuthLogin(request: Request, env: Env) {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  const username = String(payload.username ?? '').trim().toLowerCase()
  const password = String(payload.password ?? '')
  const state = await readState(env)
  const user = state.users.find((item) => item.username.toLowerCase() === username)
  if (!user || user.password !== password) {
    throw new HttpError(400, '用户名或密码错误')
  }
  return jsonResponse(request, env, publicUser(user))
}

async function handleAuthRegister(request: Request, env: Env) {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  assertValidRegistration(payload)

  const username = String(payload.username).trim()
  const created = {
    id: `req_${username.toLowerCase()}_${Date.now()}`,
    username,
    password: String(payload.password),
    fullName: String(payload.fullName).trim(),
    organization: String(payload.organization).trim(),
    email: String(payload.email).trim(),
    contact: String(payload.contact).trim(),
    requestedAt: nowIso(),
  } satisfies RegistrationRequest

  await updateState(env, (state) => {
    const usernameLower = username.toLowerCase()
    if (state.users.some((item) => item.username.toLowerCase() === usernameLower)) {
      throw new HttpError(400, '用户名已存在')
    }
    if (state.registrationRequests.some((item) => item.username.toLowerCase() === usernameLower)) {
      throw new HttpError(400, '该用户名已有待审核申请')
    }
    state.registrationRequests.unshift(created)
    return state
  })

  return jsonResponse(request, env, publicRegistrationRequest(created))
}

async function handleAdminRequests(request: Request, env: Env) {
  const state = await readState(env)
  return jsonResponse(request, env, state.registrationRequests.map(publicRegistrationRequest))
}

async function handleAdminUsers(request: Request, env: Env) {
  const state = await readState(env)
  return jsonResponse(request, env, state.users.filter((item) => item.role === 'user').map(publicUser))
}

async function handleApproveRequest(request: Request, env: Env, segments: string[]) {
  const requestId = segments[2]
  if (!requestId) {
    throw new HttpError(404, '注册申请不存在或已处理')
  }
  const payload = await readJsonBody<Record<string, unknown>>(request)
  const permissions = normalizePermissions(payload.permissions, EMPTY_ACCESS)
  assertValidPermissions(permissions)
  let createdUser: AppUser | null = null

  await updateState(env, (state) => {
    const target = state.registrationRequests.find((item) => item.id === requestId)
    if (!target) {
      throw new HttpError(404, '注册申请不存在或已处理')
    }
    if (state.users.some((item) => item.username.toLowerCase() === target.username.toLowerCase())) {
      throw new HttpError(400, '用户名已存在，无法重复创建')
    }
    const user: AppUser = {
      id: `usr_${state.users.length + 1}_${Date.now()}`,
      username: target.username,
      password: target.password,
      fullName: target.fullName,
      organization: target.organization,
      email: target.email,
      contact: target.contact,
      role: 'user',
      token: `user-token-${target.username}`,
      registeredAt: new Date().toISOString().slice(0, 10),
      permissions,
    }
    state.users.push(user)
    state.registrationRequests = state.registrationRequests.filter((item) => item.id !== requestId)
    createdUser = user
    return state
  })

  return jsonResponse(request, env, publicUser(createdUser as AppUser))
}

async function handleRejectRequest(request: Request, env: Env, segments: string[]) {
  const requestId = segments[2]
  if (!requestId) {
    throw new HttpError(404, '注册申请不存在或已处理')
  }
  await updateState(env, (state) => {
    if (!state.registrationRequests.some((item) => item.id === requestId)) {
      throw new HttpError(404, '注册申请不存在或已处理')
    }
    state.registrationRequests = state.registrationRequests.filter((item) => item.id !== requestId)
    return state
  })
  return jsonResponse(request, env, { status: 'ok' })
}

async function handleUpdateUserPermissions(request: Request, env: Env, segments: string[]) {
  const userId = segments[2]
  if (!userId) {
    throw new HttpError(404, '用户不存在')
  }
  const payload = await readJsonBody<Record<string, unknown>>(request)
  const permissions = normalizePermissions(payload.permissions, EMPTY_ACCESS)
  assertValidPermissions(permissions)
  let updatedUser: AppUser | null = null

  await updateState(env, (state) => {
    const user = state.users.find((item) => item.id === userId)
    if (!user) {
      throw new HttpError(404, '用户不存在')
    }
    if (user.role === 'admin') {
      throw new HttpError(400, '管理员权限不可在此修改')
    }
    user.permissions = permissions
    updatedUser = user
    return state
  })

  return jsonResponse(request, env, publicUser(updatedUser as AppUser))
}

async function handleStrategies(request: Request, env: Env) {
  const state = await readState(env)
  return jsonResponse(request, env, state.strategies)
}

async function handleSaveStrategy(request: Request, env: Env) {
  const payload = await readJsonBody<{ strategy?: Record<string, unknown> }>(request)
  const strategy = payload.strategy
  const channel = strategy?.channel
  const strategyId = typeof strategy?.id === 'string' ? strategy.id.trim() : ''
  if (!strategy || !isStrategyChannel(channel) || !strategyId) {
    throw new HttpError(400, '策略数据不合法')
  }
  const updated = await updateState(env, (state) => {
    const records = [...state.strategies[channel]]
    const index = records.findIndex((item) => item.id === strategyId)
    if (index >= 0) {
      records[index] = strategy
    } else {
      records.unshift(strategy)
    }
    state.strategies[channel] = records
    return state
  })
  return jsonResponse(request, env, updated.strategies)
}

async function handleMoveStrategy(request: Request, env: Env) {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  const fromChannel = payload.fromChannel
  const toChannel = payload.toChannel
  const strategyId = String(payload.strategyId ?? '').trim()
  if (!isStrategyChannel(fromChannel) || !isStrategyChannel(toChannel) || !strategyId) {
    throw new HttpError(400, '策略数据不合法')
  }
  if (fromChannel === toChannel) {
    throw new HttpError(400, '源板块与目标板块不能相同')
  }
  const updated = await updateState(env, (state) => {
    const sourceRecords = [...state.strategies[fromChannel]]
    const sourceIndex = sourceRecords.findIndex((item) => item.id === strategyId)
    if (sourceIndex < 0) {
      throw new HttpError(404, '策略不存在或已被移动')
    }
    const [sourceStrategy] = sourceRecords.splice(sourceIndex, 1)
    const movedStrategy = convertStrategyChannel(sourceStrategy, toChannel)
    const targetRecords = [...state.strategies[toChannel]]
    const targetIndex = targetRecords.findIndex((item) => item.id === strategyId)
    if (targetIndex >= 0) {
      targetRecords[targetIndex] = movedStrategy
    } else {
      targetRecords.unshift(movedStrategy)
    }
    state.strategies[fromChannel] = sourceRecords
    state.strategies[toChannel] = targetRecords
    return state
  })
  return jsonResponse(request, env, updated.strategies)
}

async function handleDeleteStrategy(request: Request, env: Env, segments: string[]) {
  const channel = segments[2]
  const strategyId = decodeURIComponent(segments[3] ?? '')
  if (!isStrategyChannel(channel)) {
    throw new HttpError(400, '策略板块不存在')
  }
  const updated = await updateState(env, (state) => {
    state.strategies[channel] = state.strategies[channel].filter((item) => item.id !== strategyId)
    return state
  })
  return jsonResponse(request, env, updated.strategies)
}

async function handleReplaceStrategies(request: Request, env: Env, segments: string[]) {
  const channel = segments[2]
  if (!isStrategyChannel(channel)) {
    throw new HttpError(400, '策略板块不存在')
  }
  const payload = await readJsonBody<{ strategies?: Record<string, unknown>[] }>(request)
  if (!Array.isArray(payload.strategies)) {
    throw new HttpError(400, '策略数据不合法')
  }
  const updated = await updateState(env, (state) => {
    state.strategies[channel] = payload.strategies as Record<string, unknown>[]
    return state
  })
  return jsonResponse(request, env, updated.strategies)
}

async function handleGetSiteContent(request: Request, env: Env) {
  const state = await readState(env)
  return jsonResponse(request, env, state.siteContent)
}

async function handleSaveSiteContent(request: Request, env: Env) {
  const payload = await readJsonBody<AppState['siteContent']>(request)
  const updated = await updateState(env, (state) => {
    state.siteContent = normalizeState({ ...state, siteContent: payload }).siteContent
    return state
  })
  return jsonResponse(request, env, updated.siteContent)
}

async function handleGetAnalytics(request: Request, env: Env) {
  const state = await readState(env)
  return jsonResponse(request, env, state.analytics)
}

async function handleTrackModuleVisit(request: Request, env: Env) {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  const pathname = String(payload.pathname ?? '').trim()
  if (!pathname || payload.actorRole !== 'user') {
    return jsonResponse(request, env, { status: 'ignored' })
  }
  await updateState(env, (state) => {
    const current = state.analytics.moduleVisits[pathname]
    state.analytics.moduleVisits[pathname] = {
      count: (current?.count ?? 0) + 1,
      lastVisitedAt: nowIso(),
    }
    return state
  })
  return jsonResponse(request, env, { status: 'ok' })
}

async function handleTrackStrategyVisit(request: Request, env: Env) {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  const channel = payload.channel
  const strategyId = String(payload.strategyId ?? '').trim()
  if (!isStrategyChannel(channel) || !strategyId || payload.actorRole !== 'user') {
    return jsonResponse(request, env, { status: 'ignored' })
  }
  const strategyName = String(payload.strategyName ?? strategyId).trim() || strategyId
  const key = `${channel}:${strategyId}`
  await updateState(env, (state) => {
    const current = state.analytics.strategyVisits[key]
    state.analytics.strategyVisits[key] = {
      channel,
      strategyId,
      strategyName,
      count: (current?.count ?? 0) + 1,
      lastVisitedAt: nowIso(),
    }
    return state
  })
  return jsonResponse(request, env, { status: 'ok' })
}

async function handleTrackPermissionOpen(request: Request, env: Env) {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  const action = payload.action
  if (action !== 'approve' && action !== 'update') {
    throw new HttpError(400, '权限操作类型不合法')
  }
  await updateState(env, (state) => {
    state.analytics.permissionOpens.unshift({
      id: `permission_${Date.now()}_${String(payload.targetUserId ?? '')}_${action}`,
      action,
      targetUserId: String(payload.targetUserId ?? ''),
      targetUsername: String(payload.targetUsername ?? ''),
      summary: String(payload.summary ?? ''),
      timestamp: nowIso(),
    })
    state.analytics.permissionOpens = state.analytics.permissionOpens.slice(0, MAX_PERMISSION_LOGS)
    return state
  })
  return jsonResponse(request, env, { status: 'ok' })
}

function splitPath(request: Request) {
  const pathname = new URL(request.url).pathname
  return pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .map((item) => decodeURIComponent(item))
    .filter(Boolean)
}

const routeHandlers: Array<{
  method: string
  match: (segments: string[]) => boolean
  handler: RouteHandler
}> = [
  { method: 'GET', match: (s) => s[0] === 'health', handler: handleHealth },
  { method: 'GET', match: (s) => s[0] === 'market' && s[1] === 'home', handler: handleMarketHome },
  { method: 'GET', match: (s) => s[0] === 'bootstrap', handler: handleBootstrap },
  { method: 'POST', match: (s) => s[0] === 'auth' && s[1] === 'login', handler: handleAuthLogin },
  { method: 'POST', match: (s) => s[0] === 'auth' && s[1] === 'register', handler: handleAuthRegister },
  { method: 'GET', match: (s) => s[0] === 'admin' && s[1] === 'requests' && s.length === 2, handler: handleAdminRequests },
  { method: 'GET', match: (s) => s[0] === 'admin' && s[1] === 'users' && s.length === 2, handler: handleAdminUsers },
  {
    method: 'POST',
    match: (s) => s[0] === 'admin' && s[1] === 'requests' && s[3] === 'approve',
    handler: handleApproveRequest,
  },
  {
    method: 'POST',
    match: (s) => s[0] === 'admin' && s[1] === 'requests' && s[3] === 'reject',
    handler: handleRejectRequest,
  },
  {
    method: 'PUT',
    match: (s) => s[0] === 'admin' && s[1] === 'users' && s[3] === 'permissions',
    handler: handleUpdateUserPermissions,
  },
  { method: 'GET', match: (s) => s[0] === 'strategies', handler: handleStrategies },
  { method: 'POST', match: (s) => s[0] === 'admin' && s[1] === 'strategies' && s.length === 2, handler: handleSaveStrategy },
  { method: 'POST', match: (s) => s[0] === 'admin' && s[1] === 'strategies' && s[2] === 'move', handler: handleMoveStrategy },
  { method: 'DELETE', match: (s) => s[0] === 'admin' && s[1] === 'strategies' && s.length >= 4, handler: handleDeleteStrategy },
  { method: 'PUT', match: (s) => s[0] === 'admin' && s[1] === 'strategies' && s.length === 3, handler: handleReplaceStrategies },
  { method: 'GET', match: (s) => s[0] === 'site-content' && s[1] === 'home', handler: handleGetSiteContent },
  { method: 'PUT', match: (s) => s[0] === 'admin' && s[1] === 'site-content' && s[2] === 'home', handler: handleSaveSiteContent },
  { method: 'GET', match: (s) => s[0] === 'admin' && s[1] === 'analytics', handler: handleGetAnalytics },
  { method: 'POST', match: (s) => s[0] === 'analytics' && s[1] === 'module-visit', handler: handleTrackModuleVisit },
  { method: 'POST', match: (s) => s[0] === 'analytics' && s[1] === 'strategy-visit', handler: handleTrackStrategyVisit },
  { method: 'POST', match: (s) => s[0] === 'analytics' && s[1] === 'permission-open', handler: handleTrackPermissionOpen },
  {
    method: 'POST',
    match: (s) => s[0] === 'admin' && s[1] === 'performance-import' && s[2] === 'bp',
    handler: handleBpPerformanceImport,
  },
]

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) })
  }

  try {
    const segments = splitPath(request)
    const route = routeHandlers.find((candidate) => candidate.method === request.method && candidate.match(segments))
    if (!route) {
      throw new HttpError(404, 'API 路由不存在')
    }
    return await route.handler(request, env, segments)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, env, { detail: error.message }, error.status)
    }
    return jsonResponse(
      request,
      env,
      { detail: error instanceof Error ? error.message : 'Cloudflare API 执行失败' },
      500,
    )
  }
}

interface TableRow {
  [key: string]: unknown
}

interface SeriesPoint {
  date: string
  timestamp: number
  value: number
}

interface BpPathRow {
  date: string
  signal: number
  mapped_signal: number
  position: number
  yield: number
  delta_yield: number
  delta_yield_bp: number
  asset_return: number
  turnover: number
  trade_fee_bp: number
  strategy_daily_bp_exact: number
  strategy_daily_bp_after_fee: number
  strategy_cum_bp_after_fee: number
  strategy_nav_exact: number
  stop_loss_triggered: number
  strategy_drawdown_bp: number
  stop_loss_active: number
  reentry_confirmed: number
}

const BP_DIAGNOSTIC_COLUMNS = [
  'date',
  'signal',
  'mapped_signal',
  'position',
  'yield',
  'delta_yield',
  'delta_yield_bp',
  'asset_return',
  'turnover',
  'trade_fee_bp',
  'strategy_daily_bp_exact',
  'strategy_daily_bp_after_fee',
  'strategy_cum_bp_after_fee',
  'strategy_nav_exact',
  'stop_loss_triggered',
  'strategy_drawdown_bp',
  'stop_loss_active',
  'reentry_confirmed',
] as const

const FIELD_ALIASES: Record<string, string[]> = {
  signalDateCol: ['date', '日期', '交易日', '时间', 'datetime'],
  signalCol: ['signal', '最终信号', '交易信号', '信号'],
  yieldDateCol: ['date', '日期', '交易日', '时间', 'datetime'],
  yieldCol: ['yield', '收益率', '到期收益率', '收益率(%)', '收益率（%）'],
  externalStopCol: ['bp_stop_loss_triggered', 'stop_loss_triggered', '外部止损', '止损触发'],
}

async function handleBpPerformanceImport(request: Request, env: Env) {
  const formData = await request.formData()
  const signalFile = formData.get('signalFile')
  const yieldFile = formData.get('yieldFile')
  if (!(signalFile instanceof File) || !(yieldFile instanceof File)) {
    throw new HttpError(400, '请上传信号文件和收益率文件')
  }

  const signals = await readTableRows(signalFile, 'signals')
  const yields = await readTableRows(yieldFile, 'yields')
  const signalDateCol = resolveColumn(signals, getTextField(formData, 'signalDateCol'), true, 'signals', 'signalDateCol')
  const signalCol = resolveColumn(signals, getTextField(formData, 'signalCol') || 'signal', false, 'signals', 'signalCol')
  const yieldDateCol = resolveColumn(yields, getTextField(formData, 'yieldDateCol') || 'date', false, 'yields', 'yieldDateCol')
  const yieldCol = resolveColumn(yields, getTextField(formData, 'yieldCol') || 'yield', false, 'yields', 'yieldCol')
  const externalStopCol = getTextField(formData, 'externalStopCol')
    ? resolveColumn(signals, getTextField(formData, 'externalStopCol'), false, 'signals', 'externalStopCol')
    : null

  const signalSeries = buildNumericSeries(signals, signalDateCol, signalCol, 'signals')
  const yieldSeries = buildNumericSeries(yields, yieldDateCol, yieldCol, 'yields')
  const externalStopSeries = externalStopCol
    ? buildNumericSeries(signals, signalDateCol, externalStopCol, 'signals')
    : null

  const signalName = getTextField(formData, 'signalName') || 'signal'
  const feeBpsPerSide = safeNumber(getTextField(formData, 'feeBpsPerSide'), 0)
  const stopLossText = getTextField(formData, 'stopLossBp')
  const stopLossBp = stopLossText ? safeNumber(stopLossText, Number.NaN) : null
  const executionDelayBars = safeNonNegativeInt(getTextField(formData, 'executionDelayBars'), 1)
  if (stopLossBp !== null && !Number.isFinite(stopLossBp)) {
    throw new HttpError(400, 'stopLossBp 必须是有效数字')
  }

  const result = computeBpPerformanceFromSignalAndYield({
    signal: signalSeries,
    yieldSeries,
    signalName,
    feeBpsPerSide,
    stopLossBp,
    executionDelayBars,
    externalStopLossTriggered: externalStopSeries,
    signalFilename: signalFile.name,
    yieldFilename: yieldFile.name,
  })

  return jsonResponse(request, env, result)
}

function getTextField(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

async function readTableRows(file: File, label: string): Promise<TableRow[]> {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.csv')) {
    return parseCsvRows(await file.text())
  }
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    try {
      const { read, utils } = await import('xlsx')
      const workbook = read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName || !workbook.Sheets[sheetName]) {
        throw new Error('empty workbook')
      }
      return utils.sheet_to_json<TableRow>(workbook.Sheets[sheetName], { defval: '', raw: true })
    } catch {
      throw new HttpError(400, `${label} xlsx file could not be parsed.`)
    }
  }
  throw new HttpError(400, `${label} file only supports .csv, .xlsx.`)
}

function parseCsvRows(text: string): TableRow[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim())
  if (lines.length < 2) {
    return []
  }
  const delimiter = detectDelimiter(lines[0])
  const headers = parseDelimitedLine(lines[0], delimiter)
  return lines.slice(1).map((line) => {
    const cells = parseDelimitedLine(line, delimiter)
    const row: TableRow = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ''
    })
    return row
  })
}

function detectDelimiter(headerLine: string) {
  return [',', ';', '\t']
    .map((delimiter) => ({ delimiter, score: headerLine.split(delimiter).length }))
    .sort((left, right) => right.score - left.score)[0].delimiter
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function normalizeHeaderName(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-/.]+/g, '')
}

function resolveColumn(
  rows: TableRow[],
  requested: string,
  fallbackFirstColumn: boolean,
  fileLabel: string,
  fieldLabel: string,
) {
  const columns = Object.keys(rows[0] ?? {})
  if (columns.length === 0) {
    throw new HttpError(400, `${fileLabel} file is missing a header row.`)
  }
  if (fallbackFirstColumn && !requested) {
    return columns[0]
  }
  const target = requested.trim()
  if (!target) {
    throw new HttpError(400, `${fileLabel} is missing required config: ${fieldLabel}.`)
  }
  if (columns.includes(target)) {
    return target
  }
  const normalizedColumns = new Map(columns.map((column) => [normalizeHeaderName(column), column] as const))
  const direct = normalizedColumns.get(normalizeHeaderName(target))
  if (direct) {
    return direct
  }
  for (const alias of FIELD_ALIASES[fieldLabel] ?? []) {
    const matched = normalizedColumns.get(normalizeHeaderName(alias))
    if (matched) {
      return matched
    }
  }
  throw new HttpError(400, `${fileLabel} file is missing column \`${target}\`. Available columns: ${columns.join(', ')}`)
}

function buildNumericSeries(rows: TableRow[], dateColumn: string, valueColumn: string, fileLabel: string): SeriesPoint[] {
  if (rows.length === 0) {
    throw new HttpError(400, `${fileLabel} file has no data rows.`)
  }
  const seen = new Set<string>()
  const points = rows
    .map((row) => {
      const dateInfo = parseDateCell(row[dateColumn])
      const value = parseNumericCell(row[valueColumn])
      if (!dateInfo || value === null) {
        return null
      }
      if (seen.has(dateInfo.date)) {
        throw new HttpError(400, `${fileLabel} file has duplicate dates: ${dateInfo.date}`)
      }
      seen.add(dateInfo.date)
      return { ...dateInfo, value }
    })
    .filter((item): item is SeriesPoint => item !== null)
    .sort((left, right) => left.timestamp - right.timestamp)
  if (points.length === 0) {
    throw new HttpError(400, `${fileLabel} file has no valid numeric rows.`)
  }
  return points
}

function parseDateCell(value: unknown): { date: string; timestamp: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { date: value.toISOString().slice(0, 10), timestamp: value.getTime() }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 20_000 && value < 80_000 ? (value - 25569) * 86400 * 1000 : value
    const date = new Date(timestamp)
    if (!Number.isNaN(date.getTime())) {
      return { date: date.toISOString().slice(0, 10), timestamp: date.getTime() }
    }
  }
  const text = String(value ?? '').trim().replace(/\//g, '-')
  if (!text) {
    return null
  }
  const date = new Date(text)
  if (!Number.isNaN(date.getTime())) {
    return { date: date.toISOString().slice(0, 10), timestamp: date.getTime() }
  }
  return null
}

function parseNumericCell(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const text = String(value ?? '').trim()
  if (!text) {
    return null
  }
  const negative = text.startsWith('(') && text.endsWith(')')
  const parsed = Number(text.replace(/[,%\s，()]/g, ''))
  if (!Number.isFinite(parsed)) {
    return null
  }
  const signed = negative ? -parsed : parsed
  return text.includes('%') ? signed / 100 : signed
}

function computeBpPerformanceFromSignalAndYield(input: {
  signal: SeriesPoint[]
  yieldSeries: SeriesPoint[]
  signalName: string
  feeBpsPerSide: number
  stopLossBp: number | null
  executionDelayBars: number
  externalStopLossTriggered: SeriesPoint[] | null
  signalFilename: string
  yieldFilename: string
}) {
  const yieldByDate = new Map(input.yieldSeries.map((point) => [point.date, point] as const))
  const externalStopByDate = new Map((input.externalStopLossTriggered ?? []).map((point) => [point.date, point.value] as const))
  const aligned = input.signal
    .filter((point) => yieldByDate.has(point.date))
    .map((signalPoint) => ({ signalPoint, yieldPoint: yieldByDate.get(signalPoint.date) as SeriesPoint }))
    .sort((left, right) => left.signalPoint.timestamp - right.signalPoint.timestamp)
  if (aligned.length === 0) {
    throw new HttpError(400, 'signal and yield_series have no overlapping dates')
  }

  const invalidSignal = aligned.find((item) => item.signalPoint.value !== -1 && item.signalPoint.value !== 1)
  if (invalidSignal) {
    throw new HttpError(400, `signal must contain only -1 or 1. Example date: ${invalidSignal.signalPoint.date}`)
  }
  const invalidExternalStop = aligned.find((item) => {
    if (!externalStopByDate.has(item.signalPoint.date)) {
      return false
    }
    const value = externalStopByDate.get(item.signalPoint.date)
    return value !== 0 && value !== 1
  })
  if (invalidExternalStop) {
    throw new HttpError(400, `external_stop_loss_triggered must contain only 0 or 1. Example date: ${invalidExternalStop.signalPoint.date}`)
  }

  const rows = buildBpPathRows(aligned, input.feeBpsPerSide, input.stopLossBp, input.executionDelayBars, externalStopByDate)
  const dailyBp = rows.map((row) => row.strategy_daily_bp_after_fee)
  const nav = rows.map((row) => row.strategy_nav_exact)
  const returns = nav.map((value, index) => {
    if (index === 0) {
      return 0
    }
    const previous = nav[index - 1]
    return Math.abs(previous) > 1e-12 ? value / previous - 1 : 0
  })
  const cumulativeBp = rows.map((row) => row.strategy_cum_bp_after_fee)
  const peakNav: number[] = []
  nav.forEach((value, index) => {
    peakNav[index] = Math.max(index === 0 ? value : peakNav[index - 1], value)
  })
  const drawdownRatio = nav.map((value, index) => value / peakNav[index] - 1)
  const annualReturn = Math.pow(1 + mean(returns), 252) - 1
  const annualVol = std(returns) * Math.sqrt(252)
  const sharpe = annualVol > 0 ? annualReturn / annualVol : 0
  const monthlyReturns = buildMonthlyReturns(rows.map((row) => row.date), returns)
  const winRate = calculateWinRate(dailyBp)
  const monthlyWinRate = calculateMonthlyWinRate(monthlyReturns)
  const tradeCount = rows.reduce((sum, row) => sum + row.turnover, 0)
  const positionCount = Math.max(...rows.map((row) => Math.abs(row.position)), 0)
  const runningDays = Math.max(
    1,
    Math.floor((new Date(rows[rows.length - 1].date).getTime() - new Date(rows[0].date).getTime()) / 86400000) + 1,
  )

  return {
    equityCurve: rows.map((row, index) => ({ date: row.date, value: roundTo(nav[index]) })),
    drawdownCurve: rows.map((row, index) => ({ date: row.date, value: roundTo(drawdownRatio[index]) })),
    monthlyReturns,
    metrics: {
      annualReturn: roundTo(annualReturn),
      sharpe: roundTo(sharpe),
      maxDrawdown: roundTo(Math.min(...drawdownRatio)),
      winRate: winRate === null ? null : roundTo(winRate),
      tradeCount: Math.max(0, Math.round(tradeCount)),
      volatility: roundTo(annualVol),
      totalReturn: roundTo(cumulativeBp[cumulativeBp.length - 1] / 10000),
      startDate: rows[0].date,
      alpha: 0,
      runningDays,
      positionCount: Math.max(0, Math.round(positionCount)),
      monthlyWinRate: monthlyWinRate === null ? null : roundTo(monthlyWinRate),
      performanceMode: 'bp',
      cumulativeReturnBp: roundTo(cumulativeBp[cumulativeBp.length - 1]),
      maxDrawdownBp: roundTo(Math.min(...drawdownRatio) * 10000),
    },
    observations: rows.length,
    sourceType: 'bp',
    bpExports: [
      {
        filename: 'bp_metrics_summary.csv',
        label: '下载汇总结果',
        content: toCsv([
          {
            signal_name: input.signalName,
            signals_path: input.signalFilename,
            yields_path: input.yieldFilename,
            execution_delay_bars: input.executionDelayBars,
            fee_bps_per_side: input.feeBpsPerSide,
            stop_loss_bp: input.stopLossBp ?? '',
            cumulative_return_bp: cumulativeBp[cumulativeBp.length - 1],
            annual_return_bp: annualReturn * 10000,
            annual_vol_bp: annualVol * 10000,
            sharpe,
            max_drawdown_ratio: Math.min(...drawdownRatio),
            max_drawdown_bp: Math.min(...drawdownRatio) * 10000,
          },
        ]),
      },
      {
        filename: 'bp_metrics_daily.csv',
        label: '下载日度结果',
        content: toCsv(
          rows.map((row, index) => ({
            date: row.date,
            daily_bp: dailyBp[index],
            nav: nav[index],
            returns: returns[index],
            cumulative_bp: cumulativeBp[index],
            drawdown_ratio: drawdownRatio[index],
            drawdown_bp: row.strategy_drawdown_bp,
          })),
        ),
      },
      {
        filename: 'bp_metrics_diagnostics.csv',
        label: '下载诊断明细',
        content: toCsv(rows, BP_DIAGNOSTIC_COLUMNS as unknown as string[]),
      },
    ],
  }
}

function buildBpPathRows(
  aligned: Array<{ signalPoint: SeriesPoint; yieldPoint: SeriesPoint }>,
  feeBpsPerSide: number,
  stopLossBp: number | null,
  executionDelayBars: number,
  externalStopByDate: Map<string, number>,
) {
  if (stopLossBp !== null && stopLossBp <= 0) {
    throw new HttpError(400, 'signal_stop_loss_bp must be positive when provided')
  }

  let previousExecutionPosition = 0
  let pendingSignals = Array.from({ length: executionDelayBars }, () => 0)
  let cumulativeBp = 0
  let peakCumulativeBp = 0
  let stopLocked = false
  let flatSeenSinceStop = false
  let previousYield = aligned[0].yieldPoint.value
  const rows: BpPathRow[] = []

  for (const item of aligned) {
    const date = item.signalPoint.date
    const desiredSignal = item.signalPoint.value === -1 ? 0 : 1
    const deltaYield = item.yieldPoint.value - previousYield
    previousYield = item.yieldPoint.value
    const deltaYieldBp = deltaYield * 100
    const externalStopToday = externalStopByDate.get(date) === 1
    let reentryOnBar = 0
    let stopExecutedToday = false
    let scheduledSignal = desiredSignal

    if (externalStopByDate.size > 0) {
      scheduledSignal = externalStopToday ? 0 : desiredSignal
    } else if (stopLocked) {
      if (flatSeenSinceStop && desiredSignal > 0) {
        scheduledSignal = desiredSignal
        stopLocked = false
        flatSeenSinceStop = false
        reentryOnBar = 1
      } else {
        scheduledSignal = 0
        flatSeenSinceStop = flatSeenSinceStop || desiredSignal <= 0
      }
    }

    let currentExecutionPosition = executionDelayBars === 0 ? scheduledSignal : pendingSignals.shift() ?? 0
    if (executionDelayBars > 0) {
      pendingSignals.push(scheduledSignal)
    }
    const livePosition = previousExecutionPosition
    const turnover = Math.abs(currentExecutionPosition - previousExecutionPosition)
    const tradeFeeBp = turnover * feeBpsPerSide
    const strategyDailyBpExact = livePosition * -deltaYieldBp
    let strategyDailyBpAfterFee = strategyDailyBpExact - tradeFeeBp
    let stopLossTriggered = 0

    if (stopLossBp !== null) {
      if (externalStopToday) {
        strategyDailyBpAfterFee = -stopLossBp
        stopLossTriggered = 1
        stopExecutedToday = true
        currentExecutionPosition = 0
      } else if (strategyDailyBpAfterFee < -stopLossBp) {
        strategyDailyBpAfterFee = -stopLossBp
        stopLossTriggered = 1
        stopLocked = true
        flatSeenSinceStop = false
        stopExecutedToday = true
        currentExecutionPosition = 0
      }
    }

    cumulativeBp += strategyDailyBpAfterFee
    peakCumulativeBp = Math.max(peakCumulativeBp, cumulativeBp)
    const strategyDrawdownBp = Math.max(0, peakCumulativeBp - cumulativeBp)

    if (stopExecutedToday && executionDelayBars > 0) {
      pendingSignals = Array.from({ length: executionDelayBars }, () => 0)
    }

    rows.push({
      date,
      signal: item.signalPoint.value,
      mapped_signal: stopExecutedToday ? 0 : scheduledSignal,
      position: livePosition,
      yield: item.yieldPoint.value,
      delta_yield: deltaYield,
      delta_yield_bp: deltaYieldBp,
      asset_return: -deltaYieldBp / 10000,
      turnover,
      trade_fee_bp: tradeFeeBp,
      strategy_daily_bp_exact: strategyDailyBpExact,
      strategy_daily_bp_after_fee: strategyDailyBpAfterFee,
      strategy_cum_bp_after_fee: cumulativeBp,
      strategy_nav_exact: 1 + cumulativeBp / 10000,
      stop_loss_triggered: stopLossTriggered,
      strategy_drawdown_bp: strategyDrawdownBp,
      stop_loss_active: stopLocked ? 1 : 0,
      reentry_confirmed: reentryOnBar,
    })

    previousExecutionPosition = stopExecutedToday ? 0 : currentExecutionPosition
  }

  return rows
}

function buildMonthlyReturns(dates: string[], returns: number[]) {
  const grouped = new Map<string, number[]>()
  dates.forEach((date, index) => {
    const month = date.slice(0, 7)
    grouped.set(month, [...(grouped.get(month) ?? []), returns[index] ?? 0])
  })
  return Array.from(grouped.entries()).map(([month, values]) => ({
    month,
    return: roundTo(values.reduce((product, value) => product * (1 + value), 1) - 1),
  }))
}

function calculateWinRate(values: number[]) {
  const effective = values.filter((value) => Math.abs(value) > 1e-12)
  if (effective.length === 0) {
    return null
  }
  return effective.filter((value) => value > 0).length / effective.length
}

function calculateMonthlyWinRate(values: Array<{ return: number }>) {
  const effective = values.map((item) => item.return).filter((value) => Math.abs(value) > 1e-12)
  if (effective.length === 0) {
    return null
  }
  return effective.filter((value) => value > 0).length / effective.length
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function std(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  const avg = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length)
}

function roundTo(value: number, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0
}

function toCsv(rows: Record<string, unknown>[], preferredColumns?: string[]) {
  const columns = preferredColumns ?? Object.keys(rows[0] ?? {})
  const escapeCell = (value: unknown) => {
    const text = String(value ?? '')
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(','))].join('\n')
}
