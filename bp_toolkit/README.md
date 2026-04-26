# BP Toolkit

这个文件夹现在是自包含的，可单独迁移。

## 最少依赖

只依赖：

- Python 3.10+
- `pandas`
- `numpy`

不再依赖：

- `vector_frame.vectorbt_runner`
- `vectorbt`
- 其他项目内部模块

## 文件

- `bp_metrics.py`
  - 核心运算逻辑
- `run_bp_from_csv.py`
  - 文件入口脚本
- `__init__.py`

## 功能

### 1. 从持仓和收益率变化计算 BP 收益

```python
from bp_metrics import compute_daily_bp_from_position, compute_bp_performance
```

### 2. 从信号和收益率序列一步计算

```python
from bp_metrics import compute_bp_performance_from_signal_and_yield
```

### 3. 直接从 CSV 文件跑

```python
python run_bp_from_csv.py --signals signals.csv --yields yields.csv --output-dir out
```

## BP 口径

当前实现沿用你项目里的非复利 BP 口径：

```python
daily_bp = position * (-delta_yield_bp) - trade_fee_bp
nav = 1 + cumulative_bp / 10000
```

说明：

- `daily_bp`：每日策略收益，单位 `bp`
- `cumulative_bp`：每日 `bp` 线性累加
- `nav`：非复利虚拟净值
- `sharpe`：先用 `nav.pct_change()` 得到日收益率，再做年化收益 / 年化波动
- `max_drawdown_bp`：按净值比例回撤计算后，再换算成 `bp`

## 用法 1：直接调用函数

```python
import pandas as pd

from bp_metrics import compute_bp_performance_from_signal_and_yield

idx = pd.to_datetime(["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"])
signal = pd.Series([1, 1, -1, -1], index=idx)
yield_series = pd.Series([5.00, 4.99, 5.02, 5.01], index=idx)

result = compute_bp_performance_from_signal_and_yield(
    signal=signal,
    yield_series=yield_series,
    fee_bps_per_side=2.0,
    stop_loss_bp=2.0,
    execution_delay_bars=1,
)

print(result.performance.cumulative_return_bp)
print(result.performance.sharpe)
print(result.performance.max_drawdown_bp)
```

## 用法 2：直接跑脚本

```bash
python run_bp_from_csv.py ^
  --signals C:\path\to\signals.csv ^
  --yields C:\path\to\yield.csv ^
  --output-dir C:\path\to\bp_result ^
  --signal-col 最终信号 ^
  --yield-date-col date ^
  --yield-col yield ^
  --fee-bps-per-side 0 ^
  --stop-loss-bp 2 ^
  --execution-delay-bars 1 ^
  --external-stop-col bp_stop_loss_triggered
```

输出文件：

- `bp_metrics_summary.csv`
- `bp_metrics_daily.csv`
- `bp_metrics_diagnostics.csv`

## 参数说明

- `execution_delay_bars=0`
  - 表示 `T日收盘成交`
  - 但损益从下一天开始算
- `execution_delay_bars=1`
  - 表示 `T+1日收盘成交`
  - 损益从再下一天开始算
- `external_stop_loss_triggered`
  - 可传一个 `0/1` 序列
  - 为 `1` 的那天，单日损失会被截到 `-stop_loss_bp`

## 迁移建议

如果你要把这个文件夹迁到别的系统，最少带走：

- `bp_toolkit/bp_metrics.py`
- `bp_toolkit/run_bp_from_csv.py`
- `bp_toolkit/README.md`

如果对方系统不需要包结构，甚至可以只保留：

- `bp_metrics.py`
- `run_bp_from_csv.py`

这两个文件就能跑。
