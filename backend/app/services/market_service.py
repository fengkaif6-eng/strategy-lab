from __future__ import annotations

import base64
import contextlib
import io
import json
import threading
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from time import monotonic
from typing import Any, Callable
from zoneinfo import ZoneInfo

import akshare as ak
import pandas as pd
import requests

from backend.app.schemas import (
    HomeMarketPayload,
    MarketCard,
    MarketSeries,
    MarketSeriesPoint,
    MarketTickerQuote,
)
from backend.app.services.nhci_bridge import NhciBridgeError, fetch_nhci_bundle
from backend.app.services.shared_json_store import shared_json_store

SHANGHAI_TZ = ZoneInfo('Asia/Shanghai')

TICKER_CODES = [
    '600519',
    '601318',
    '000858',
    '300750',
    '002594',
    '601398',
    '688981',
    '000333',
]

TICKER_NAME_BY_CODE = {
    '600519': '贵州茅台',
    '601318': '中国平安',
    '000858': '五粮液',
    '300750': '宁德时代',
    '002594': '比亚迪',
    '601398': '工商银行',
    '688981': '中芯国际',
    '000333': '美的集团',
}

MARKET_CARD_META = {
    '000001': ('上证指数', 'index'),
    'CN10Y': ('中国10年期国债收益率', 'rate'),
    'NHCI': ('南华商品指数', 'index'),
    'USDCNY': ('美元/人民币', 'fx'),
}

IMPORTANT_CARD_META = {
    'CHINA_EPU': ('国家和地区指数', 'index'),
    'QVIX300ETF': ('300ETF期权波动率', 'index'),
    'SHIBOR': ('3个月 Shibor', 'rate'),
    'LPR': ('5年期 LPR', 'rate'),
}

RATE_SOURCE_NOTE = '近60个交易日日线'
FX_SOURCE_NOTE = '近60个交易日日线'
INDEX_SOURCE_NOTE = '近60个交易日日线'
USDCNY_MAX_SERIES_AGE_DAYS = 45
HOME_PAYLOAD_PREFETCH_INTERVAL_SECONDS = 12
HOME_PAYLOAD_STALE_SECONDS = 20
HOME_PAYLOAD_COLD_WAIT_SECONDS = 1.2
USDCNY_INCREMENTAL_KEEP_DAYS = 60
HOME_MARKET_SNAPSHOT_KEY = 'home_market_snapshot'
# Kept for one-way migration from legacy JSON payloads.
USDCNY_INCREMENTAL_KEY = 'usdcny_incremental'
USDCNY_INCREMENTAL_PARQUET_KEY = 'usdcny_incremental_parquet'
USDCNY_INCREMENTAL_BOOTSTRAP_DAYS = 120
DEFAULT_DAILY_SERIES_LIMIT = 60
DEFAULT_INTRADAY_SERIES_LIMIT = 480
SERIES_LIMIT_BY_CODE: dict[str, dict[str, int]] = {
    '000001': {'daily': 60},
    'CN10Y': {'daily': 60},
    'NHCI': {'daily': 60, 'intraday': 480},
    'USDCNY': {'daily': 60},
}


@dataclass
class CacheEntry:
    value: Any
    expires_at: float


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, CacheEntry] = {}

    def get_or_set(self, key: str, ttl_seconds: float, factory: Callable[[], Any]) -> Any:
        now = monotonic()
        cached = self._store.get(key)
        if cached and cached.expires_at > now:
            return cached.value
        try:
            value = factory()
        except Exception:
            if cached:
                return cached.value
            raise
        self._store[key] = CacheEntry(value=value, expires_at=now + ttl_seconds)
        return value


_cache = TTLCache()
_home_payload_lock = threading.Lock()
_home_payload_snapshot: HomeMarketPayload | None = None
_home_payload_refreshed_at: float = 0.0
_home_payload_refreshing = False
_home_payload_ready_event = threading.Event()
_home_payload_prefetch_thread: threading.Thread | None = None
_home_payload_prefetch_stop_event = threading.Event()


def _run_quietly(factory: Callable[[], Any]) -> Any:
    sink = io.StringIO()
    with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        return factory()


def _safe_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(parsed):
        return None
    return parsed


def _build_daily_points(
    frame: pd.DataFrame,
    date_column: str,
    value_column: str,
    *,
    volume_column: str | None = None,
    limit: int = 60,
) -> list[MarketSeriesPoint]:
    if frame.empty or date_column not in frame.columns or value_column not in frame.columns:
        return []

    working = frame.copy()
    working[date_column] = pd.to_datetime(working[date_column], errors='coerce')
    working[value_column] = pd.to_numeric(working[value_column], errors='coerce')
    if volume_column and volume_column in working.columns:
        working[volume_column] = pd.to_numeric(working[volume_column], errors='coerce').fillna(0)
    else:
        volume_column = None

    working = working.dropna(subset=[date_column, value_column]).sort_values(date_column)
    if working.empty:
        return []

    tail = working.tail(limit)
    points: list[MarketSeriesPoint] = []
    for _, row in tail.iterrows():
        label = row[date_column].date().isoformat()
        volume = float(row[volume_column]) if volume_column else 0.0
        points.append(
            MarketSeriesPoint(
                label=label,
                isoTime=label,
                price=float(row[value_column]),
                volume=volume,
            )
        )
    return points


def _build_intraday_points(
    frame: pd.DataFrame,
    time_column: str,
    value_column: str,
    *,
    volume_column: str | None = None,
) -> list[MarketSeriesPoint]:
    if frame.empty or time_column not in frame.columns or value_column not in frame.columns:
        return []

    working = frame.copy()
    working[time_column] = pd.to_datetime(working[time_column], errors='coerce')
    working[value_column] = pd.to_numeric(working[value_column], errors='coerce')
    if volume_column and volume_column in working.columns:
        working[volume_column] = pd.to_numeric(working[volume_column], errors='coerce').fillna(0)
    else:
        volume_column = None

    working = working.dropna(subset=[time_column, value_column]).sort_values(time_column)
    if working.empty:
        return []

    points: list[MarketSeriesPoint] = []
    for _, row in working.iterrows():
        timestamp = row[time_column]
        label = timestamp.strftime('%H:%M')
        volume = float(row[volume_column]) if volume_column else 0.0
        points.append(
            MarketSeriesPoint(
                label=label,
                isoTime=timestamp.isoformat(),
                price=float(row[value_column]),
                volume=volume,
            )
        )
    return points


def _series_price_pair(points: list[MarketSeriesPoint]) -> tuple[float | None, float | None]:
    if not points:
        return None, None
    price = points[-1].price
    previous = points[-2].price if len(points) >= 2 else price
    return price, previous


def _build_card_from_series(
    code: str,
    name: str,
    kind: str,
    points: list[MarketSeriesPoint],
    *,
    note: str | None = None,
) -> MarketCard:
    price, previous = _series_price_pair(points)
    if price is None or previous is None:
        return MarketCard(code=code, name=name, kind=kind, note=note or '数据暂不可用')

    change = price - previous
    change_pct = 0.0 if abs(previous) < 1e-9 else change / previous * 100
    return MarketCard(
        code=code,
        name=name,
        kind=kind,
        price=price,
        change=change,
        changePct=change_pct,
        note=note,
    )


def _make_unavailable_card(code: str, name: str, kind: str, note: str) -> MarketCard:
    return MarketCard(code=code, name=name, kind=kind, note=note)


def _make_empty_series(note: str) -> MarketSeries:
    return MarketSeries(granularity='none', note=note)


def _clone_series_points(points: list[MarketSeriesPoint]) -> list[MarketSeriesPoint]:
    return [
        MarketSeriesPoint(
            label=point.label,
            isoTime=point.isoTime,
            price=point.price,
            volume=point.volume,
        )
        for point in points
    ]


def _series_limit_for(code: str, granularity: str) -> int:
    if granularity == 'none':
        return 0
    profile = SERIES_LIMIT_BY_CODE.get(code, {})
    if granularity in profile:
        return max(1, int(profile[granularity]))
    if granularity == 'intraday':
        return DEFAULT_INTRADAY_SERIES_LIMIT
    return DEFAULT_DAILY_SERIES_LIMIT


def _point_sort_key(point: MarketSeriesPoint) -> str:
    return str(point.isoTime or point.label or '')


def _merge_series_points(
    previous_points: list[MarketSeriesPoint],
    incoming_points: list[MarketSeriesPoint],
    limit: int,
) -> list[MarketSeriesPoint]:
    if limit <= 0:
        return []

    by_key: dict[str, MarketSeriesPoint] = {}
    for point in previous_points:
        key = _point_sort_key(point)
        if not key:
            continue
        by_key[key] = MarketSeriesPoint(
            label=point.label,
            isoTime=point.isoTime,
            price=point.price,
            volume=point.volume,
        )
    for point in incoming_points:
        key = _point_sort_key(point)
        if not key:
            continue
        by_key[key] = MarketSeriesPoint(
            label=point.label,
            isoTime=point.isoTime,
            price=point.price,
            volume=point.volume,
        )

    merged = sorted(by_key.values(), key=_point_sort_key)
    return merged[-limit:]


def _merge_single_series(
    code: str,
    previous: MarketSeries | None,
    incoming: MarketSeries | None,
) -> MarketSeries:
    if incoming is None:
        if previous is not None:
            return MarketSeries(
                granularity=previous.granularity,
                points=_clone_series_points(previous.points),
                note=previous.note,
            )
        return MarketSeries(granularity='none', points=[], note='数据暂不可用')

    prev_points = previous.points if previous is not None else []
    if incoming.points:
        limit = _series_limit_for(code, incoming.granularity)
        merged_points = _merge_series_points(prev_points, incoming.points, limit)
        return MarketSeries(
            granularity=incoming.granularity if merged_points else 'none',
            points=merged_points,
            note=incoming.note or (previous.note if previous is not None else None),
        )

    if previous is not None and previous.points:
        return MarketSeries(
            granularity=previous.granularity,
            points=_clone_series_points(previous.points),
            note=previous.note,
        )

    return MarketSeries(granularity='none', points=[], note=incoming.note)


def _merge_card_lists(
    previous_cards: list[MarketCard],
    incoming_cards: list[MarketCard],
) -> list[MarketCard]:
    if not previous_cards:
        return incoming_cards
    if not incoming_cards:
        return previous_cards

    previous_by_code = {card.code: card for card in previous_cards}
    merged: list[MarketCard] = []
    seen_codes: set[str] = set()

    for card in incoming_cards:
        seen_codes.add(card.code)
        previous = previous_by_code.get(card.code)
        if previous is None or card.price is not None:
            merged.append(card)
            continue
        merged.append(
            MarketCard(
                code=card.code,
                name=card.name or previous.name,
                kind=card.kind,
                price=previous.price,
                change=previous.change,
                changePct=previous.changePct,
                note=card.note or previous.note,
            )
        )

    for card in previous_cards:
        if card.code in seen_codes:
            continue
        merged.append(card)

    return merged


def _merge_ticker_strip(
    previous_strip: list[MarketTickerQuote],
    incoming_strip: list[MarketTickerQuote],
) -> list[MarketTickerQuote]:
    if not previous_strip:
        return incoming_strip
    if not incoming_strip:
        return previous_strip

    previous_by_code = {item.code: item for item in previous_strip}
    merged: list[MarketTickerQuote] = []
    seen_codes: set[str] = set()

    for item in incoming_strip:
        seen_codes.add(item.code)
        previous = previous_by_code.get(item.code)
        if previous is None or item.price is not None:
            merged.append(item)
            continue
        merged.append(
            MarketTickerQuote(
                code=item.code,
                name=item.name or previous.name,
                price=previous.price,
                changePct=previous.changePct,
            )
        )

    for item in previous_strip:
        if item.code in seen_codes:
            continue
        merged.append(item)

    return merged


def _merge_home_market_payload(previous: HomeMarketPayload, incoming: HomeMarketPayload) -> HomeMarketPayload:
    series_codes = set(previous.seriesByCode.keys()) | set(incoming.seriesByCode.keys())
    merged_series = {
        code: _merge_single_series(code, previous.seriesByCode.get(code), incoming.seriesByCode.get(code))
        for code in series_codes
    }

    return HomeMarketPayload(
        updatedAt=incoming.updatedAt,
        tickerStrip=_merge_ticker_strip(previous.tickerStrip, incoming.tickerStrip),
        marketCards=_merge_card_lists(previous.marketCards, incoming.marketCards),
        importantCards=_merge_card_lists(previous.importantCards, incoming.importantCards),
        seriesByCode=merged_series,
    )


def _select_exact_usdcny_row(frame: pd.DataFrame) -> pd.Series | None:
    if frame.empty or '代码' not in frame.columns:
        return None
    code_series = frame['代码'].astype(str).str.upper()
    matches = frame.loc[code_series == 'USDCNYC']
    if matches.empty:
        return None
    return matches.iloc[0]


def _normalize_nhci_bundle(payload: dict[str, Any]) -> tuple[MarketCard, MarketSeries]:
    name, kind = MARKET_CARD_META['NHCI']
    source_note = str(payload.get('note') or INDEX_SOURCE_NOTE)
    raw_granularity = str(payload.get('granularity') or '').strip().lower()
    quote = payload.get('quote') if isinstance(payload.get('quote'), dict) else {}
    price = _safe_float(quote.get('price'))
    change = _safe_float(quote.get('change'))
    change_pct = _safe_float(quote.get('changePct'))

    raw_series = payload.get('series') if isinstance(payload.get('series'), list) else []
    points: list[MarketSeriesPoint] = []
    for item in raw_series:
        if not isinstance(item, dict):
            continue
        label = str(item.get('label') or item.get('time') or item.get('date') or '').strip()
        date_value = str(item.get('date') or '').strip()
        iso_time = str(item.get('isoTime') or '').strip()
        point_price = _safe_float(item.get('price'))
        point_volume = _safe_float(item.get('volume')) or 0.0
        if not label or point_price is None:
            continue
        if not iso_time:
            iso_time = f'{date_value}T00:00:00+08:00' if date_value else label
        points.append(
            MarketSeriesPoint(
                label=label,
                isoTime=iso_time,
                price=point_price,
                volume=point_volume,
            )
        )

    if price is None:
        card = _make_unavailable_card('NHCI', name, kind, '南华指数桥接暂不可用')
    else:
        card = MarketCard(
            code='NHCI',
            name=name,
            kind=kind,
            price=price,
            change=change,
            changePct=change_pct,
            note=source_note,
        )

    granularity = raw_granularity if raw_granularity in {'intraday', 'daily'} else ('daily' if points else 'none')
    series = MarketSeries(
        granularity=granularity,
        points=points,
        note=source_note if points else '南华商品指数曲线暂不可用',
    )
    return card, series


def _current_start_date(days_back: int = 540) -> str:
    today = datetime.now(SHANGHAI_TZ).date()
    return (today - timedelta(days=days_back)).strftime('%Y%m%d')


def _normalize_usdcny_incremental_rates(raw_payload: Any) -> dict[str, float]:
    rates = raw_payload.get('rates') if isinstance(raw_payload, dict) else {}
    if not isinstance(rates, dict):
        return {}

    parsed_rates: dict[str, float] = {}
    for key, value in rates.items():
        if not isinstance(key, str):
            continue
        date_key = key.strip()[:10]
        try:
            datetime.strptime(date_key, '%Y-%m-%d')
        except ValueError:
            continue
        parsed = _safe_float(value)
        if parsed is None:
            continue
        parsed_rates[date_key] = parsed

    return {day: parsed_rates[day] for day in sorted(parsed_rates.keys())}


def _parse_usdcny_incremental_parquet_payload(raw_payload: Any) -> dict[str, float]:
    if not isinstance(raw_payload, dict):
        return {}

    encoded = raw_payload.get('parquetBase64')
    if not isinstance(encoded, str) or not encoded.strip():
        return {}

    try:
        parquet_bytes = base64.b64decode(encoded)
        frame = pd.read_parquet(io.BytesIO(parquet_bytes))
    except Exception:
        return {}

    if frame.empty or not {'date', 'close'}.issubset(frame.columns):
        return {}

    parsed_rates: dict[str, float] = {}
    for _, row in frame.iterrows():
        day_text = str(row.get('date') or '').strip()[:10]
        try:
            datetime.strptime(day_text, '%Y-%m-%d')
        except ValueError:
            continue
        parsed = _safe_float(row.get('close'))
        if parsed is None:
            continue
        parsed_rates[day_text] = parsed

    return {day: parsed_rates[day] for day in sorted(parsed_rates.keys())}


def _build_usdcny_incremental_parquet_payload(rates: dict[str, float]) -> dict[str, Any]:
    recent_pairs = sorted(rates.items())[-USDCNY_INCREMENTAL_KEEP_DAYS:]
    frame = pd.DataFrame([{'date': day, 'close': rate} for day, rate in recent_pairs])
    parquet_buffer = io.BytesIO()
    frame.to_parquet(parquet_buffer, index=False)
    encoded = base64.b64encode(parquet_buffer.getvalue()).decode('ascii')
    return {
        'base': 'USD',
        'quote': 'CNY',
        'updatedAt': datetime.now(timezone.utc).isoformat(),
        'format': 'parquet',
        'schemaVersion': 1,
        'rows': len(recent_pairs),
        'parquetBase64': encoded,
    }


def _load_usdcny_incremental_rates() -> dict[str, float]:
    parquet_payload = shared_json_store.get_json(USDCNY_INCREMENTAL_PARQUET_KEY)
    if isinstance(parquet_payload, dict):
        normalized = _parse_usdcny_incremental_parquet_payload(parquet_payload)
        if normalized:
            return normalized

    # Backward compatibility: migrate legacy JSON payload to parquet in shared store.
    legacy_payload = shared_json_store.get_json(USDCNY_INCREMENTAL_KEY)
    if isinstance(legacy_payload, dict):
        normalized = _normalize_usdcny_incremental_rates(legacy_payload)
        if normalized:
            _save_usdcny_incremental_rates(normalized)
            return normalized
    return {}


def _save_usdcny_incremental_rates(rates: dict[str, float]) -> None:
    try:
        payload = _build_usdcny_incremental_parquet_payload(rates)
        shared_json_store.set_json(USDCNY_INCREMENTAL_PARQUET_KEY, payload)
    except Exception:
        pass


def _request_usdcny_incremental_rates(start_date: date, end_date: date) -> dict[str, float]:
    if start_date > end_date:
        return {}

    range_path = f'{start_date.isoformat()}..{end_date.isoformat()}'
    query = urllib.parse.urlencode({'from': 'USD', 'to': 'CNY'})
    url = f'https://api.frankfurter.app/{range_path}?{query}'
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/124.0.0.0 Safari/537.36'
        ),
        'Accept': 'application/json,text/plain,*/*',
    }

    payload: dict[str, Any] | None = None
    try:
        response = requests.get(url, headers=headers, timeout=8)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        request = urllib.request.Request(url=url, headers=headers)
        with urllib.request.urlopen(request, timeout=8) as response:  # noqa: S310
            payload = json.loads(response.read().decode('utf-8'))

    raw_rates = payload.get('rates') if isinstance(payload, dict) else {}
    if not isinstance(raw_rates, dict):
        return {}

    parsed_rates: dict[str, float] = {}
    for day_text, item in raw_rates.items():
        if not isinstance(day_text, str):
            continue
        rate_value = item.get('CNY') if isinstance(item, dict) else None
        parsed = _safe_float(rate_value)
        if parsed is None:
            continue
        parsed_rates[day_text[:10]] = parsed
    return parsed_rates


def _update_usdcny_incremental_rates() -> dict[str, float]:
    rates = _load_usdcny_incremental_rates()
    original_keys = set(rates.keys())
    today = datetime.now(SHANGHAI_TZ).date()

    last_date: date | None = None
    for key in sorted(rates.keys()):
        try:
            parsed = datetime.strptime(key, '%Y-%m-%d').date()
        except ValueError:
            continue
        if last_date is None or parsed > last_date:
            last_date = parsed

    if last_date is None:
        start = today - timedelta(days=USDCNY_INCREMENTAL_BOOTSTRAP_DAYS)
    else:
        start = last_date + timedelta(days=1)

    if start <= today:
        delta_rates = _request_usdcny_incremental_rates(start, today)
        if delta_rates:
            rates.update(delta_rates)

    trimmed_pairs = sorted(rates.items())[-USDCNY_INCREMENTAL_KEEP_DAYS:]
    trimmed_rates = {day: rate for day, rate in trimmed_pairs}
    if trimmed_rates.keys() != original_keys or trimmed_rates != rates:
        _save_usdcny_incremental_rates(trimmed_rates)

    return trimmed_rates


def _get_usdcny_incremental_daily() -> pd.DataFrame:
    return _cache.get_or_set(
        'usdcny_incremental_daily',
        300,
        lambda: pd.DataFrame(
            [
                {'date': day, 'close': price}
                for day, price in sorted(_update_usdcny_incremental_rates().items())
            ]
        ),
    )


def _get_sh_index_daily() -> pd.DataFrame:
    return _cache.get_or_set(
        'stock_zh_index_daily_em:sh000001',
        1800,
        lambda: _run_quietly(lambda: ak.stock_zh_index_daily_em(symbol='sh000001')),
    )


def _get_sh_index_daily_sina() -> pd.DataFrame:
    return _cache.get_or_set(
        'stock_zh_index_daily:sh000001',
        1800,
        lambda: _run_quietly(lambda: ak.stock_zh_index_daily(symbol='sh000001')),
    )


def _get_index_spot_sina() -> pd.DataFrame:
    return _cache.get_or_set(
        'stock_zh_index_spot_sina',
        60,
        lambda: _run_quietly(ak.stock_zh_index_spot_sina),
    )


def _get_bond_rates() -> pd.DataFrame:
    start_date = _current_start_date()
    return _cache.get_or_set(
        f'bond_zh_us_rate:{start_date}',
        1800,
        lambda: _run_quietly(lambda: ak.bond_zh_us_rate(start_date=start_date)),
    )


def _get_global_spot() -> pd.DataFrame:
    return _cache.get_or_set(
        'index_global_spot_em',
        60,
        lambda: _run_quietly(ak.index_global_spot_em),
    )


def _get_article_epu_china() -> pd.DataFrame:
    return _cache.get_or_set(
        'article_epu_index:China',
        1800,
        lambda: _run_quietly(lambda: ak.article_epu_index(symbol='China')),
    )


def _get_qvix_300etf() -> pd.DataFrame:
    return _cache.get_or_set(
        'index_option_300etf_qvix',
        300,
        lambda: _run_quietly(ak.index_option_300etf_qvix),
    )


def _get_forex_spot() -> pd.DataFrame:
    return _cache.get_or_set(
        'forex_spot_em',
        60,
        lambda: _run_quietly(ak.forex_spot_em),
    )


def _get_forex_hist() -> pd.DataFrame:
    return _cache.get_or_set(
        'forex_hist_em:USDCNYC',
        1800,
        lambda: _run_quietly(lambda: ak.forex_hist_em(symbol='USDCNYC')),
    )


def _get_boc_safe() -> pd.DataFrame:
    return _cache.get_or_set(
        'currency_boc_safe',
        1800,
        lambda: _run_quietly(ak.currency_boc_safe),
    )

def _get_shibor_all() -> pd.DataFrame:
    return _cache.get_or_set(
        'macro_china_shibor_all',
        1800,
        lambda: _run_quietly(ak.macro_china_shibor_all),
    )


def _get_china_lpr() -> pd.DataFrame:
    return _cache.get_or_set(
        'macro_china_lpr',
        1800,
        lambda: _run_quietly(ak.macro_china_lpr),
    )


def _get_xau_spot() -> pd.DataFrame:
    return _cache.get_or_set(
        'futures_foreign_commodity_realtime:XAU',
        60,
        lambda: _run_quietly(lambda: ak.futures_foreign_commodity_realtime(symbol='XAU')),
    )


def _get_stock_spot() -> pd.DataFrame:
    return _cache.get_or_set(
        'stock_zh_a_spot',
        30,
        lambda: _run_quietly(ak.stock_zh_a_spot),
    )


def _ticker_placeholder(code: str) -> MarketTickerQuote:
    return MarketTickerQuote(code=code, name=TICKER_NAME_BY_CODE[code])


def _normalize_stock_code(value: Any) -> str:
    text = str(value or '').strip()
    if not text:
        return ''

    digits = ''.join(char for char in text if char.isdigit())
    if len(digits) >= 6:
        return digits[-6:]
    return ''


def _build_ticker_strip_from_spot() -> list[MarketTickerQuote]:
    try:
        frame = _get_stock_spot().copy()
    except Exception:
        return []

    required_columns = {'代码', '名称', '最新价', '涨跌幅'}
    if frame.empty or not required_columns.issubset(frame.columns):
        return []

    frame['代码归一化'] = frame['代码'].map(_normalize_stock_code)
    frame = frame.loc[frame['代码归一化'].isin(TICKER_CODES)]
    if frame.empty:
        return []

    row_by_code: dict[str, pd.Series] = {}
    for _, row in frame.iterrows():
        normalized_code = str(row.get('代码归一化') or '')
        if not normalized_code or normalized_code in row_by_code:
            continue
        row_by_code[normalized_code] = row

    quotes: list[MarketTickerQuote] = []
    for code in TICKER_CODES:
        row = row_by_code.get(code)
        if row is None:
            quotes.append(_ticker_placeholder(code))
            continue
        quotes.append(
            MarketTickerQuote(
                code=code,
                name=str(row.get('名称') or TICKER_NAME_BY_CODE[code]),
                price=_safe_float(row.get('最新价')),
                changePct=_safe_float(row.get('涨跌幅')),
            )
        )

    return quotes


def _load_ticker_quote_from_daily(code: str) -> MarketTickerQuote:
    market_prefix = 'sh' if code.startswith(('6', '9')) else 'sz'
    try:
        frame = _run_quietly(lambda: ak.stock_zh_a_daily(symbol=f'{market_prefix}{code}', adjust=''))
    except Exception:
        return _ticker_placeholder(code)

    if frame.empty or 'close' not in frame.columns:
        return _ticker_placeholder(code)

    close_series = pd.to_numeric(frame['close'], errors='coerce').dropna()
    if close_series.empty:
        return _ticker_placeholder(code)

    latest = float(close_series.iloc[-1])
    previous = float(close_series.iloc[-2]) if len(close_series) >= 2 else latest
    change_pct = None
    if abs(previous) >= 1e-9:
        change_pct = (latest - previous) / previous * 100

    return MarketTickerQuote(
        code=code,
        name=TICKER_NAME_BY_CODE[code],
        price=latest,
        changePct=change_pct,
    )


def _get_ticker_quote_from_daily(code: str) -> MarketTickerQuote:
    return _cache.get_or_set(
        f'stock_zh_a_daily:{code}',
        300,
        lambda: _load_ticker_quote_from_daily(code),
    )


def _build_ticker_strip_from_daily() -> list[MarketTickerQuote]:
    quotes_by_code: dict[str, MarketTickerQuote] = {}
    try:
        with ThreadPoolExecutor(max_workers=min(len(TICKER_CODES), 8)) as executor:
            future_to_code = {
                executor.submit(_get_ticker_quote_from_daily, code): code for code in TICKER_CODES
            }
            try:
                for future in as_completed(future_to_code, timeout=6):
                    code = future_to_code[future]
                    try:
                        quotes_by_code[code] = future.result()
                    except Exception:
                        quotes_by_code[code] = _ticker_placeholder(code)
            except TimeoutError:
                pass

            for future, code in future_to_code.items():
                if code in quotes_by_code:
                    continue
                future.cancel()
                quotes_by_code[code] = _ticker_placeholder(code)
    except Exception:
        quotes_by_code = {}

    return [quotes_by_code.get(code, _ticker_placeholder(code)) for code in TICKER_CODES]


def _load_ticker_quote(code: str) -> MarketTickerQuote:
    market_prefix = 'SH' if code.startswith(('6', '9')) else 'SZ'
    try:
        frame = _run_quietly(lambda: ak.stock_individual_spot_xq(symbol=f'{market_prefix}{code}'))
    except Exception:
        return _ticker_placeholder(code)

    if frame.empty:
        return _ticker_placeholder(code)

    item_series = frame['item'].astype(str) if 'item' in frame.columns else pd.Series(dtype=str)
    raw_value_series = frame['value'] if 'value' in frame.columns else pd.Series(dtype=object)
    pairs = dict(zip(item_series.tolist(), raw_value_series.tolist(), strict=False))
    return MarketTickerQuote(
        code=code,
        name=str(pairs.get('名称') or TICKER_NAME_BY_CODE[code]),
        price=_safe_float(pairs.get('现价')),
        changePct=_safe_float(pairs.get('涨幅')),
    )


def _get_ticker_quote(code: str) -> MarketTickerQuote:
    return _cache.get_or_set(
        f'stock_individual_spot_xq:{code}',
        30,
        lambda: _load_ticker_quote(code),
    )


def _build_ticker_strip() -> list[MarketTickerQuote]:
    quotes_by_code: dict[str, MarketTickerQuote] = {}

    try:
        with ThreadPoolExecutor(max_workers=min(len(TICKER_CODES), 8)) as executor:
            future_to_code = {
                executor.submit(_get_ticker_quote, code): code for code in TICKER_CODES
            }
            try:
                for future in as_completed(future_to_code, timeout=4):
                    code = future_to_code[future]
                    try:
                        quotes_by_code[code] = future.result()
                    except Exception:
                        quotes_by_code[code] = _ticker_placeholder(code)
            except TimeoutError:
                pass

            for future, code in future_to_code.items():
                if code in quotes_by_code:
                    continue
                future.cancel()
                quotes_by_code[code] = _ticker_placeholder(code)
    except Exception:
        quotes_by_code = {}

    quotes = [quotes_by_code.get(code, _ticker_placeholder(code)) for code in TICKER_CODES]

    has_live_xq_quote = any(
        quote.price is not None and quote.changePct is not None
        for quote in quotes
    )
    if not has_live_xq_quote:
        fallback_quotes = _build_ticker_strip_from_spot()
        has_spot_quote = any(
            quote.price is not None and quote.changePct is not None
            for quote in fallback_quotes
        )
        if has_spot_quote:
            quotes = fallback_quotes
        else:
            daily_quotes = _build_ticker_strip_from_daily()
            has_daily_quote = any(
                quote.price is not None and quote.changePct is not None
                for quote in daily_quotes
            )
            if has_daily_quote:
                quotes = daily_quotes

    if not quotes:
        quotes = [_ticker_placeholder(code) for code in TICKER_CODES]

    quotes.sort(key=lambda item: abs(item.changePct or 0), reverse=True)
    return quotes


def _build_sse_card_and_series() -> tuple[MarketCard, MarketSeries]:
    name, kind = MARKET_CARD_META['000001']
    try:
        daily_frame = _get_sh_index_daily()
    except Exception:
        try:
            daily_frame = _get_sh_index_daily_sina()
        except Exception:
            return (
                _make_unavailable_card('000001', name, kind, '上证指数数据暂不可用'),
                _make_empty_series('上证指数曲线暂不可用'),
            )

    try:
        daily_points = _build_daily_points(daily_frame, 'date', 'close', volume_column='volume')
    except Exception:
        return (
            _make_unavailable_card('000001', name, kind, '上证指数数据暂不可用'),
            _make_empty_series('上证指数曲线暂不可用'),
        )

    try:
        spot = _get_index_spot_sina().copy()
        row = spot.loc[spot['代码'].astype(str) == 'sh000001'].iloc[0]
        card = MarketCard(
            code='000001',
            name=name,
            kind=kind,
            price=_safe_float(row.get('最新价')),
            change=_safe_float(row.get('涨跌额')),
            changePct=_safe_float(row.get('涨跌幅')),
            note=INDEX_SOURCE_NOTE,
        )
    except Exception:
        card = _build_card_from_series('000001', name, kind, daily_points, note=INDEX_SOURCE_NOTE)

    series = MarketSeries(
        granularity='daily' if daily_points else 'none',
        points=daily_points,
        note=INDEX_SOURCE_NOTE if daily_points else '上证指数曲线暂不可用',
    )
    return card, series


def _build_cn10y_card_and_series() -> tuple[MarketCard, MarketSeries]:
    name, kind = MARKET_CARD_META['CN10Y']
    try:
        points = _build_daily_points(_get_bond_rates(), '日期', '中国国债收益率10年')
    except Exception:
        return (
            _make_unavailable_card('CN10Y', name, kind, '中国10年期国债收益率暂不可用'),
            _make_empty_series('中国10年期国债收益率曲线暂不可用'),
        )

    card = _build_card_from_series('CN10Y', name, kind, points, note=RATE_SOURCE_NOTE)
    series = MarketSeries(
        granularity='daily' if points else 'none',
        points=points,
        note=RATE_SOURCE_NOTE if points else '中国10年期国债收益率曲线暂不可用',
    )
    return card, series


def _build_nhci_card_and_series() -> tuple[MarketCard, MarketSeries]:
    try:
        payload = _cache.get_or_set('nhci_bundle', 15, fetch_nhci_bundle)
        return _normalize_nhci_bundle(payload)
    except (NhciBridgeError, Exception):
        name, kind = MARKET_CARD_META['NHCI']
        return (
            _make_unavailable_card('NHCI', name, kind, '南华商品指数桥接暂不可用'),
            _make_empty_series('南华商品指数曲线暂不可用'),
        )


def _build_usdcny_points_from_forex_hist(frame: pd.DataFrame) -> list[MarketSeriesPoint]:
    if frame.empty:
        return []

    date_candidates = ['日期', 'date', 'Date', '交易日期', 'time', 'TRADE_DATE']
    value_candidates = ['收盘', '收盘价', 'close', 'Close', '最新价', 'price', '价格']

    date_column = next((column for column in date_candidates if column in frame.columns), None)
    value_column = next((column for column in value_candidates if column in frame.columns), None)

    if date_column is None or value_column is None:
        return []

    return _build_daily_points(frame, date_column, value_column)


def _build_usdcny_points_from_incremental(frame: pd.DataFrame) -> list[MarketSeriesPoint]:
    if frame.empty or not {'date', 'close'}.issubset(frame.columns):
        return []
    return _build_daily_points(frame, 'date', 'close')


def _build_usdcny_points_from_spot(frame: pd.DataFrame, *, limit: int = 60) -> list[MarketSeriesPoint]:
    if frame.empty or limit <= 1:
        return []

    row = _select_exact_usdcny_row(frame)
    if row is None and {'名称'}.issubset(frame.columns):
        by_name = frame.loc[frame['名称'].astype(str).str.contains('美元人民币', na=False)]
        if not by_name.empty:
            row = by_name.iloc[0]
    if row is None:
        return []

    latest = _safe_float(row.get('最新价'))
    previous = _safe_float(row.get('昨收'))
    if latest is None:
        return []

    anchor = previous if previous is not None else latest
    today = datetime.now(SHANGHAI_TZ).date()
    trading_days: list[date] = []
    cursor = today
    while len(trading_days) < limit:
        if cursor.weekday() < 5:
            trading_days.append(cursor)
        cursor -= timedelta(days=1)
    trading_days.reverse()

    points: list[MarketSeriesPoint] = []
    for index, day in enumerate(trading_days):
        price = latest if index == len(trading_days) - 1 else anchor
        iso_label = day.isoformat()
        points.append(
            MarketSeriesPoint(
                label=iso_label,
                isoTime=iso_label,
                price=price,
                volume=0.0,
            )
        )
    return points


def _clone_points(points: list[MarketSeriesPoint]) -> list[MarketSeriesPoint]:
    return [
        MarketSeriesPoint(
            label=point.label,
            isoTime=point.isoTime,
            price=point.price,
            volume=point.volume,
        )
        for point in points
    ]


def _extract_point_date(point: MarketSeriesPoint) -> date | None:
    for candidate in (point.label, point.isoTime):
        text = str(candidate or '').strip()
        if not text:
            continue
        date_text = text[:10]
        try:
            return datetime.strptime(date_text, '%Y-%m-%d').date()
        except ValueError:
            continue
    return None


def _latest_point_date(points: list[MarketSeriesPoint]) -> date | None:
    latest: date | None = None
    for point in points:
        parsed = _extract_point_date(point)
        if parsed is None:
            continue
        if latest is None or parsed > latest:
            latest = parsed
    return latest


def _is_recent_series(points: list[MarketSeriesPoint], max_age_days: int = USDCNY_MAX_SERIES_AGE_DAYS) -> bool:
    if not points:
        return False
    latest = _latest_point_date(points)
    if latest is None:
        return False
    age_days = (datetime.now(SHANGHAI_TZ).date() - latest).days
    return age_days <= max_age_days


def _build_recent_weekday_window(end_day: date, limit: int) -> list[date]:
    if limit <= 0:
        return []
    days: list[date] = []
    cursor = end_day
    while len(days) < limit:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor -= timedelta(days=1)
    days.reverse()
    return days


def _normalize_usdcny_daily_window(points: list[MarketSeriesPoint], limit: int = 60) -> list[MarketSeriesPoint]:
    if not points:
        return []

    by_day: dict[date, MarketSeriesPoint] = {}
    for point in points:
        parsed_day = _extract_point_date(point)
        if parsed_day is None:
            continue
        by_day[parsed_day] = MarketSeriesPoint(
            label=parsed_day.isoformat(),
            isoTime=parsed_day.isoformat(),
            price=point.price,
            volume=point.volume,
        )

    if not by_day:
        return []

    ordered_days = sorted(by_day.keys())
    if len(ordered_days) >= limit:
        recent_days = ordered_days[-limit:]
        return [by_day[day] for day in recent_days]

    window_days = _build_recent_weekday_window(ordered_days[-1], limit)
    carry_price = by_day[ordered_days[0]].price
    normalized: list[MarketSeriesPoint] = []
    for day in window_days:
        exact = by_day.get(day)
        if exact is not None:
            carry_price = exact.price
            normalized.append(exact)
            continue
        iso_text = day.isoformat()
        normalized.append(
            MarketSeriesPoint(
                label=iso_text,
                isoTime=iso_text,
                price=carry_price,
                volume=0.0,
            )
        )
    return normalized


_last_usdcny_series_points: list[MarketSeriesPoint] = []


def _build_usdcny_card_and_series() -> tuple[MarketCard, MarketSeries]:
    global _last_usdcny_series_points

    name, kind = MARKET_CARD_META['USDCNY']
    points: list[MarketSeriesPoint] = []
    series_note = FX_SOURCE_NOTE

    try:
        frame = _get_boc_safe().copy()
    except Exception:
        frame = pd.DataFrame()

    if not frame.empty and '美元' in frame.columns:
        frame['USD/CNY'] = pd.to_numeric(frame['美元'], errors='coerce') / 100
        points = _build_daily_points(frame, '日期', 'USD/CNY')
        if points and not _is_recent_series(points):
            points = []
        elif points and len(points) < USDCNY_INCREMENTAL_KEEP_DAYS:
            try:
                incremental_points = _build_usdcny_points_from_incremental(_get_usdcny_incremental_daily().copy())
                if incremental_points and _is_recent_series(incremental_points):
                    points = incremental_points
                    series_note = '近60个交易日日线（增量提取）'
            except Exception:
                pass

    if not points:
        try:
            points = _build_usdcny_points_from_forex_hist(_get_forex_hist().copy())
            if points and not _is_recent_series(points):
                points = []
            elif points and len(points) < USDCNY_INCREMENTAL_KEEP_DAYS:
                try:
                    incremental_points = _build_usdcny_points_from_incremental(_get_usdcny_incremental_daily().copy())
                    if incremental_points and _is_recent_series(incremental_points):
                        points = incremental_points
                        series_note = '近60个交易日日线（增量提取）'
                except Exception:
                    pass
        except Exception:
            points = []

    if not points:
        try:
            points = _build_usdcny_points_from_incremental(_get_usdcny_incremental_daily().copy())
            if points and not _is_recent_series(points):
                points = []
            if points:
                series_note = '近60个交易日日线（增量提取）'
        except Exception:
            points = []

    if not points and _last_usdcny_series_points and _is_recent_series(_last_usdcny_series_points):
        points = _clone_points(_last_usdcny_series_points)
        series_note = '使用最近一次可用USDCNY缓存曲线'

    if not points:
        return (
            _make_unavailable_card('USDCNY', name, kind, '美元人民币日线暂不可用'),
            _make_empty_series('USDCNY 曲线暂不可用'),
        )

    points = _normalize_usdcny_daily_window(
        points,
        limit=_series_limit_for('USDCNY', 'daily'),
    )

    _last_usdcny_series_points = _clone_points(points)

    card = _build_card_from_series('USDCNY', name, kind, points, note=series_note)
    if card.price is None or card.change is None or card.changePct is None:
        card = _make_unavailable_card('USDCNY', name, kind, '美元人民币日线暂不可用')

    series = MarketSeries(
        granularity='daily' if points else 'none',
        points=points,
        note=series_note if points else 'USDCNY 曲线暂不可用',
    )
    return card, series


def _build_epu_card() -> MarketCard:
    name, kind = IMPORTANT_CARD_META['CHINA_EPU']
    try:
        frame = _get_article_epu_china().copy()
    except Exception:
        return _make_unavailable_card('CHINA_EPU', name, kind, '国家和地区指数暂不可用')

    if frame.empty or not {'year', 'month', 'China_Policy_Index'}.issubset(frame.columns):
        return _make_unavailable_card('CHINA_EPU', name, kind, '国家和地区指数暂不可用')

    frame['日期'] = pd.to_datetime(
        dict(year=pd.to_numeric(frame['year'], errors='coerce'), month=pd.to_numeric(frame['month'], errors='coerce'), day=1),
        errors='coerce',
    )
    points = _build_daily_points(frame, '日期', 'China_Policy_Index')
    return _build_card_from_series('CHINA_EPU', name, kind, points, note=INDEX_SOURCE_NOTE)


def _build_qvix_300etf_card() -> MarketCard:
    name, kind = IMPORTANT_CARD_META['QVIX300ETF']
    try:
        points = _build_daily_points(_get_qvix_300etf(), 'date', 'close')
    except Exception:
        return _make_unavailable_card('QVIX300ETF', name, kind, '300ETF期权波动率暂不可用')
    return _build_card_from_series('QVIX300ETF', name, kind, points, note=INDEX_SOURCE_NOTE)


def _build_shibor_card() -> MarketCard:
    name, kind = IMPORTANT_CARD_META['SHIBOR']
    try:
        points = _build_daily_points(_get_shibor_all(), '日期', '3M-定价')
    except Exception:
        return _make_unavailable_card('SHIBOR', name, kind, 'Shibor 暂不可用')
    return _build_card_from_series('SHIBOR', name, kind, points, note=RATE_SOURCE_NOTE)


def _build_lpr_card() -> MarketCard:
    name, kind = IMPORTANT_CARD_META['LPR']

    try:
        frame = _get_china_lpr().copy()
    except Exception:
        return _make_unavailable_card('LPR', name, kind, 'LPR 暂不可用')

    if frame.empty or 'TRADE_DATE' not in frame.columns:
        return _make_unavailable_card('LPR', name, kind, 'LPR 暂不可用')

    value_column = None
    if 'LPR5Y' in frame.columns:
        value_column = 'LPR5Y'
    elif 'RATE_2' in frame.columns:
        value_column = 'RATE_2'

    if not value_column:
        return _make_unavailable_card('LPR', name, kind, 'LPR 暂不可用')

    points = _build_daily_points(frame, 'TRADE_DATE', value_column)
    return _build_card_from_series('LPR', name, kind, points, note=RATE_SOURCE_NOTE)


def _build_home_market_payload_uncached() -> HomeMarketPayload:
    market_cards: list[MarketCard] = []
    series_by_code: dict[str, MarketSeries] = {}

    sse_card, sse_series = _build_sse_card_and_series()
    market_cards.append(sse_card)
    series_by_code['000001'] = sse_series

    cn10y_card, cn10y_series = _build_cn10y_card_and_series()
    market_cards.append(cn10y_card)
    series_by_code['CN10Y'] = cn10y_series

    nhci_card, nhci_series = _build_nhci_card_and_series()
    market_cards.append(nhci_card)
    series_by_code['NHCI'] = nhci_series

    usdcny_card, usdcny_series = _build_usdcny_card_and_series()
    market_cards.append(usdcny_card)
    series_by_code['USDCNY'] = usdcny_series

    important_cards = [
        _build_epu_card(),
        _build_qvix_300etf_card(),
        _build_shibor_card(),
        _build_lpr_card(),
    ]

    return HomeMarketPayload(
        updatedAt=datetime.now(timezone.utc),
        tickerStrip=_build_ticker_strip(),
        marketCards=market_cards,
        importantCards=important_cards,
        seriesByCode=series_by_code,
    )


def _build_home_market_payload_placeholder() -> HomeMarketPayload:
    market_cards = [
        _make_unavailable_card(code, name, kind, '行情预热中')
        for code, (name, kind) in MARKET_CARD_META.items()
    ]
    series_by_code = {
        code: _make_empty_series('行情预热中')
        for code in MARKET_CARD_META.keys()
    }
    important_cards = [
        _make_unavailable_card(code, name, kind, '行情预热中')
        for code, (name, kind) in IMPORTANT_CARD_META.items()
    ]

    return HomeMarketPayload(
        updatedAt=datetime.now(timezone.utc),
        tickerStrip=[_ticker_placeholder(code) for code in TICKER_CODES],
        marketCards=market_cards,
        importantCards=important_cards,
        seriesByCode=series_by_code,
    )


def _persist_home_market_payload(payload: HomeMarketPayload) -> None:
    try:
        serialized = payload.model_dump(mode='json')
        shared_json_store.set_json(HOME_MARKET_SNAPSHOT_KEY, serialized)
    except Exception:
        pass


def _load_home_market_payload_from_store() -> HomeMarketPayload | None:
    shared_payload = shared_json_store.get_json(HOME_MARKET_SNAPSHOT_KEY)
    if isinstance(shared_payload, dict):
        try:
            return HomeMarketPayload.model_validate(shared_payload)
        except Exception:
            pass
    return None


def _set_home_market_snapshot(payload: HomeMarketPayload) -> None:
    global _home_payload_snapshot, _home_payload_refreshed_at

    with _home_payload_lock:
        if _home_payload_snapshot is not None:
            payload = _merge_home_market_payload(_home_payload_snapshot, payload)
        _home_payload_snapshot = payload
        _home_payload_refreshed_at = monotonic()
    _home_payload_ready_event.set()
    _persist_home_market_payload(payload)


def _refresh_home_market_snapshot_once() -> bool:
    global _home_payload_refreshing

    with _home_payload_lock:
        if _home_payload_refreshing:
            return False
        _home_payload_refreshing = True

    try:
        payload = _build_home_market_payload_uncached()
    except Exception:
        return False
    finally:
        with _home_payload_lock:
            _home_payload_refreshing = False

    _set_home_market_snapshot(payload)
    return True


def _schedule_home_market_refresh() -> None:
    with _home_payload_lock:
        if _home_payload_refreshing:
            return

    thread = threading.Thread(
        target=_refresh_home_market_snapshot_once,
        name='home-market-refresh',
        daemon=True,
    )
    thread.start()


def _home_market_prefetch_loop() -> None:
    _refresh_home_market_snapshot_once()
    while not _home_payload_prefetch_stop_event.wait(HOME_PAYLOAD_PREFETCH_INTERVAL_SECONDS):
        _refresh_home_market_snapshot_once()


def start_home_market_prefetcher() -> None:
    global _home_payload_prefetch_thread

    stored_snapshot = _load_home_market_payload_from_store()
    if stored_snapshot is not None:
        _set_home_market_snapshot(stored_snapshot)

    with _home_payload_lock:
        if _home_payload_prefetch_thread and _home_payload_prefetch_thread.is_alive():
            return
        _home_payload_prefetch_stop_event.clear()
        _home_payload_prefetch_thread = threading.Thread(
            target=_home_market_prefetch_loop,
            name='home-market-prefetch',
            daemon=True,
        )
        _home_payload_prefetch_thread.start()


def stop_home_market_prefetcher() -> None:
    global _home_payload_prefetch_thread

    _home_payload_prefetch_stop_event.set()
    thread = _home_payload_prefetch_thread
    if thread and thread.is_alive():
        thread.join(timeout=1.5)
    _home_payload_prefetch_thread = None


def get_home_market_payload() -> HomeMarketPayload:
    with _home_payload_lock:
        snapshot = _home_payload_snapshot
        refreshed_at = _home_payload_refreshed_at

    if snapshot is not None:
        if monotonic() - refreshed_at >= HOME_PAYLOAD_STALE_SECONDS:
            _schedule_home_market_refresh()
        return snapshot

    _schedule_home_market_refresh()
    if _home_payload_ready_event.wait(timeout=HOME_PAYLOAD_COLD_WAIT_SECONDS):
        with _home_payload_lock:
            snapshot = _home_payload_snapshot
        if snapshot is not None:
            return snapshot

    stored_snapshot = _load_home_market_payload_from_store()
    if stored_snapshot is not None:
        _set_home_market_snapshot(stored_snapshot)
        return stored_snapshot

    return _build_home_market_payload_placeholder()
