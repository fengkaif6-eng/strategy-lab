import unittest

import pandas as pd
from io import BytesIO

from backend.app.services.bp_import_service import import_bp_performance
from bp_toolkit.bp_metrics import compute_bp_performance_from_signal_and_yield


class BpImportServiceTest(unittest.TestCase):
    def test_import_bp_performance_accepts_column_0_for_unnamed_first_date_column(self) -> None:
        signal_csv = '\n'.join(
            [
                ',signal',
                '2024-01-02,1',
                '2024-01-03,-1',
            ]
        ).encode('utf-8')
        yield_csv = '\n'.join(
            [
                'date,yield',
                '2024-01-02,5.0',
                '2024-01-03,4.99',
            ]
        ).encode('utf-8')

        imported = import_bp_performance(
            signal_content=signal_csv,
            signal_filename='signals.csv',
            yield_content=yield_csv,
            yield_filename='yields.csv',
            signal_date_col='column_0',
        )

        self.assertEqual(imported['observations'], 2)
        self.assertEqual(imported['metrics']['startDate'], '2024-01-02')

    def test_import_bp_performance_maps_summary_and_curves(self) -> None:
        signal_csv = '\n'.join(
            [
                'date,signal',
                '2024-01-02,1',
                '2024-01-03,1',
                '2024-01-04,-1',
                '2024-01-05,-1',
            ]
        ).encode('utf-8')
        yield_csv = '\n'.join(
            [
                'date,yield',
                '2024-01-02,5.0',
                '2024-01-03,4.99',
                '2024-01-04,5.02',
                '2024-01-05,5.01',
            ]
        ).encode('utf-8')

        imported = import_bp_performance(
            signal_content=signal_csv,
            signal_filename='signals.csv',
            yield_content=yield_csv,
            yield_filename='yields.csv',
        )

        self.assertEqual(imported['sourceType'], 'bp')
        self.assertEqual(imported['observations'], 4)
        self.assertEqual(imported['metrics']['tradeCount'], 2)
        self.assertAlmostEqual(imported['metrics']['totalReturn'], -0.0002, places=6)
        self.assertAlmostEqual(imported['metrics']['maxDrawdown'], -0.0003, places=6)
        self.assertAlmostEqual(imported['metrics']['winRate'], 0.5, places=6)
        self.assertEqual(imported['metrics']['startDate'], '2024-01-02')
        self.assertEqual(imported['equityCurve'][0]['date'], '2024-01-02')
        self.assertAlmostEqual(imported['equityCurve'][-1]['value'], 0.9998, places=6)
        self.assertAlmostEqual(imported['monthlyReturns'][0]['return'], -0.0002, places=6)
        self.assertEqual(len(imported['bpExports']), 3)
        self.assertEqual(imported['bpExports'][0]['filename'], 'bp_metrics_summary.csv')

    def test_import_bp_performance_rejects_duplicate_dates(self) -> None:
        signal_csv = '\n'.join(
            [
                'date,signal',
                '2024-01-02,1',
                '2024-01-02,-1',
            ]
        ).encode('utf-8')
        yield_csv = '\n'.join(
            [
                'date,yield',
                '2024-01-02,5.0',
                '2024-01-03,4.99',
            ]
        ).encode('utf-8')

        with self.assertRaisesRegex(ValueError, 'duplicate dates'):
            import_bp_performance(
                signal_content=signal_csv,
                signal_filename='signals.csv',
                yield_content=yield_csv,
                yield_filename='yields.csv',
            )

    def test_execution_delay_supports_t_plus_n(self) -> None:
        index = pd.to_datetime(
            ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08']
        )
        signal = pd.Series([1, 1, 1, 1, 1], index=index)
        yield_series = pd.Series([5.00, 4.99, 4.98, 4.97, 4.96], index=index)

        result = compute_bp_performance_from_signal_and_yield(
            signal=signal,
            yield_series=yield_series,
            execution_delay_bars=2,
        )

        self.assertEqual(
            result.performance.daily_bp.round(6).tolist(),
            [-0.0, 0.0, 0.0, 1.0, 1.0],
        )
        self.assertAlmostEqual(result.performance.cumulative_return_bp, 2.0, places=6)

    def test_import_bp_performance_supports_xlsx_inputs(self) -> None:
        signal_frame = pd.DataFrame(
            {
                'date': ['2024-01-02', '2024-01-03', '2024-01-04'],
                'signal': [1, 1, 1],
            }
        )
        yield_frame = pd.DataFrame(
            {
                'date': ['2024-01-02', '2024-01-03', '2024-01-04'],
                'yield': [5.00, 4.99, 4.98],
            }
        )
        signal_buffer = BytesIO()
        yield_buffer = BytesIO()
        signal_frame.to_excel(signal_buffer, index=False)
        yield_frame.to_excel(yield_buffer, index=False)

        imported = import_bp_performance(
            signal_content=signal_buffer.getvalue(),
            signal_filename='signals.xlsx',
            yield_content=yield_buffer.getvalue(),
            yield_filename='yields.xlsx',
        )

        self.assertEqual(imported['sourceType'], 'bp')
        self.assertEqual(imported['observations'], 3)
        self.assertEqual(imported['metrics']['startDate'], '2024-01-02')

    def test_import_bp_performance_auto_matches_chinese_alias_columns(self) -> None:
        signal_csv = '\n'.join(
            [
                '日期,最终信号,bp_stop_loss_triggered',
                '2024-01-02,1,0',
                '2024-01-03,1,0',
                '2024-01-04,-1,0',
            ]
        ).encode('utf-8')
        yield_frame = pd.DataFrame(
            {
                '日期': ['2024-01-02', '2024-01-03', '2024-01-04'],
                '到期收益率': [5.00, 4.99, 5.01],
            }
        )
        yield_buffer = BytesIO()
        yield_frame.to_excel(yield_buffer, index=False)

        imported = import_bp_performance(
            signal_content=signal_csv,
            signal_filename='signals.csv',
            yield_content=yield_buffer.getvalue(),
            yield_filename='yields.xlsx',
        )

        self.assertEqual(imported['observations'], 3)
        self.assertEqual(imported['metrics']['startDate'], '2024-01-02')
        self.assertIn('bpExports', imported)

    def test_import_bp_performance_supports_title_header_indicatorid_xlsx(self) -> None:
        signal_csv = '\n'.join(
            [
                '日期,最终信号',
                '2024-01-02,1',
                '2024-01-03,1',
                '2024-01-04,-1',
            ]
        ).encode('utf-8')
        yield_frame = pd.DataFrame(
            [
                ['利率走势数据', None, None],
                ['指标名称', '中债商业银行无固定期限资本债(行权)收益率曲线(AAA-):1年', '中债商业银行无固定期限资本债(行权)收益率曲线(AAA-):3年'],
                ['指标ID', 'E1707254', 'E1707256'],
                ['2024-01-02', 2.9757, 3.3270],
                ['2024-01-03', 2.9557, 3.3087],
                ['2024-01-04', 2.9437, 3.2892],
            ]
        )
        yield_buffer = BytesIO()
        yield_frame.to_excel(yield_buffer, index=False, header=False)

        imported = import_bp_performance(
            signal_content=signal_csv,
            signal_filename='signals.csv',
            yield_content=yield_buffer.getvalue(),
            yield_filename='yields.xlsx',
            yield_col='中债商业银行无固定期限资本债(行权)收益率曲线(AAA-):1年',
        )

        self.assertEqual(imported['observations'], 3)
        self.assertEqual(imported['metrics']['startDate'], '2024-01-02')

    def test_import_bp_performance_skips_non_date_pre_data_row(self) -> None:
        signal_csv = '\n'.join(
            [
                'date,signal',
                '2024-01-02,1',
                '2024-01-03,1',
                '2024-01-04,-1',
            ]
        ).encode('utf-8')
        yield_frame = pd.DataFrame(
            [
                ['title', None],
                ['date', 'yield'],
                ['说明行', 'ignore'],
                ['2024-01-02', 2.9757],
                ['2024-01-03', 2.9557],
                ['2024-01-04', 2.9437],
            ]
        )
        yield_buffer = BytesIO()
        yield_frame.to_excel(yield_buffer, index=False, header=False)

        imported = import_bp_performance(
            signal_content=signal_csv,
            signal_filename='signals.csv',
            yield_content=yield_buffer.getvalue(),
            yield_filename='yields.xlsx',
        )

        self.assertEqual(imported['observations'], 3)
        self.assertEqual(imported['metrics']['startDate'], '2024-01-02')

    def test_import_bp_performance_skips_trailing_source_note_row(self) -> None:
        signal_csv = '\n'.join(
            [
                'date,signal',
                '2024-01-02,1',
                '2024-01-03,1',
                '2024-01-04,-1',
            ]
        ).encode('utf-8')
        yield_frame = pd.DataFrame(
            [
                ['title', None],
                ['date', 'yield'],
                ['2024-01-02', 2.9757],
                ['2024-01-03', 2.9557],
                ['2024-01-04', 2.9437],
                ['数据来源：妙想Choice', None],
            ]
        )
        yield_buffer = BytesIO()
        yield_frame.to_excel(yield_buffer, index=False, header=False)

        imported = import_bp_performance(
            signal_content=signal_csv,
            signal_filename='signals.csv',
            yield_content=yield_buffer.getvalue(),
            yield_filename='yields.xlsx',
        )

        self.assertEqual(imported['observations'], 3)
        self.assertEqual(imported['metrics']['startDate'], '2024-01-02')


if __name__ == '__main__':
    unittest.main()
