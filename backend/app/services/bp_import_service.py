from __future__ import annotations

import math
import re
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd

from bp_toolkit.bp_metrics import compute_bp_performance_from_signal_and_yield

SUPPORTED_BP_EXTENSIONS = {'.csv', '.xlsx'}
_CSV_ENCODINGS = ('utf-8-sig', 'utf-8', 'gb18030', 'gbk')
_EPSILON = 1e-12
_FIELD_ALIASES = {
    'signalDateCol': ['date', '日期', '交易日', '时间', 'datetime'],
    'signalCol': ['signal', '最终信号', '交易信号', '信号'],
    'yieldDateCol': ['date', '日期', '交易日', '时间', 'datetime'],
    'yieldCol': ['yield', '收益率', '到期收益率', '收益率(%)', '收益率（%）'],
    'externalStopCol': ['bp_stop_loss_triggered', 'stop_loss_triggered', '外部止损', '止损触发'],
}
_GENERIC_DATE_ALIASES = ['date', '日期', '交易日', '时间', 'datetime', '指标名称']


def import_bp_performance(
    *,
    signal_content: bytes,
    signal_filename: str,
    yield_content: bytes,
    yield_filename: str,
    signal_date_col: str | None = None,
    signal_col: str = 'signal',
    yield_date_col: str = 'date',
    yield_col: str = 'yield',
    signal_name: str = 'signal',
    fee_bps_per_side: float = 0.0,
    stop_loss_bp: float | None = None,
    execution_delay_bars: int = 1,
    external_stop_col: str | None = None,
) -> dict[str, Any]:
    if int(execution_delay_bars) < 0:
        raise ValueError('execution_delay_bars must be a non-negative integer')

    signals = _read_table_frame(signal_content, signal_filename, file_label='signals')
    yields = _read_table_frame(yield_content, yield_filename, file_label='yields')

    signal_date_key = _resolve_column_name(
        signals,
        signal_date_col,
        fallback_first_column=True,
        file_label='signals',
        field_label='signalDateCol',
        alias_candidates=_FIELD_ALIASES['signalDateCol'],
    )
    signal_key = _resolve_column_name(
        signals,
        signal_col,
        fallback_first_column=False,
        file_label='signals',
        field_label='signalCol',
        alias_candidates=_FIELD_ALIASES['signalCol'],
    )
    yield_date_key = _resolve_column_name(
        yields,
        yield_date_col,
        fallback_first_column=False,
        file_label='yields',
        field_label='yieldDateCol',
        alias_candidates=_FIELD_ALIASES['yieldDateCol'],
    )
    yield_key = _resolve_column_name(
        yields,
        yield_col,
        fallback_first_column=False,
        file_label='yields',
        field_label='yieldCol',
        alias_candidates=_FIELD_ALIASES['yieldCol'],
    )
    external_stop_key = (
        _resolve_column_name(
            signals,
            external_stop_col,
            fallback_first_column=False,
            file_label='signals',
            field_label='externalStopCol',
            alias_candidates=_FIELD_ALIASES['externalStopCol'],
        )
        if external_stop_col and external_stop_col.strip()
        else None
    )

    signal_series = _build_numeric_series(
        signals,
        date_column=signal_date_key,
        value_column=signal_key,
        series_name=signal_name.strip() or 'signal',
        file_label='signals',
    )
    yield_series = _build_numeric_series(
        yields,
        date_column=yield_date_key,
        value_column=yield_key,
        series_name=yield_key,
        file_label='yields',
    )

    external_stop_series = None
    if external_stop_key:
        external_stop_series = _build_numeric_series(
            signals,
            date_column=signal_date_key,
            value_column=external_stop_key,
            series_name=external_stop_key,
            file_label='signals',
        )

    try:
        result = compute_bp_performance_from_signal_and_yield(
            signal=signal_series,
            yield_series=yield_series,
            signal_name=signal_name.strip() or 'signal',
            fee_bps_per_side=float(fee_bps_per_side),
            stop_loss_bp=float(stop_loss_bp) if stop_loss_bp is not None else None,
            execution_delay_bars=int(execution_delay_bars),
            external_stop_loss_triggered=external_stop_series,
        )
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    daily = result.performance.daily_bp.sort_index()
    nav = result.performance.nav.sort_index()
    returns = result.performance.returns.sort_index()
    drawdown_ratio = result.performance.drawdown_ratio.sort_index()
    diagnostics = result.diagnostics.sort_values('date').reset_index(drop=True)
    summary_frame = _build_summary_frame(
        result=result,
        signal_filename=signal_filename,
        yield_filename=yield_filename,
        signal_name=signal_name.strip() or 'signal',
        fee_bps_per_side=fee_bps_per_side,
        stop_loss_bp=stop_loss_bp,
        execution_delay_bars=execution_delay_bars,
    )
    daily_frame = _build_daily_frame(result)

    monthly_returns = _build_monthly_returns(returns)
    running_days = _calculate_running_days(nav.index)
    turnover_sum = _extract_turnover_sum(diagnostics)
    position_max = _extract_position_max(diagnostics)

    win_rate = _calculate_win_rate(daily)
    monthly_win_rate = _calculate_monthly_win_rate(monthly_returns)

    return {
        'equityCurve': [
            {'date': _format_date(index), 'value': _round_to(float(value))}
            for index, value in nav.items()
        ],
        'drawdownCurve': [
            {'date': _format_date(index), 'value': _round_to(float(value))}
            for index, value in drawdown_ratio.items()
        ],
        'monthlyReturns': monthly_returns,
        'metrics': {
            'annualReturn': _round_to(result.performance.annual_return_bp / 10000.0),
            'sharpe': _round_to(_finite_or_zero(result.performance.sharpe)),
            'maxDrawdown': _round_to(_finite_or_zero(result.performance.max_drawdown_ratio)),
            'winRate': None if win_rate is None else _round_to(win_rate),
            'tradeCount': max(0, int(round(turnover_sum))),
            'volatility': _round_to(result.performance.annual_vol_bp / 10000.0),
            'totalReturn': _round_to(result.performance.cumulative_return_bp / 10000.0),
            'startDate': _format_date(nav.index[0]),
            'alpha': 0.0,
            'runningDays': running_days,
            'positionCount': max(0, int(round(position_max))),
            'monthlyWinRate': None if monthly_win_rate is None else _round_to(monthly_win_rate),
            'performanceMode': 'bp',
            'cumulativeReturnBp': _round_to(result.performance.cumulative_return_bp),
            'maxDrawdownBp': _round_to(_finite_or_zero(result.performance.max_drawdown_bp)),
        },
        'observations': int(len(nav)),
        'sourceType': 'bp',
        'bpExports': [
            {
                'filename': 'bp_metrics_summary.csv',
                'label': '下载汇总结果',
                'content': summary_frame.to_csv(index=False),
            },
            {
                'filename': 'bp_metrics_daily.csv',
                'label': '下载日度结果',
                'content': daily_frame.to_csv(index=False),
            },
            {
                'filename': 'bp_metrics_diagnostics.csv',
                'label': '下载诊断明细',
                'content': diagnostics.to_csv(index=False),
            },
        ],
    }


def _read_table_frame(content: bytes, filename: str, *, file_label: str) -> pd.DataFrame:
    extension = Path(filename or '').suffix.lower()
    if extension not in SUPPORTED_BP_EXTENSIONS:
        allowed = ', '.join(sorted(SUPPORTED_BP_EXTENSIONS))
        raise ValueError(f'{file_label} file only supports {allowed}.')
    if not content:
        raise ValueError(f'{file_label} file is empty.')

    if extension == '.xlsx':
        try:
            raw_frame = pd.read_excel(BytesIO(content), header=None)
            frame = _normalize_xlsx_frame(raw_frame)
        except Exception as exc:  # pragma: no cover
            raise ValueError(f'{file_label} xlsx file could not be parsed.') from exc
    else:
        last_error: Exception | None = None
        for encoding in _CSV_ENCODINGS:
            try:
                frame = pd.read_csv(BytesIO(content), encoding=encoding)
                break
            except UnicodeDecodeError as exc:
                last_error = exc
        else:
            raise ValueError(
                f'{file_label} csv encoding is not supported. Please use UTF-8 or GBK.'
            ) from last_error

    if frame.empty:
        raise ValueError(f'{file_label} file has no data rows.')
    if len(frame.columns) == 0:
        raise ValueError(f'{file_label} file is missing a header row.')
    return frame


def _normalize_header_name(value: str) -> str:
    return re.sub(r'[\s_\-/.]+', '', value.strip().lower())


def _normalize_xlsx_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame

    header_row_index = _find_header_row_index(frame)
    if header_row_index is None:
        return frame

    header_row = frame.iloc[header_row_index].tolist()
    columns = [str(item).strip() if pd.notna(item) else '' for item in header_row]
    data_start_index = header_row_index + 1
    while data_start_index < len(frame) - 1:
        current_first_value = frame.iloc[data_start_index, 0]
        next_first_value = frame.iloc[data_start_index + 1, 0]
        if _should_skip_pre_data_row(current_first_value, next_first_value):
            data_start_index += 1
            continue
        break

    normalized_columns = []
    for index, column in enumerate(columns):
        if index == 0 and _normalize_header_name(column) in {
            _normalize_header_name(alias) for alias in _GENERIC_DATE_ALIASES
        }:
            normalized_columns.append('date')
        else:
            normalized_columns.append(column or f'column_{index}')

    normalized = frame.iloc[data_start_index:].copy()
    normalized.columns = normalized_columns
    normalized = normalized.dropna(how='all')
    normalized = normalized.reset_index(drop=True)
    return normalized


def _should_skip_pre_data_row(current_first_value: Any, next_first_value: Any) -> bool:
    normalized_current = (
        _normalize_header_name(str(current_first_value))
        if pd.notna(current_first_value)
        else ''
    )
    if normalized_current in {'指标id', 'metricid', 'seriesid'}:
        return True
    return (
        not _looks_like_date_value(current_first_value)
        and _looks_like_date_value(next_first_value)
    )


def _looks_like_date_value(value: Any) -> bool:
    if pd.isna(value):
        return False
    try:
        parsed = pd.to_datetime([value], errors='coerce')
    except Exception:
        return False
    return bool(pd.notna(parsed[0]))


def _find_header_row_index(frame: pd.DataFrame) -> int | None:
    limit = min(len(frame), 10)
    normalized_aliases = {_normalize_header_name(alias) for alias in _GENERIC_DATE_ALIASES}
    for row_index in range(limit):
        row = frame.iloc[row_index].tolist()
        texts = [
            _normalize_header_name(str(item))
            for item in row
            if pd.notna(item) and str(item).strip()
        ]
        if not texts:
            continue
        if any(text in normalized_aliases for text in texts):
            return row_index
    return None


def _resolve_column_name(
    frame: pd.DataFrame,
    requested: str | None,
    *,
    fallback_first_column: bool,
    file_label: str,
    field_label: str,
    alias_candidates: list[str] | None = None,
) -> str:
    columns = [str(column) for column in frame.columns]
    if fallback_first_column and (requested is None or not requested.strip()):
        return columns[0]

    target = (requested or '').strip()
    if not target:
        raise ValueError(f'{file_label} is missing required config: {field_label}.')

    if target in columns:
        return target

    normalized_target = _normalize_header_name(target)
    normalized_columns = {_normalize_header_name(column): column for column in columns}

    if field_label in {'signalDateCol', 'yieldDateCol'} and columns:
        first_column = columns[0]
        normalized_first_column = _normalize_header_name(first_column)
        if re.fullmatch(r'column\d+', normalized_target) and normalized_target.endswith('0'):
            if normalized_first_column.startswith('unnamed:') or normalized_first_column in {
                _normalize_header_name(alias) for alias in _GENERIC_DATE_ALIASES
            }:
                return first_column

    matched = normalized_columns.get(normalized_target)
    if matched:
        return matched

    if alias_candidates:
        for alias in alias_candidates:
            matched_alias = normalized_columns.get(_normalize_header_name(alias))
            if matched_alias:
                return matched_alias

    available = ', '.join(columns)
    raise ValueError(
        f'{file_label} file is missing column `{target}`. Available columns: {available}'
    )


def _build_numeric_series(
    frame: pd.DataFrame,
    *,
    date_column: str,
    value_column: str,
    series_name: str,
    file_label: str,
) -> pd.Series:
    working_frame = _trim_trailing_note_rows(frame, date_column=date_column, value_column=value_column)

    try:
        dates = pd.to_datetime(working_frame[date_column], errors='raise')
    except Exception as exc:  # pragma: no cover
        raise ValueError(
            f'{file_label} column `{date_column}` contains invalid dates.'
        ) from exc

    if bool(dates.isna().any()):
        raise ValueError(f'{file_label} column `{date_column}` contains empty dates.')
    if bool(dates.duplicated().any()):
        duplicates = ', '.join(
            dates[dates.duplicated()].dt.strftime('%Y-%m-%d').drop_duplicates().tolist()[:5]
        )
        raise ValueError(f'{file_label} file has duplicate dates: {duplicates}')

    try:
        values = pd.to_numeric(working_frame[value_column], errors='raise')
    except Exception as exc:  # pragma: no cover
        raise ValueError(
            f'{file_label} column `{value_column}` contains non-numeric values.'
        ) from exc

    if bool(values.isna().any()):
        raise ValueError(f'{file_label} column `{value_column}` contains empty values.')

    return pd.Series(values.to_numpy(dtype=float), index=dates, name=series_name).sort_index()


def _trim_trailing_note_rows(
    frame: pd.DataFrame,
    *,
    date_column: str,
    value_column: str,
) -> pd.DataFrame:
    trimmed = frame[[date_column, value_column]].copy()
    while not trimmed.empty:
        last_row = trimmed.iloc[-1]
        if _looks_like_date_value(last_row[date_column]):
            break
        if _is_effectively_empty(last_row[value_column]):
            trimmed = trimmed.iloc[:-1].copy()
            continue
        break
    return trimmed


def _is_effectively_empty(value: Any) -> bool:
    if pd.isna(value):
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _build_monthly_returns(returns: pd.Series) -> list[dict[str, Any]]:
    if returns.empty:
        return []

    grouped = returns.groupby(returns.index.to_period('M'))
    monthly_returns: list[dict[str, Any]] = []
    for period, series in grouped:
        compounded = float((1.0 + series.astype(float)).prod() - 1.0)
        monthly_returns.append({'month': str(period), 'return': _round_to(compounded)})
    return monthly_returns


def _build_summary_frame(
    *,
    result: Any,
    signal_filename: str,
    yield_filename: str,
    signal_name: str,
    fee_bps_per_side: float,
    stop_loss_bp: float | None,
    execution_delay_bars: int,
) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                'signal_name': signal_name,
                'signals_path': signal_filename,
                'yields_path': yield_filename,
                'execution_delay_bars': int(execution_delay_bars),
                'fee_bps_per_side': float(fee_bps_per_side),
                'stop_loss_bp': stop_loss_bp,
                'cumulative_return_bp': result.performance.cumulative_return_bp,
                'annual_return_bp': result.performance.annual_return_bp,
                'annual_vol_bp': result.performance.annual_vol_bp,
                'sharpe': result.performance.sharpe,
                'max_drawdown_ratio': result.performance.max_drawdown_ratio,
                'max_drawdown_bp': result.performance.max_drawdown_bp,
            }
        ]
    )


def _build_daily_frame(result: Any) -> pd.DataFrame:
    return pd.DataFrame(
        {
            'date': result.performance.daily_bp.index.map(_format_date),
            'daily_bp': result.performance.daily_bp.to_numpy(dtype=float),
            'nav': result.performance.nav.to_numpy(dtype=float),
            'returns': result.performance.returns.to_numpy(dtype=float),
            'cumulative_bp': result.performance.cumulative_bp.to_numpy(dtype=float),
            'drawdown_ratio': result.performance.drawdown_ratio.to_numpy(dtype=float),
            'drawdown_bp': result.performance.drawdown_bp.to_numpy(dtype=float),
        }
    )


def _calculate_running_days(index: pd.Index) -> int:
    if len(index) <= 1:
        return 1
    first = pd.Timestamp(index[0])
    last = pd.Timestamp(index[-1])
    return max(1, int((last - first).days) + 1)


def _extract_turnover_sum(diagnostics: pd.DataFrame) -> float:
    if 'turnover' not in diagnostics:
        return 0.0
    series = pd.to_numeric(diagnostics['turnover'], errors='coerce').fillna(0.0)
    return float(series.sum())


def _extract_position_max(diagnostics: pd.DataFrame) -> float:
    if diagnostics.empty or 'position' not in diagnostics:
        return 0.0
    series = pd.to_numeric(diagnostics['position'], errors='coerce').fillna(0.0)
    return float(series.abs().max())


def _calculate_win_rate(daily_bp: pd.Series) -> float | None:
    if daily_bp.empty:
        return None
    effective = daily_bp[~daily_bp.abs().le(_EPSILON)]
    if effective.empty:
        return None
    return float((effective > 0).sum() / len(effective))


def _calculate_monthly_win_rate(monthly_returns: list[dict[str, Any]]) -> float | None:
    if not monthly_returns:
        return None
    effective = [
        item['return']
        for item in monthly_returns
        if isinstance(item.get('return'), (int, float)) and abs(float(item['return'])) > _EPSILON
    ]
    if not effective:
        return None
    positive_count = sum(1 for value in effective if float(value) > 0)
    return positive_count / len(effective)


def _round_to(value: float, digits: int = 6) -> float:
    if not math.isfinite(value):
        return 0.0
    return float(round(value, digits))


def _finite_or_zero(value: float) -> float:
    return float(value) if math.isfinite(value) else 0.0


def _format_date(value: Any) -> str:
    return pd.Timestamp(value).strftime('%Y-%m-%d')
