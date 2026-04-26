from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

SIGNAL_BP_DIAGNOSTIC_COLUMNS = [
    "date",
    "signal",
    "mapped_signal",
    "position",
    "yield",
    "delta_yield",
    "delta_yield_bp",
    "asset_return",
    "turnover",
    "trade_fee_bp",
    "strategy_daily_bp_exact",
    "strategy_daily_bp_after_fee",
    "strategy_cum_bp_after_fee",
    "strategy_nav_exact",
    "stop_loss_triggered",
    "strategy_drawdown_bp",
    "stop_loss_active",
    "reentry_confirmed",
]


@dataclass(slots=True)
class BpPerformance:
    daily_bp: pd.Series
    nav: pd.Series
    returns: pd.Series
    cumulative_bp: pd.Series
    drawdown_ratio: pd.Series
    drawdown_bp: pd.Series
    cumulative_return_bp: float
    annual_return_bp: float
    annual_vol_bp: float
    sharpe: float
    max_drawdown_ratio: float
    max_drawdown_bp: float


@dataclass(slots=True)
class BpSignalPerformance:
    performance: BpPerformance
    diagnostics: pd.DataFrame


def compute_daily_bp_from_position(
    *,
    position: pd.Series,
    delta_yield_bp: pd.Series,
    trade_fee_bp: pd.Series | float | None = None,
) -> pd.Series:
    aligned_position = _to_datetime_series(position, name="position")
    aligned_delta_yield_bp = _to_datetime_series(delta_yield_bp, name="delta_yield_bp")
    idx = aligned_position.index.intersection(aligned_delta_yield_bp.index).sort_values()
    if len(idx) == 0:
        return pd.Series(dtype=float, name="daily_bp")

    fee_bp = _coerce_fee_series(trade_fee_bp, idx)
    daily_bp = (
        aligned_position.reindex(idx).astype(float) * (-aligned_delta_yield_bp.reindex(idx).astype(float))
        - fee_bp
    ).astype(float)
    daily_bp.name = "daily_bp"
    return daily_bp


def compute_bp_performance(
    daily_bp: pd.Series,
    *,
    initial_nav: float = 1.0,
    periods_per_year: int = 252,
) -> BpPerformance:
    daily_bp_series = _to_datetime_series(daily_bp, name="daily_bp").astype(float)
    if daily_bp_series.empty:
        empty = pd.Series(dtype=float)
        return BpPerformance(
            daily_bp=daily_bp_series,
            nav=empty.rename("nav"),
            returns=empty.rename("returns"),
            cumulative_bp=empty.rename("cumulative_bp"),
            drawdown_ratio=empty.rename("drawdown_ratio"),
            drawdown_bp=empty.rename("drawdown_bp"),
            cumulative_return_bp=float("nan"),
            annual_return_bp=float("nan"),
            annual_vol_bp=float("nan"),
            sharpe=float("nan"),
            max_drawdown_ratio=float("nan"),
            max_drawdown_bp=float("nan"),
        )

    cumulative_bp = daily_bp_series.cumsum().rename("cumulative_bp")
    nav = (float(initial_nav) + cumulative_bp / 10000.0).rename("nav")
    returns = nav.pct_change().fillna(0.0).rename("returns")

    peak_nav = nav.cummax()
    drawdown_ratio = (nav / peak_nav - 1.0).rename("drawdown_ratio")
    peak_cumulative_bp = cumulative_bp.cummax()
    drawdown_bp = (peak_cumulative_bp - cumulative_bp).rename("drawdown_bp")

    mean_ret = float(returns.mean())
    vol = float(returns.std(ddof=0))
    annual_return = (1.0 + mean_ret) ** periods_per_year - 1.0
    annual_vol = vol * np.sqrt(periods_per_year)
    sharpe = annual_return / annual_vol if annual_vol > 0 else float("nan")
    max_drawdown_ratio = float(drawdown_ratio.min())
    max_drawdown_bp = float(max_drawdown_ratio * 10000.0)

    return BpPerformance(
        daily_bp=daily_bp_series,
        nav=nav,
        returns=returns,
        cumulative_bp=cumulative_bp,
        drawdown_ratio=drawdown_ratio,
        drawdown_bp=drawdown_bp,
        cumulative_return_bp=float(cumulative_bp.iloc[-1]),
        annual_return_bp=float(annual_return * 10000.0),
        annual_vol_bp=float(annual_vol * 10000.0),
        sharpe=float(sharpe),
        max_drawdown_ratio=max_drawdown_ratio,
        max_drawdown_bp=max_drawdown_bp,
    )


def compute_bp_performance_from_signal_and_yield(
    *,
    signal: pd.Series,
    yield_series: pd.Series,
    signal_name: str = "signal",
    fee_bps_per_side: float = 0.0,
    stop_loss_bp: float | None = None,
    execution_delay_bars: int = 1,
    external_stop_loss_triggered: pd.Series | None = None,
    periods_per_year: int = 252,
) -> BpSignalPerformance:
    diagnostics = _build_signal_bp_diagnostics(
        signal=signal,
        yield_series=yield_series,
        signal_name=signal_name,
        fee_bps_per_side=fee_bps_per_side,
        stop_loss_bp=stop_loss_bp,
        execution_delay_bars=execution_delay_bars,
        external_stop_loss_triggered=external_stop_loss_triggered,
    )
    performance = compute_bp_performance(
        diagnostics.set_index("date")["strategy_daily_bp_after_fee"],
        periods_per_year=periods_per_year,
    )
    return BpSignalPerformance(
        performance=performance,
        diagnostics=diagnostics,
    )


def _build_signal_bp_diagnostics(
    *,
    signal: pd.Series,
    yield_series: pd.Series,
    signal_name: str,
    fee_bps_per_side: float,
    stop_loss_bp: float | None,
    execution_delay_bars: int,
    external_stop_loss_triggered: pd.Series | None,
) -> pd.DataFrame:
    normalized_signal = _to_datetime_series(signal, name=str(signal_name)).astype(float)
    normalized_yield = _to_datetime_series(yield_series, name="yield").astype(float)
    _validate_signal_values(normalized_signal)

    aligned_index = normalized_signal.index.intersection(normalized_yield.index).sort_values()
    if len(aligned_index) == 0:
        raise ValueError("signal and yield_series have no overlapping dates")

    signal_aligned = normalized_signal.reindex(aligned_index).astype(float)
    yields_aligned = normalized_yield.reindex(aligned_index).astype(float)
    mapped_signal = signal_aligned.replace({-1.0: 0.0, 1.0: 1.0})

    delta_yield = yields_aligned.diff().fillna(0.0).astype(float)
    delta_yield_bp = (delta_yield * 100.0).astype(float)
    asset_returns = (-delta_yield_bp / 10000.0).astype(float)

    external_stop_aligned = None
    if external_stop_loss_triggered is not None:
        external_stop_aligned = _to_datetime_series(
            external_stop_loss_triggered,
            name="external_stop_loss_triggered",
        ).reindex(aligned_index).fillna(0.0).astype(float)
        invalid_external_stop = external_stop_aligned[~external_stop_aligned.isin([0.0, 1.0])]
        if not invalid_external_stop.empty:
            examples = [
                {"date": pd.Timestamp(idx).isoformat(), "external_stop_loss_triggered": float(val)}
                for idx, val in invalid_external_stop.head(5).items()
            ]
            raise ValueError(
                "external_stop_loss_triggered must contain only 0 or 1. "
                f"Examples: {examples}"
            )

    (
        effective_mapped_signal,
        _execution_position,
        position,
        turnover_daily,
        trade_fee_bp,
        strategy_daily_bp_exact,
        strategy_daily_bp_after_fee,
        strategy_cum_bp_after_fee,
        strategy_nav_exact,
        stop_loss_triggered,
        strategy_drawdown_bp,
        stop_loss_active,
        reentry_confirmed,
    ) = _build_signal_path_with_stop_loss(
        mapped_signal=mapped_signal,
        delta_yield_bp=delta_yield_bp,
        fee_bps_per_side=fee_bps_per_side,
        stop_loss_bp=stop_loss_bp,
        execution_delay_bars=execution_delay_bars,
        external_stop_loss_triggered=external_stop_aligned,
    )

    return pd.DataFrame(
        {
            "date": aligned_index,
            "signal": signal_aligned.to_numpy(dtype=float),
            "mapped_signal": effective_mapped_signal.to_numpy(dtype=float),
            "position": position.to_numpy(dtype=float),
            "yield": yields_aligned.to_numpy(dtype=float),
            "delta_yield": delta_yield.to_numpy(dtype=float),
            "delta_yield_bp": delta_yield_bp.to_numpy(dtype=float),
            "asset_return": asset_returns.to_numpy(dtype=float),
            "turnover": turnover_daily.to_numpy(dtype=float),
            "trade_fee_bp": trade_fee_bp.to_numpy(dtype=float),
            "strategy_daily_bp_exact": strategy_daily_bp_exact.to_numpy(dtype=float),
            "strategy_daily_bp_after_fee": strategy_daily_bp_after_fee.to_numpy(dtype=float),
            "strategy_cum_bp_after_fee": strategy_cum_bp_after_fee.to_numpy(dtype=float),
            "strategy_nav_exact": strategy_nav_exact.to_numpy(dtype=float),
            "stop_loss_triggered": stop_loss_triggered.to_numpy(dtype=float),
            "strategy_drawdown_bp": strategy_drawdown_bp.to_numpy(dtype=float),
            "stop_loss_active": stop_loss_active.to_numpy(dtype=float),
            "reentry_confirmed": reentry_confirmed.to_numpy(dtype=float),
        },
        columns=SIGNAL_BP_DIAGNOSTIC_COLUMNS,
    )


def _build_signal_path_with_stop_loss(
    *,
    mapped_signal: pd.Series,
    delta_yield_bp: pd.Series,
    fee_bps_per_side: float,
    stop_loss_bp: float | None,
    execution_delay_bars: int,
    external_stop_loss_triggered: pd.Series | None = None,
) -> tuple[
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
    pd.Series,
]:
    if stop_loss_bp is not None and stop_loss_bp <= 0.0:
        raise ValueError("signal_stop_loss_bp must be positive when provided")
    if execution_delay_bars < 0:
        raise ValueError("execution_delay_bars must be a non-negative integer")

    idx = mapped_signal.index
    raw_signal = mapped_signal.astype(float)
    delta_bp = delta_yield_bp.astype(float)
    external_stop = None
    if external_stop_loss_triggered is not None:
        external_stop = external_stop_loss_triggered.reindex(idx).fillna(0.0).astype(float)

    effective_signal = pd.Series(0.0, index=idx, name="mapped_signal")
    execution_position = pd.Series(0.0, index=idx, name="execution_position")
    position = pd.Series(0.0, index=idx, name="position")
    turnover_daily = pd.Series(0.0, index=idx, name="turnover")
    trade_fee_bp = pd.Series(0.0, index=idx, name="trade_fee_bp")
    strategy_daily_bp_exact = pd.Series(0.0, index=idx, name="strategy_daily_bp_exact")
    strategy_daily_bp_after_fee = pd.Series(0.0, index=idx, name="strategy_daily_bp_after_fee")
    strategy_cum_bp_after_fee = pd.Series(0.0, index=idx, name="strategy_cum_bp_after_fee")
    strategy_nav_exact = pd.Series(1.0, index=idx, name="strategy_nav_exact")
    stop_loss_triggered = pd.Series(0.0, index=idx, name="stop_loss_triggered")
    strategy_drawdown_bp = pd.Series(0.0, index=idx, name="strategy_drawdown_bp")
    stop_loss_active = pd.Series(0.0, index=idx, name="stop_loss_active")
    reentry_confirmed = pd.Series(0.0, index=idx, name="reentry_confirmed")

    prev_execution_position = 0.0
    pending_signals = [0.0] * int(execution_delay_bars)
    cumulative_bp = 0.0
    peak_cumulative_bp = 0.0
    stop_locked = False
    flat_seen_since_stop = False

    for dt in idx:
        desired_signal = float(raw_signal.loc[dt])
        external_stop_today = external_stop is not None and float(external_stop.loc[dt]) == 1.0
        reentry_on_bar = 0.0
        stop_executed_today = False
        if external_stop is not None:
            scheduled_signal = 0.0 if external_stop_today else desired_signal
        else:
            (
                scheduled_signal,
                stop_locked,
                flat_seen_since_stop,
                reentry_on_bar,
            ) = _resolve_effective_signal_with_stop(
                desired_signal=desired_signal,
                stop_locked=stop_locked,
                flat_seen_since_stop=flat_seen_since_stop,
            )

        effective_signal.loc[dt] = float(scheduled_signal)
        if execution_delay_bars == 0:
            current_execution_position = float(scheduled_signal)
        else:
            current_execution_position = float(pending_signals.pop(0))
            pending_signals.append(float(scheduled_signal))

        live_position = float(prev_execution_position)
        execution_position.loc[dt] = current_execution_position
        position.loc[dt] = live_position

        current_turnover = abs(current_execution_position - prev_execution_position)
        turnover_daily.loc[dt] = current_turnover
        current_fee_bp = current_turnover * float(fee_bps_per_side)
        trade_fee_bp.loc[dt] = current_fee_bp

        current_daily_bp_exact = live_position * (-float(delta_bp.loc[dt]))
        strategy_daily_bp_exact.loc[dt] = current_daily_bp_exact

        current_daily_bp_after_fee = current_daily_bp_exact - current_fee_bp
        if stop_loss_bp is not None:
            if external_stop_today:
                current_daily_bp_after_fee = -float(stop_loss_bp)
                stop_loss_triggered.loc[dt] = 1.0
                stop_executed_today = True
                current_execution_position = 0.0
            elif current_daily_bp_after_fee < -float(stop_loss_bp):
                current_daily_bp_after_fee = -float(stop_loss_bp)
                stop_loss_triggered.loc[dt] = 1.0
                stop_locked = True
                flat_seen_since_stop = False
                stop_executed_today = True
                current_execution_position = 0.0

        cumulative_bp += current_daily_bp_after_fee
        strategy_daily_bp_after_fee.loc[dt] = current_daily_bp_after_fee
        strategy_cum_bp_after_fee.loc[dt] = cumulative_bp
        peak_cumulative_bp = max(peak_cumulative_bp, cumulative_bp)
        strategy_drawdown_bp.loc[dt] = max(0.0, peak_cumulative_bp - cumulative_bp)
        strategy_nav_exact.loc[dt] = 1.0 + cumulative_bp / 10000.0

        if stop_executed_today:
            execution_position.loc[dt] = 0.0
            if execution_delay_bars > 0:
                pending_signals = [0.0] * int(execution_delay_bars)
        if stop_executed_today:
            effective_signal.loc[dt] = 0.0

        stop_loss_active.loc[dt] = 1.0 if stop_locked else 0.0
        reentry_confirmed.loc[dt] = reentry_on_bar
        prev_execution_position = 0.0 if stop_executed_today else current_execution_position

    return (
        effective_signal,
        execution_position,
        position,
        turnover_daily,
        trade_fee_bp,
        strategy_daily_bp_exact,
        strategy_daily_bp_after_fee,
        strategy_cum_bp_after_fee,
        strategy_nav_exact,
        stop_loss_triggered,
        strategy_drawdown_bp,
        stop_loss_active,
        reentry_confirmed,
    )


def _resolve_effective_signal_with_stop(
    *,
    desired_signal: float,
    stop_locked: bool,
    flat_seen_since_stop: bool,
) -> tuple[float, bool, bool, float]:
    if stop_locked:
        if flat_seen_since_stop and desired_signal > 0.0:
            return float(desired_signal), False, False, 1.0
        return 0.0, True, (flat_seen_since_stop or desired_signal <= 0.0), 0.0
    return float(desired_signal), False, flat_seen_since_stop, 0.0


def _validate_signal_values(signal: pd.Series) -> None:
    invalid_signal = signal[~signal.isin([-1.0, 1.0])]
    if invalid_signal.empty:
        return
    examples = [
        {"date": pd.Timestamp(idx).isoformat(), "signal": float(val)}
        for idx, val in invalid_signal.head(5).items()
    ]
    raise ValueError(f"signal must contain only -1 or 1. Examples: {examples}")


def _to_datetime_series(series: pd.Series, *, name: str) -> pd.Series:
    out = pd.Series(series.to_numpy(), index=pd.to_datetime(series.index), name=name)
    out = out.sort_index()
    return out


def _coerce_fee_series(
    trade_fee_bp: pd.Series | float | None,
    idx: pd.DatetimeIndex,
) -> pd.Series:
    if trade_fee_bp is None:
        return pd.Series(0.0, index=idx, name="trade_fee_bp")
    if np.isscalar(trade_fee_bp):
        return pd.Series(float(trade_fee_bp), index=idx, name="trade_fee_bp")
    fee_series = _to_datetime_series(trade_fee_bp, name="trade_fee_bp")
    return fee_series.reindex(idx).fillna(0.0).astype(float)
