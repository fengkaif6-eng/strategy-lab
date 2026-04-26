from __future__ import annotations

import json
import secrets
import threading
from copy import deepcopy
from pathlib import Path
from typing import Any

from backend.app.services.shared_json_store import shared_json_store

BASE_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BASE_DIR / 'backend' / 'data'
SEED_STRATEGIES_FILE = DATA_DIR / 'seed_strategies.json'
STATE_KEY = 'app_state'

FULL_ACCESS = {
    'allowBacktest': True,
    'allowLive': True,
    'allowThirdParty': True,
    'backtestStrategyIds': [],
    'liveStrategyIds': [],
    'thirdPartyStrategyIds': [],
}
EMPTY_ACCESS = {
    'allowBacktest': False,
    'allowLive': False,
    'allowThirdParty': False,
    'backtestStrategyIds': [],
    'liveStrategyIds': [],
    'thirdPartyStrategyIds': [],
}

DEFAULT_HERO_IMAGES = [
    {'id': 'hero-bg-default-1', 'src': '/src/assets/hero-bg-1.jpg', 'sourceType': 'default'},
    {'id': 'hero-bg-default-2', 'src': '/src/assets/hero-bg-2.png', 'sourceType': 'default'},
    {'id': 'hero-bg-default-3', 'src': '/src/assets/hero-bg-3.png', 'sourceType': 'default'},
]

DEFAULT_SITE_CONTENT = {
    'heroImages': DEFAULT_HERO_IMAGES,
}
DEFAULT_ANALYTICS = {
    'version': 2,
    'moduleVisits': {},
    'strategyVisits': {},
    'permissionOpens': [],
}
MAX_PERMISSION_LOGS = 200

DEFAULT_THIRDPARTY_STRATEGIES = [
    {
        'id': 'tp-201',
        'name': '第三方CTA指数增强',
        'channel': 'thirdparty',
        'author': '第三方管理人 AlphaQuant',
        'tags': ['第三方', 'CTA', '趋势'],
        'riskLevel': 'medium',
        'status': 'active',
        'updatedAt': '2026-03-25',
        'summary': '第三方管理人提供的多品种趋势策略，强调回撤控制与稳健年化。',
        'metrics': {
            'annualReturn': 0.183,
            'sharpe': 1.46,
            'maxDrawdown': -0.071,
            'winRate': 0.59,
            'tradeCount': 138,
            'volatility': 0.131,
        },
        'detail': {
            'description': '基于第三方托管账户回传数据构建指标，按周同步最新净值。',
            'logic': '多品种趋势打分 + 风险预算 + 动态仓位约束。',
            'params': {'rebalanceFreq': 'weekly', 'maxLeverage': 1.1, 'riskBudget': '8%'},
            'equityCurve': [
                {'date': '2025-12', 'value': 1.109},
                {'date': '2026-01', 'value': 1.123},
                {'date': '2026-02', 'value': 1.137},
                {'date': '2026-03', 'value': 1.152},
            ],
            'drawdownCurve': [
                {'date': '2025-12', 'value': -0.012},
                {'date': '2026-01', 'value': -0.011},
                {'date': '2026-02', 'value': -0.009},
                {'date': '2026-03', 'value': -0.008},
            ],
            'monthlyReturns': [
                {'month': '2025-12', 'return': 0.014},
                {'month': '2026-01', 'return': 0.014},
                {'month': '2026-02', 'return': 0.013},
                {'month': '2026-03', 'return': 0.013},
            ],
            'riskNotes': ['第三方报送口径可能与平台口径存在轻微差异', '极端行情下波动可能放大'],
            'attachments': [],
        },
    },
    {
        'id': 'tp-202',
        'name': '第三方市场中性组合',
        'channel': 'thirdparty',
        'author': '第三方管理人 BetaCapital',
        'tags': ['第三方', '市场中性', '低波'],
        'riskLevel': 'low',
        'status': 'active',
        'updatedAt': '2026-03-26',
        'summary': '第三方市场中性策略，追求低波动下的稳定复利。',
        'metrics': {
            'annualReturn': 0.124,
            'sharpe': 1.72,
            'maxDrawdown': -0.039,
            'winRate': 0.66,
            'tradeCount': 112,
            'volatility': 0.079,
        },
        'detail': {
            'description': '通过多空对冲降低系统性风险，收益主要来自选股与择时细分因子。',
            'logic': '行业中性约束 + 因子轮动 + 回撤阈值风控。',
            'params': {'netExposure': '0-10%', 'rebalanceFreq': 'bi-weekly', 'maxDrawdownGuard': '4%'},
            'equityCurve': [
                {'date': '2025-12', 'value': 1.068},
                {'date': '2026-01', 'value': 1.076},
                {'date': '2026-02', 'value': 1.085},
                {'date': '2026-03', 'value': 1.094},
            ],
            'drawdownCurve': [
                {'date': '2025-12', 'value': -0.006},
                {'date': '2026-01', 'value': -0.005},
                {'date': '2026-02', 'value': -0.004},
                {'date': '2026-03', 'value': -0.004},
            ],
            'monthlyReturns': [
                {'month': '2025-12', 'return': 0.008},
                {'month': '2026-01', 'return': 0.009},
                {'month': '2026-02', 'return': 0.008},
                {'month': '2026-03', 'return': 0.008},
            ],
            'riskNotes': ['策略容量受限，规模扩大可能影响收益', '成交活跃度下降时对冲成本上升'],
            'attachments': [],
        },
    },
    {
        'id': 'tp-203',
        'name': 'Third-Party Macro Rotation',
        'channel': 'thirdparty',
        'author': 'Gamma Advisory',
        'tags': ['third-party', 'macro', 'rotation'],
        'riskLevel': 'medium',
        'status': 'active',
        'updatedAt': '2026-04-08',
        'summary': 'Cross-asset macro rotation strategy focusing on equity, bond and commodity allocation shifts.',
        'metrics': {
            'annualReturn': 0.168,
            'sharpe': 1.41,
            'maxDrawdown': -0.068,
            'winRate': 0.61,
            'tradeCount': 126,
            'volatility': 0.117,
        },
        'detail': {
            'description': 'Uses macro regime signals and relative momentum to rebalance among equity, bond and commodity sleeves.',
            'logic': 'Regime score + momentum ranking + risk parity scaling, with weekly execution and downside guardrails.',
            'params': {'rebalanceFreq': 'weekly', 'targetVol': '12%', 'maxSingleAssetWeight': '45%'},
            'equityCurve': [
                {'date': '2025-12', 'value': 1.094},
                {'date': '2026-01', 'value': 1.109},
                {'date': '2026-02', 'value': 1.122},
                {'date': '2026-03', 'value': 1.138},
            ],
            'drawdownCurve': [
                {'date': '2025-12', 'value': -0.014},
                {'date': '2026-01', 'value': -0.011},
                {'date': '2026-02', 'value': -0.009},
                {'date': '2026-03', 'value': -0.008},
            ],
            'monthlyReturns': [
                {'month': '2025-12', 'return': 0.015},
                {'month': '2026-01', 'return': 0.013},
                {'month': '2026-02', 'return': 0.014},
                {'month': '2026-03', 'return': 0.012},
            ],
            'riskNotes': [
                'Macro regime turning points may increase short-term whipsaw.',
                'Cross-asset correlation spikes can reduce diversification benefits.',
            ],
            'attachments': [],
        },
    },
    {
        'id': 'tp-204',
        'name': 'Third-Party AI Equity Selection',
        'channel': 'thirdparty',
        'author': 'Delta Quant Labs',
        'tags': ['third-party', 'ai', 'equity'],
        'riskLevel': 'high',
        'status': 'active',
        'updatedAt': '2026-04-08',
        'summary': 'AI-driven stock selection strategy with dynamic sector exposure and strict position-level risk controls.',
        'metrics': {
            'annualReturn': 0.219,
            'sharpe': 1.63,
            'maxDrawdown': -0.097,
            'winRate': 0.58,
            'tradeCount': 174,
            'volatility': 0.166,
        },
        'detail': {
            'description': 'Combines alternative data signals and model ensemble ranking to select high-conviction long positions.',
            'logic': 'Model score ensemble + liquidity filter + stop-loss and exposure caps, rebalanced every 3 trading days.',
            'params': {'rebalanceFreq': 'every-3-days', 'maxHolding': 18, 'stopLoss': '5%'},
            'equityCurve': [
                {'date': '2025-12', 'value': 1.112},
                {'date': '2026-01', 'value': 1.104},
                {'date': '2026-02', 'value': 1.131},
                {'date': '2026-03', 'value': 1.152},
            ],
            'drawdownCurve': [
                {'date': '2025-12', 'value': -0.016},
                {'date': '2026-01', 'value': -0.024},
                {'date': '2026-02', 'value': -0.014},
                {'date': '2026-03', 'value': -0.012},
            ],
            'monthlyReturns': [
                {'month': '2025-12', 'return': -0.008},
                {'month': '2026-01', 'return': 0.027},
                {'month': '2026-02', 'return': 0.021},
                {'month': '2026-03', 'return': 0.019},
            ],
            'riskNotes': [
                'Signal decay may accelerate in crowded factor environments.',
                'Higher turnover can raise implementation cost and slippage.',
            ],
            'attachments': [],
        },
    },
]

ADMIN_USER = {
    'id': 'admin-local',
    'username': 'admin',
    'fullName': '系统管理员',
    'organization': '固定收益客需部',
    'email': 'admin@strategy-lab.local',
    'contact': '000-0000-0000',
    'role': 'admin',
    'token': 'admin-token-local',
    'registeredAt': '2026-03-24',
    'permissions': FULL_ACCESS,
    'password': 'Admin@123456',
}

USER_DEMO = {
    'id': 'user-demo-local',
    'username': 'user_demo',
    'fullName': '测试用户',
    'organization': '固定收益客需部',
    'email': 'user-demo@strategy-lab.local',
    'contact': '138-0000-0000',
    'role': 'user',
    'token': 'user-demo-token-local',
    'registeredAt': '2026-03-24',
    'permissions': FULL_ACCESS,
    'password': 'User@123456',
}


def _deepcopy(value: Any) -> Any:
    return deepcopy(value)


def _read_seed_strategies() -> dict[str, list[dict[str, Any]]]:
    if not SEED_STRATEGIES_FILE.exists():
        return {'backtest': [], 'live': [], 'thirdparty': _deepcopy(DEFAULT_THIRDPARTY_STRATEGIES)}
    payload = json.loads(SEED_STRATEGIES_FILE.read_text(encoding='utf-8'))
    if not isinstance(payload, dict):
        return {'backtest': [], 'live': [], 'thirdparty': _deepcopy(DEFAULT_THIRDPARTY_STRATEGIES)}
    thirdparty = payload.get('thirdparty') if isinstance(payload.get('thirdparty'), list) else []
    if len(thirdparty) == 0:
        thirdparty = _deepcopy(DEFAULT_THIRDPARTY_STRATEGIES)
    return {
        'backtest': list(payload.get('backtest', [])) if isinstance(payload.get('backtest'), list) else [],
        'live': list(payload.get('live', [])) if isinstance(payload.get('live'), list) else [],
        'thirdparty': list(thirdparty),
    }


def _build_default_state() -> dict[str, Any]:
    return {
        'users': [_deepcopy(ADMIN_USER), _deepcopy(USER_DEMO)],
        'registrationRequests': [],
        'strategies': _read_seed_strategies(),
        'siteContent': _deepcopy(DEFAULT_SITE_CONTENT),
        'analytics': _deepcopy(DEFAULT_ANALYTICS),
    }


def _normalize_permissions(value: dict[str, Any] | None, fallback: str) -> dict[str, Any]:
    source = value or {}
    if fallback == 'full':
        base = _deepcopy(FULL_ACCESS)
    else:
        base = _deepcopy(EMPTY_ACCESS)
    return {
        'allowBacktest': bool(source.get('allowBacktest', base['allowBacktest'])),
        'allowLive': bool(source.get('allowLive', base['allowLive'])),
        'allowThirdParty': bool(source.get('allowThirdParty', base['allowThirdParty'])),
        'backtestStrategyIds': sorted(
            {item for item in source.get('backtestStrategyIds', base['backtestStrategyIds']) if isinstance(item, str) and item}
        ),
        'liveStrategyIds': sorted(
            {item for item in source.get('liveStrategyIds', base['liveStrategyIds']) if isinstance(item, str) and item}
        ),
        'thirdPartyStrategyIds': sorted(
            {item for item in source.get('thirdPartyStrategyIds', base['thirdPartyStrategyIds']) if isinstance(item, str) and item}
        ),
    }


def _normalize_site_content(value: dict[str, Any] | None) -> dict[str, Any]:
    payload = value if isinstance(value, dict) else {}
    hero_images = payload.get('heroImages')
    default_image_map = {item['id']: item for item in DEFAULT_HERO_IMAGES}
    if not isinstance(hero_images, list) or len(hero_images) == 0:
        hero_images = _deepcopy(DEFAULT_HERO_IMAGES)
    else:
        normalized_images = []
        for index, item in enumerate(hero_images):
            if not isinstance(item, dict):
                continue
            src = str(item.get('src', '')).strip()
            source_type = 'custom' if item.get('sourceType') == 'custom' else 'default'
            image_id = str(item.get('id', f'hero-image-{index + 1}'))
            if source_type == 'default' and not src:
                preset = default_image_map.get(image_id)
                if preset:
                    normalized_images.append(_deepcopy(preset))
                continue
            if not src:
                continue
            normalized_images.append(
                {
                    'id': image_id,
                    'src': src,
                    'sourceType': source_type,
                }
            )
        hero_images = normalized_images or _deepcopy(DEFAULT_HERO_IMAGES)
    return {'heroImages': hero_images}


def _normalize_analytics(value: dict[str, Any] | None) -> dict[str, Any]:
    payload = value if isinstance(value, dict) else {}
    module_visits_source = payload.get('moduleVisits')
    strategy_visits_source = payload.get('strategyVisits')
    permission_opens_source = payload.get('permissionOpens')

    module_visits: dict[str, dict[str, Any]] = {}
    if isinstance(module_visits_source, dict):
        for path, counter in module_visits_source.items():
            if not isinstance(path, str) or not path.strip():
                continue
            if not isinstance(counter, dict):
                continue
            module_visits[path] = {
                'count': max(0, int(counter.get('count', 0))),
                'lastVisitedAt': str(counter.get('lastVisitedAt') or '1970-01-01T00:00:00Z'),
            }

    strategy_visits: dict[str, dict[str, Any]] = {}
    if isinstance(strategy_visits_source, dict):
        for key, counter in strategy_visits_source.items():
            if not isinstance(key, str) or not key.strip():
                continue
            if not isinstance(counter, dict):
                continue
            channel = str(counter.get('channel') or '').strip()
            strategy_id = str(counter.get('strategyId') or '').strip()
            if channel not in {'backtest', 'live', 'thirdparty'} or not strategy_id:
                continue
            strategy_visits[key] = {
                'channel': channel,
                'strategyId': strategy_id,
                'strategyName': str(counter.get('strategyName') or strategy_id),
                'count': max(0, int(counter.get('count', 0))),
                'lastVisitedAt': str(counter.get('lastVisitedAt') or '1970-01-01T00:00:00Z'),
            }

    permission_opens: list[dict[str, Any]] = []
    if isinstance(permission_opens_source, list):
        for item in permission_opens_source:
            if not isinstance(item, dict):
                continue
            action = str(item.get('action') or '').strip()
            if action not in {'approve', 'update'}:
                continue
            permission_opens.append(
                {
                    'id': str(item.get('id') or f"permission_{secrets.token_hex(8)}"),
                    'action': action,
                    'targetUserId': str(item.get('targetUserId') or ''),
                    'targetUsername': str(item.get('targetUsername') or ''),
                    'summary': str(item.get('summary') or ''),
                    'timestamp': str(item.get('timestamp') or '1970-01-01T00:00:00Z'),
                }
            )
    permission_opens = permission_opens[:MAX_PERMISSION_LOGS]

    return {
        'version': 2,
        'moduleVisits': module_visits,
        'strategyVisits': strategy_visits,
        'permissionOpens': permission_opens,
    }


def _normalize_user(user: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(user, dict):
        return None
    username = str(user.get('username', '')).strip()
    if not username:
        return None
    role = 'admin' if user.get('role') == 'admin' else 'user'
    permissions = _normalize_permissions(
        user.get('permissions') if isinstance(user.get('permissions'), dict) else None,
        'full' if role == 'admin' else 'empty',
    )
    if role == 'admin':
        permissions = _deepcopy(FULL_ACCESS)
    return {
        'id': str(user.get('id') or f'usr_{secrets.token_hex(4)}'),
        'username': username,
        'fullName': str(user.get('fullName') or username).strip() or username,
        'organization': str(user.get('organization') or '未填写').strip() or '未填写',
        'email': str(user.get('email') or '').strip(),
        'contact': str(user.get('contact') or '').strip(),
        'role': role,
        'token': str(user.get('token') or f'tk_{secrets.token_hex(8)}'),
        'registeredAt': str(user.get('registeredAt') or '2026-03-24'),
        'permissions': permissions,
        'password': str(user.get('password') or ''),
    }


def _normalize_request(request: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(request, dict):
        return None
    username = str(request.get('username', '')).strip()
    password = str(request.get('password', ''))
    full_name = str(request.get('fullName', '')).strip()
    organization = str(request.get('organization', '')).strip()
    email = str(request.get('email', '')).strip()
    contact = str(request.get('contact', '')).strip()
    if (
        len(username) < 3
        or len(password) < 6
        or len(full_name) < 2
        or len(organization) < 2
        or len(email) < 3
        or len(contact) < 3
    ):
        return None
    return {
        'id': str(request.get('id') or f'req_{secrets.token_hex(4)}'),
        'username': username,
        'password': password,
        'fullName': full_name,
        'organization': organization,
        'email': email,
        'contact': contact,
        'requestedAt': str(request.get('requestedAt') or '2026-03-24T00:00:00Z'),
    }


def _normalize_state(value: dict[str, Any] | None) -> dict[str, Any]:
    payload = value if isinstance(value, dict) else {}
    normalized_users = [
        user for user in (_normalize_user(item) for item in payload.get('users', [])) if user is not None
    ]

    admin_user = next((item for item in normalized_users if item['username'] == 'admin'), None)
    if admin_user is None:
        normalized_users.insert(0, _deepcopy(ADMIN_USER))
    else:
        admin_user.update(
            {
                'role': 'admin',
                'permissions': _deepcopy(FULL_ACCESS),
                'password': admin_user['password'] or ADMIN_USER['password'],
            }
        )

    if not any(item['username'] == USER_DEMO['username'] for item in normalized_users):
        normalized_users.append(_deepcopy(USER_DEMO))

    requests = [
        item
        for item in (_normalize_request(entry) for entry in payload.get('registrationRequests', []))
        if item is not None
    ]
    strategies = payload.get('strategies') if isinstance(payload.get('strategies'), dict) else None
    seed_strategies = _read_seed_strategies()
    if not strategies:
        strategies = seed_strategies
    thirdparty = (
        list(strategies.get('thirdparty', []))
        if isinstance(strategies.get('thirdparty'), list)
        else list(seed_strategies.get('thirdparty', []))
    )

    return {
        'users': normalized_users,
        'registrationRequests': requests,
        'strategies': {
            'backtest': list(strategies.get('backtest', [])) if isinstance(strategies.get('backtest'), list) else [],
            'live': list(strategies.get('live', [])) if isinstance(strategies.get('live'), list) else [],
            'thirdparty': thirdparty,
        },
        'siteContent': _normalize_site_content(payload.get('siteContent') if isinstance(payload.get('siteContent'), dict) else None),
        'analytics': _normalize_analytics(payload.get('analytics') if isinstance(payload.get('analytics'), dict) else None),
    }


class AppStateStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        if shared_json_store.get_json(STATE_KEY) is None:
            self._write_state(_build_default_state())

    def _read_state(self) -> dict[str, Any]:
        raw = shared_json_store.get_json(STATE_KEY)
        state = raw if isinstance(raw, dict) else _build_default_state()
        normalized = _normalize_state(state)
        if normalized != state:
            self._write_state(normalized)
        return normalized

    def _write_state(self, state: dict[str, Any]) -> None:
        shared_json_store.set_json(STATE_KEY, _normalize_state(state))

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return _deepcopy(self._read_state())

    def update(self, updater) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            next_state = updater(_deepcopy(state))
            normalized = _normalize_state(next_state)
            self._write_state(normalized)
            return _deepcopy(normalized)


store = AppStateStore()
