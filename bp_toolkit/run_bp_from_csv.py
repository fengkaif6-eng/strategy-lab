from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

try:
    from .bp_metrics import compute_bp_performance_from_signal_and_yield
except ImportError:  # pragma: no cover
    from bp_metrics import compute_bp_performance_from_signal_and_yield


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run non-compound BP performance from signals.csv and yield.csv.",
    )
    parser.add_argument("--signals", required=True, help="Path to signals.csv")
    parser.add_argument("--yields", required=True, help="Path to yield csv")
    parser.add_argument("--output-dir", required=True, help="Directory for output csv files")
    parser.add_argument("--signal-date-col", default=None, help="Signal date column, default: first column")
    parser.add_argument("--signal-col", default="signal", help="Signal column name")
    parser.add_argument("--yield-date-col", default="date", help="Yield date column name")
    parser.add_argument("--yield-col", default="yield", help="Yield level column name")
    parser.add_argument("--signal-name", default="signal", help="Signal name tag")
    parser.add_argument("--fee-bps-per-side", type=float, default=0.0, help="Fee in bp per side")
    parser.add_argument("--stop-loss-bp", type=float, default=None, help="Daily stop loss in bp")
    parser.add_argument(
        "--execution-delay-bars",
        type=int,
        default=1,
        help="Execution delay in trading bars: 0 = T-day, 1 = T+1, 2 = T+2, ...",
    )
    parser.add_argument(
        "--external-stop-col",
        default=None,
        help="Optional 0/1 stop trigger column in signals.csv",
    )
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV encoding")
    args = parser.parse_args()

    signals_path = Path(args.signals)
    yields_path = Path(args.yields)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    signals = pd.read_csv(signals_path, encoding=args.encoding)
    yields = pd.read_csv(yields_path, encoding=args.encoding)

    signal_date_col = args.signal_date_col or str(signals.columns[0])
    required_signal_cols = [signal_date_col, args.signal_col]
    if args.external_stop_col is not None:
        required_signal_cols.append(args.external_stop_col)
    _validate_columns(signals, required_signal_cols, frame_name="signals.csv")
    _validate_columns(yields, [args.yield_date_col, args.yield_col], frame_name="yield csv")

    signal = pd.Series(
        pd.to_numeric(signals[args.signal_col], errors="raise").to_numpy(),
        index=pd.to_datetime(signals[signal_date_col], errors="raise"),
        name=args.signal_name,
    )
    yield_series = pd.Series(
        pd.to_numeric(yields[args.yield_col], errors="raise").to_numpy(),
        index=pd.to_datetime(yields[args.yield_date_col], errors="raise"),
        name=args.yield_col,
    )
    external_stop = None
    if args.external_stop_col is not None:
        external_stop = pd.Series(
            pd.to_numeric(signals[args.external_stop_col], errors="raise").to_numpy(),
            index=pd.to_datetime(signals[signal_date_col], errors="raise"),
            name=args.external_stop_col,
        )

    result = compute_bp_performance_from_signal_and_yield(
        signal=signal,
        yield_series=yield_series,
        signal_name=args.signal_name,
        fee_bps_per_side=args.fee_bps_per_side,
        stop_loss_bp=args.stop_loss_bp,
        execution_delay_bars=args.execution_delay_bars,
        external_stop_loss_triggered=external_stop,
    )

    summary = pd.DataFrame(
        [
            {
                "signal_name": args.signal_name,
                "signals_path": str(signals_path.resolve()),
                "yields_path": str(yields_path.resolve()),
                "execution_delay_bars": args.execution_delay_bars,
                "fee_bps_per_side": args.fee_bps_per_side,
                "stop_loss_bp": args.stop_loss_bp,
                "cumulative_return_bp": result.performance.cumulative_return_bp,
                "annual_return_bp": result.performance.annual_return_bp,
                "annual_vol_bp": result.performance.annual_vol_bp,
                "sharpe": result.performance.sharpe,
                "max_drawdown_ratio": result.performance.max_drawdown_ratio,
                "max_drawdown_bp": result.performance.max_drawdown_bp,
            }
        ]
    )
    daily = pd.DataFrame(
        {
            "date": result.performance.daily_bp.index,
            "daily_bp": result.performance.daily_bp.to_numpy(dtype=float),
            "nav": result.performance.nav.to_numpy(dtype=float),
            "returns": result.performance.returns.to_numpy(dtype=float),
            "cumulative_bp": result.performance.cumulative_bp.to_numpy(dtype=float),
            "drawdown_ratio": result.performance.drawdown_ratio.to_numpy(dtype=float),
            "drawdown_bp": result.performance.drawdown_bp.to_numpy(dtype=float),
        }
    )

    summary.to_csv(output_dir / "bp_metrics_summary.csv", index=False, encoding=args.encoding)
    daily.to_csv(output_dir / "bp_metrics_daily.csv", index=False, encoding=args.encoding)
    result.diagnostics.to_csv(output_dir / "bp_metrics_diagnostics.csv", index=False, encoding=args.encoding)

    print(f"summary: {(output_dir / 'bp_metrics_summary.csv').resolve()}")
    print(f"daily: {(output_dir / 'bp_metrics_daily.csv').resolve()}")
    print(f"diagnostics: {(output_dir / 'bp_metrics_diagnostics.csv').resolve()}")


def _validate_columns(frame: pd.DataFrame, columns: list[str], *, frame_name: str) -> None:
    missing = [col for col in columns if col not in frame.columns]
    if missing:
        missing_text = ", ".join(missing)
        raise ValueError(f"{frame_name} is missing required columns: {missing_text}")


if __name__ == "__main__":
    main()
