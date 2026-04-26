from __future__ import annotations

import os
import math
from datetime import datetime
from typing import Any

from fastapi import FastAPI
from fastapi import File
from fastapi import Form
from fastapi import HTTPException
from fastapi import Request
from fastapi import UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.app.schemas import (
    AnalyticsSnapshotResponse,
    AppBootstrapPayload,
    AuthUserResponse,
    HomeMarketPayload,
    HomeSiteContent,
    LoginPayload,
    ModuleVisitPayload,
    PermissionOpenPayload,
    PermissionsPayload,
    RegistrationPayload,
    RegistrationRequestResponse,
    StrategyVisitPayload,
    StrategyMovePayload,
    StrategyMutationPayload,
)
from backend.app.services.app_state import store
from backend.app.services.bp_import_service import import_bp_performance
from backend.app.services.market_service import (
    get_home_market_payload,
    start_home_market_prefetcher,
    stop_home_market_prefetcher,
)
from backend.app.services.shared_json_store import shared_json_store


def _get_allowed_origins() -> list[str]:
    raw = os.getenv(
        'MARKET_API_ALLOWED_ORIGINS',
        'http://localhost:5173,http://127.0.0.1:5173',
    )
    parsed = [item.strip() for item in raw.split(',') if item.strip()]
    return parsed or ['http://localhost:5173', 'http://127.0.0.1:5173']


def _get_allowed_origin_regex() -> str | None:
    configured = os.getenv('MARKET_API_ALLOWED_ORIGIN_REGEX', '').strip()
    if configured:
        return configured
    # Development-friendly fallback: allow localhost / 127.0.0.1 on any port.
    return r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$'


app = FastAPI(title='Strategy Lab Market API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_origin_regex=_get_allowed_origin_regex(),
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PUT', 'DELETE'],
    allow_headers=['*'],
)


@app.middleware('http')
async def add_no_store_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


@app.on_event('startup')
def _startup_market_prefetch() -> None:
    if os.getenv('DISABLE_HOME_MARKET_PREFETCH', '0').strip() == '1':
        return
    start_home_market_prefetcher()


@app.on_event('shutdown')
def _shutdown_market_prefetch() -> None:
    if os.getenv('DISABLE_HOME_MARKET_PREFETCH', '0').strip() == '1':
        return
    stop_home_market_prefetcher()


@app.get('/api/health')
def health() -> dict[str, str | bool]:
    return {
        'status': 'ok',
        'sharedStoreMode': shared_json_store.mode,
        'sharedStoreStrict': shared_json_store.strict_required,
    }


@app.get('/api/market/home', response_model=HomeMarketPayload)
def market_home() -> HomeMarketPayload:
    return get_home_market_payload()


def _public_user(user: dict) -> dict:
    return {
        'id': user['id'],
        'username': user['username'],
        'fullName': user['fullName'],
        'organization': user['organization'],
        'email': user['email'],
        'contact': user['contact'],
        'role': user['role'],
        'token': user['token'],
        'registeredAt': user['registeredAt'],
        'permissions': user['permissions'],
    }


def _public_request(request: dict) -> dict:
    return {
        'id': request['id'],
        'username': request['username'],
        'fullName': request['fullName'],
        'organization': request['organization'],
        'email': request['email'],
        'contact': request['contact'],
        'requestedAt': request['requestedAt'],
    }


def _normalize_permissions(value: dict) -> dict:
    return {
        'allowBacktest': bool(value.get('allowBacktest', False)),
        'allowLive': bool(value.get('allowLive', False)),
        'allowThirdParty': bool(value.get('allowThirdParty', False)),
        'backtestStrategyIds': sorted(
            {
                item
                for item in value.get('backtestStrategyIds', [])
                if isinstance(item, str) and item.strip()
            }
        ),
        'liveStrategyIds': sorted(
            {
                item
                for item in value.get('liveStrategyIds', [])
                if isinstance(item, str) and item.strip()
            }
        ),
        'thirdPartyStrategyIds': sorted(
            {
                item
                for item in value.get('thirdPartyStrategyIds', [])
                if isinstance(item, str) and item.strip()
            }
        ),
    }


def _assert_valid_permissions(permissions: dict) -> None:
    if (
        not permissions['allowBacktest']
        and not permissions['allowLive']
        and not permissions['allowThirdParty']
        and len(permissions['backtestStrategyIds']) == 0
        and len(permissions['liveStrategyIds']) == 0
        and len(permissions['thirdPartyStrategyIds']) == 0
    ):
        raise HTTPException(status_code=400, detail='请至少授予一个策略或板块权限')


def _assert_valid_registration(payload: RegistrationPayload) -> None:
    if len(payload.username.strip()) < 3:
        raise HTTPException(status_code=400, detail='用户名至少 3 位')
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail='密码至少 6 位')
    if len(payload.fullName.strip()) < 2:
        raise HTTPException(status_code=400, detail='客户姓名至少 2 个字符')
    if len(payload.organization.strip()) < 2:
        raise HTTPException(status_code=400, detail='机构信息不能为空')
    if len(payload.email.strip()) < 3 or '@' not in payload.email:
        raise HTTPException(status_code=400, detail='邮箱格式不正确')
    if len(payload.contact.strip()) < 6:
        raise HTTPException(status_code=400, detail='联系方式至少 6 位')


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + 'Z'


def _default_analytics_snapshot() -> dict:
    return {
        'version': 2,
        'moduleVisits': {},
        'strategyVisits': {},
        'permissionOpens': [],
    }


@app.get('/api/bootstrap', response_model=AppBootstrapPayload)
def app_bootstrap() -> AppBootstrapPayload:
    state = store.snapshot()
    return AppBootstrapPayload(
        strategies=state['strategies'],
        pendingRequests=[_public_request(item) for item in state['registrationRequests']],
        managedUsers=[_public_user(item) for item in state['users'] if item['role'] == 'user'],
        siteContent=state['siteContent'],
    )


@app.post('/api/auth/login', response_model=AuthUserResponse)
def auth_login(payload: LoginPayload) -> AuthUserResponse:
    state = store.snapshot()
    target = next(
        (
            item
            for item in state['users']
            if item['username'].lower() == payload.username.strip().lower()
        ),
        None,
    )
    if target is None or target['password'] != payload.password:
        raise HTTPException(status_code=400, detail='用户名或密码错误')
    return AuthUserResponse(**_public_user(target))


@app.post('/api/auth/register', response_model=RegistrationRequestResponse)
def auth_register(payload: RegistrationPayload) -> RegistrationRequestResponse:
    _assert_valid_registration(payload)

    def updater(state: dict) -> dict:
        username_lower = payload.username.strip().lower()
        if any(user['username'].lower() == username_lower for user in state['users']):
            raise HTTPException(status_code=400, detail='用户名已存在')
        if any(req['username'].lower() == username_lower for req in state['registrationRequests']):
            raise HTTPException(status_code=400, detail='该用户名已有待审核申请')
        state['registrationRequests'].insert(
            0,
            {
                'id': f"req_{payload.username.strip().lower()}_{len(state['registrationRequests']) + 1}",
                'username': payload.username.strip(),
                'password': payload.password,
                'fullName': payload.fullName.strip(),
                'organization': payload.organization.strip(),
                'email': payload.email.strip(),
                'contact': payload.contact.strip(),
                'requestedAt': datetime.utcnow().isoformat() + 'Z',
            },
        )
        return state

    state = store.update(updater)
    created = state['registrationRequests'][0]
    return RegistrationRequestResponse(**_public_request(created))


@app.get('/api/admin/requests', response_model=list[RegistrationRequestResponse])
def admin_requests() -> list[RegistrationRequestResponse]:
    state = store.snapshot()
    return [RegistrationRequestResponse(**_public_request(item)) for item in state['registrationRequests']]


@app.get('/api/admin/users', response_model=list[AuthUserResponse])
def admin_users() -> list[AuthUserResponse]:
    state = store.snapshot()
    return [AuthUserResponse(**_public_user(item)) for item in state['users'] if item['role'] == 'user']


@app.post('/api/admin/requests/{request_id}/approve', response_model=AuthUserResponse)
def admin_approve_request(request_id: str, payload: PermissionsPayload) -> AuthUserResponse:
    permissions = _normalize_permissions(payload.permissions.model_dump())
    _assert_valid_permissions(permissions)
    created_user_id: dict[str, str | None] = {'value': None}

    def updater(state: dict) -> dict:
        request = next((item for item in state['registrationRequests'] if item['id'] == request_id), None)
        if request is None:
            raise HTTPException(status_code=404, detail='注册申请不存在或已处理')
        if any(user['username'].lower() == request['username'].lower() for user in state['users']):
            raise HTTPException(status_code=400, detail='用户名已存在，无法重复创建')
        next_user_id = f"usr_{len(state['users']) + 1}"
        created_user_id['value'] = next_user_id
        state['users'].append(
            {
                'id': next_user_id,
                'username': request['username'],
                'fullName': request['fullName'],
                'organization': request['organization'],
                'email': request['email'],
                'contact': request['contact'],
                'role': 'user',
                'token': f"user-token-{request['username']}",
                'registeredAt': datetime.utcnow().date().isoformat(),
                'permissions': permissions,
                'password': request['password'],
            }
        )
        state['registrationRequests'] = [
            item for item in state['registrationRequests'] if item['id'] != request_id
        ]
        return state

    state = store.update(updater)
    created = next(item for item in state['users'] if item['id'] == created_user_id['value'])
    return AuthUserResponse(**_public_user(created))


@app.post('/api/admin/requests/{request_id}/reject')
def admin_reject_request(request_id: str) -> dict[str, str]:
    def updater(state: dict) -> dict:
        if not any(item['id'] == request_id for item in state['registrationRequests']):
            raise HTTPException(status_code=404, detail='注册申请不存在或已处理')
        state['registrationRequests'] = [
            item for item in state['registrationRequests'] if item['id'] != request_id
        ]
        return state

    store.update(updater)
    return {'status': 'ok'}


@app.put('/api/admin/users/{user_id}/permissions', response_model=AuthUserResponse)
def admin_update_user_permissions(user_id: str, payload: PermissionsPayload) -> AuthUserResponse:
    permissions = _normalize_permissions(payload.permissions.model_dump())
    _assert_valid_permissions(permissions)

    def updater(state: dict) -> dict:
        user = next((item for item in state['users'] if item['id'] == user_id), None)
        if user is None:
            raise HTTPException(status_code=404, detail='用户不存在')
        if user['role'] == 'admin':
            raise HTTPException(status_code=400, detail='管理员权限不可在此修改')
        user['permissions'] = permissions
        return state

    state = store.update(updater)
    updated = next(item for item in state['users'] if item['id'] == user_id)
    return AuthUserResponse(**_public_user(updated))


@app.get('/api/strategies')
def get_strategies() -> dict:
    return store.snapshot()['strategies']


@app.post('/api/admin/performance-import/bp')
async def import_bp_performance_api(
    signalFile: UploadFile = File(...),
    yieldFile: UploadFile = File(...),
    signalDateCol: str | None = Form(None),
    signalCol: str = Form('signal'),
    yieldDateCol: str = Form('date'),
    yieldCol: str = Form('yield'),
    signalName: str = Form('signal'),
    feeBpsPerSide: float = Form(0.0),
    stopLossBp: float | None = Form(None),
    executionDelayBars: int = Form(1),
    externalStopCol: str | None = Form(None),
) -> dict:
    try:
        return import_bp_performance(
            signal_content=await signalFile.read(),
            signal_filename=signalFile.filename or 'signals.csv',
            yield_content=await yieldFile.read(),
            yield_filename=yieldFile.filename or 'yields.csv',
            signal_date_col=signalDateCol,
            signal_col=signalCol,
            yield_date_col=yieldDateCol,
            yield_col=yieldCol,
            signal_name=signalName,
            fee_bps_per_side=feeBpsPerSide,
            stop_loss_bp=stopLossBp,
            execution_delay_bars=executionDelayBars,
            external_stop_col=externalStopCol,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await signalFile.close()
        await yieldFile.close()


@app.get('/api/admin/analytics', response_model=AnalyticsSnapshotResponse)
def get_admin_analytics() -> AnalyticsSnapshotResponse:
    state = store.snapshot()
    analytics = state.get('analytics') if isinstance(state.get('analytics'), dict) else _default_analytics_snapshot()
    return AnalyticsSnapshotResponse(**analytics)


@app.post('/api/analytics/module-visit')
def track_module_visit(payload: ModuleVisitPayload) -> dict[str, str]:
    pathname = payload.pathname.strip()
    if not pathname or payload.actorRole != 'user':
        return {'status': 'ignored'}

    def updater(state: dict) -> dict:
        analytics = state.get('analytics')
        if not isinstance(analytics, dict):
            analytics = _default_analytics_snapshot()
            state['analytics'] = analytics
        module_visits = analytics.get('moduleVisits')
        if not isinstance(module_visits, dict):
            module_visits = {}
            analytics['moduleVisits'] = module_visits
        current = module_visits.get(pathname)
        current_count = int(current.get('count', 0)) if isinstance(current, dict) else 0
        module_visits[pathname] = {
            'count': current_count + 1,
            'lastVisitedAt': _now_iso(),
        }
        return state

    store.update(updater)
    return {'status': 'ok'}


@app.post('/api/analytics/strategy-visit')
def track_strategy_visit(payload: StrategyVisitPayload) -> dict[str, str]:
    strategy_id = payload.strategyId.strip()
    strategy_name = payload.strategyName.strip()
    if not strategy_id or payload.actorRole != 'user':
        return {'status': 'ignored'}

    key = f'{payload.channel}:{strategy_id}'

    def updater(state: dict) -> dict:
        analytics = state.get('analytics')
        if not isinstance(analytics, dict):
            analytics = _default_analytics_snapshot()
            state['analytics'] = analytics
        strategy_visits = analytics.get('strategyVisits')
        if not isinstance(strategy_visits, dict):
            strategy_visits = {}
            analytics['strategyVisits'] = strategy_visits
        current = strategy_visits.get(key)
        current_count = int(current.get('count', 0)) if isinstance(current, dict) else 0
        strategy_visits[key] = {
            'channel': payload.channel,
            'strategyId': strategy_id,
            'strategyName': strategy_name or strategy_id,
            'count': current_count + 1,
            'lastVisitedAt': _now_iso(),
        }
        return state

    store.update(updater)
    return {'status': 'ok'}


@app.post('/api/analytics/permission-open')
def track_permission_open(payload: PermissionOpenPayload) -> dict[str, str]:
    def updater(state: dict) -> dict:
        analytics = state.get('analytics')
        if not isinstance(analytics, dict):
            analytics = _default_analytics_snapshot()
            state['analytics'] = analytics
        permission_opens = analytics.get('permissionOpens')
        if not isinstance(permission_opens, list):
            permission_opens = []
            analytics['permissionOpens'] = permission_opens

        permission_opens.insert(
            0,
            {
                'id': f"permission_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{payload.targetUserId}_{payload.action}",
                'action': payload.action,
                'targetUserId': payload.targetUserId,
                'targetUsername': payload.targetUsername,
                'summary': payload.summary,
                'timestamp': _now_iso(),
            },
        )
        analytics['permissionOpens'] = permission_opens[:200]
        return state

    store.update(updater)
    return {'status': 'ok'}


def _safe_number(value: Any, fallback: float = 0.0) -> float:
    if isinstance(value, bool):
        return fallback
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(numeric):
        return fallback
    return numeric


def _safe_non_negative_int(value: Any, fallback: int = 0) -> int:
    normalized = _safe_number(value, float(fallback))
    if normalized < 0:
        return 0
    return int(round(normalized))


def _normalize_backtest_like_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    annual_return = _safe_number(
        metrics.get('annualReturn'),
        _safe_number(metrics.get('totalReturn'), 0.0),
    )
    total_return = _safe_number(metrics.get('totalReturn'), annual_return)
    running_days = max(1, _safe_non_negative_int(metrics.get('runningDays'), 1))
    trade_count = _safe_non_negative_int(
        metrics.get('tradeCount'),
        _safe_non_negative_int(metrics.get('positionCount'), 0),
    )
    start_date = metrics.get('startDate') if isinstance(metrics.get('startDate'), str) else None
    win_rate = _safe_number(
        metrics.get('winRate'),
        _safe_number(metrics.get('monthlyWinRate'), 0.0),
    )
    return {
        'annualReturn': annual_return,
        'sharpe': _safe_number(metrics.get('sharpe'), 0.0),
        'maxDrawdown': _safe_number(metrics.get('maxDrawdown'), 0.0),
        'winRate': win_rate,
        'tradeCount': trade_count,
        'volatility': _safe_number(metrics.get('volatility'), 0.0),
        'runningDays': running_days,
        'totalReturn': total_return,
        'startDate': start_date,
    }


def _normalize_live_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    annual_return = _safe_number(
        metrics.get('annualReturn'),
        _safe_number(metrics.get('totalReturn'), 0.0),
    )
    total_return = _safe_number(metrics.get('totalReturn'), annual_return)
    running_days = max(1, _safe_non_negative_int(metrics.get('runningDays'), 1))
    trade_count = _safe_non_negative_int(
        metrics.get('tradeCount'),
        _safe_non_negative_int(metrics.get('positionCount'), 0),
    )
    position_count = _safe_non_negative_int(metrics.get('positionCount'), trade_count)
    win_rate = _safe_number(
        metrics.get('winRate'),
        _safe_number(metrics.get('monthlyWinRate'), 0.0),
    )
    monthly_win_rate = _safe_number(metrics.get('monthlyWinRate'), win_rate)
    start_date = metrics.get('startDate') if isinstance(metrics.get('startDate'), str) else None
    return {
        'annualReturn': annual_return,
        'sharpe': _safe_number(metrics.get('sharpe'), 0.0),
        'winRate': win_rate,
        'tradeCount': trade_count,
        'totalReturn': total_return,
        'alpha': _safe_number(metrics.get('alpha'), 0.0),
        'maxDrawdown': _safe_number(metrics.get('maxDrawdown'), 0.0),
        'volatility': _safe_number(metrics.get('volatility'), 0.0),
        'runningDays': running_days,
        'startDate': start_date,
        'positionCount': position_count,
        'monthlyWinRate': monthly_win_rate,
    }


def _convert_strategy_channel(strategy: dict[str, Any], to_channel: str) -> dict[str, Any]:
    converted = dict(strategy)
    converted['channel'] = to_channel
    metrics = converted.get('metrics')
    metrics_dict = metrics if isinstance(metrics, dict) else {}
    if to_channel == 'live':
        converted['metrics'] = _normalize_live_metrics(metrics_dict)
    else:
        converted['metrics'] = _normalize_backtest_like_metrics(metrics_dict)
    return converted


@app.post('/api/admin/strategies/move')
def move_strategy(payload: StrategyMovePayload) -> dict:
    from_channel = payload.fromChannel
    to_channel = payload.toChannel
    strategy_id = payload.strategyId.strip()
    if not strategy_id:
        raise HTTPException(status_code=400, detail='策略数据不合法')
    if from_channel == to_channel:
        raise HTTPException(status_code=400, detail='源板块与目标板块不能相同')

    def updater(state: dict) -> dict:
        source_records = list(state['strategies'][from_channel])
        source_index = next(
            (index for index, item in enumerate(source_records) if item.get('id') == strategy_id),
            -1,
        )
        if source_index < 0:
            raise HTTPException(status_code=404, detail='策略不存在或已被移动')

        source_strategy = source_records.pop(source_index)
        moved_strategy = _convert_strategy_channel(source_strategy, to_channel)
        target_records = list(state['strategies'][to_channel])
        target_index = next(
            (index for index, item in enumerate(target_records) if item.get('id') == strategy_id),
            -1,
        )
        if target_index >= 0:
            target_records[target_index] = moved_strategy
        else:
            target_records.insert(0, moved_strategy)

        state['strategies'][from_channel] = source_records
        state['strategies'][to_channel] = target_records
        return state

    return store.update(updater)['strategies']


@app.post('/api/admin/strategies')
def save_strategy(payload: StrategyMutationPayload) -> dict:
    strategy = payload.strategy
    channel = strategy.get('channel')
    strategy_id = strategy.get('id')
    if channel not in {'backtest', 'live', 'thirdparty'} or not isinstance(strategy_id, str) or not strategy_id.strip():
        raise HTTPException(status_code=400, detail='策略数据不合法')

    def updater(state: dict) -> dict:
        records = list(state['strategies'][channel])
        existing_index = next((index for index, item in enumerate(records) if item.get('id') == strategy_id), -1)
        if existing_index >= 0:
            records[existing_index] = strategy
        else:
            records.insert(0, strategy)
        state['strategies'][channel] = records
        return state

    return store.update(updater)['strategies']


@app.delete('/api/admin/strategies/{channel}/{strategy_id}')
def remove_strategy(channel: str, strategy_id: str) -> dict:
    if channel not in {'backtest', 'live', 'thirdparty'}:
        raise HTTPException(status_code=400, detail='策略板块不存在')

    def updater(state: dict) -> dict:
        state['strategies'][channel] = [
            item for item in state['strategies'][channel] if item.get('id') != strategy_id
        ]
        return state

    return store.update(updater)['strategies']


@app.put('/api/admin/strategies/{channel}')
def replace_strategies(channel: str, payload: dict) -> dict:
    if channel not in {'backtest', 'live', 'thirdparty'}:
        raise HTTPException(status_code=400, detail='策略板块不存在')
    strategies = payload.get('strategies')
    if not isinstance(strategies, list):
        raise HTTPException(status_code=400, detail='策略数据不合法')

    def updater(state: dict) -> dict:
        state['strategies'][channel] = strategies
        return state

    return store.update(updater)['strategies']


@app.get('/api/site-content/home', response_model=HomeSiteContent)
def get_home_site_content() -> HomeSiteContent:
    return HomeSiteContent(**store.snapshot()['siteContent'])


@app.put('/api/admin/site-content/home', response_model=HomeSiteContent)
def save_home_site_content(payload: HomeSiteContent) -> HomeSiteContent:
    state = store.update(lambda current: {**current, 'siteContent': payload.model_dump()})
    return HomeSiteContent(**state['siteContent'])
