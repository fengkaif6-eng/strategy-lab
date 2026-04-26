import json
import unittest
from unittest.mock import patch

import pandas as pd

from backend.app.schemas import MarketSeriesPoint
from backend.app.services import market_service, nhci_bridge


class MarketServiceHelpersTest(unittest.TestCase):
    def test_ttl_cache_returns_stale_value_when_refresh_fails(self) -> None:
        cache = market_service.TTLCache()

        self.assertEqual(cache.get_or_set('demo', 0, lambda: 1), 1)
        self.assertEqual(cache.get_or_set('demo', 0, lambda: (_ for _ in ()).throw(RuntimeError('boom'))), 1)

    def test_build_daily_points_sorts_and_limits(self) -> None:
        frame = pd.DataFrame(
            {
                '日期': ['2026-03-03', '2026-03-01', '2026-03-02'],
                '值': [3.0, 1.0, 2.0],
                '成交量': [30, 10, 20],
            }
        )

        points = market_service._build_daily_points(frame, '日期', '值', volume_column='成交量', limit=2)

        self.assertEqual([point.label for point in points], ['2026-03-02', '2026-03-03'])
        self.assertEqual(points[0].volume, 20.0)
        self.assertEqual(points[1].price, 3.0)

    def test_build_card_from_series_computes_change(self) -> None:
        points = [
            MarketSeriesPoint(label='2026-03-24', isoTime='2026-03-24', price=1.8),
            MarketSeriesPoint(label='2026-03-25', isoTime='2026-03-25', price=2.0),
        ]

        card = market_service._build_card_from_series('CN10Y', '中国10年期国债收益率', 'rate', points)

        self.assertAlmostEqual(card.price or 0, 2.0)
        self.assertAlmostEqual(card.change or 0, 0.2)
        self.assertAlmostEqual(card.changePct or 0, 11.111111, places=5)

    def test_merge_single_series_rolls_window_by_profile_limit(self) -> None:
        previous = market_service.MarketSeries(
            granularity='daily',
            points=[
                MarketSeriesPoint(
                    label=(pd.Timestamp('2026-01-01') + pd.Timedelta(days=index)).date().isoformat(),
                    isoTime=(pd.Timestamp('2026-01-01') + pd.Timedelta(days=index)).date().isoformat(),
                    price=3000 + index,
                    volume=0,
                )
                for index in range(60)
            ],
            note='old',
        )
        incoming = market_service.MarketSeries(
            granularity='daily',
            points=[
                MarketSeriesPoint(
                    label='2026-03-02',
                    isoTime='2026-03-02',
                    price=3060,
                    volume=0,
                )
            ],
            note='new',
        )

        merged = market_service._merge_single_series('000001', previous, incoming)

        self.assertEqual(merged.granularity, 'daily')
        self.assertEqual(len(merged.points), 60)
        self.assertEqual(merged.points[0].label, '2026-01-02')
        self.assertEqual(merged.points[-1].label, '2026-03-02')
        self.assertEqual(merged.note, 'new')

    def test_select_exact_usdcny_row_does_not_fallback_to_cnh(self) -> None:
        frame = pd.DataFrame({'代码': ['USDCNH', 'USDCNYC'], '最新价': [7.1, 6.9]})

        row = market_service._select_exact_usdcny_row(frame)

        self.assertIsNotNone(row)
        self.assertEqual(str(row['代码']), 'USDCNYC')

    def test_select_exact_usdcny_row_returns_none_without_exact_match(self) -> None:
        frame = pd.DataFrame({'代码': ['USDCNH', 'EURUSD'], '最新价': [7.1, 1.08]})

        row = market_service._select_exact_usdcny_row(frame)

        self.assertIsNone(row)

    def test_normalize_nhci_bundle_preserves_daily_series(self) -> None:
        card, series = market_service._normalize_nhci_bundle(
            {
                'quote': {'price': 3062.27, 'change': 10.08, 'changePct': 0.33},
                'granularity': 'daily',
                'note': '近60个交易日日线',
                'series': [
                    {
                        'date': '2026-03-26',
                        'label': '2026-03-25',
                        'isoTime': '2026-03-25T00:00:00+08:00',
                        'price': 3059.02,
                        'volume': 0,
                    },
                    {
                        'date': '2026-03-26',
                        'label': '2026-03-26',
                        'isoTime': '2026-03-26T00:00:00+08:00',
                        'price': 3062.27,
                        'volume': 0,
                    },
                ],
            }
        )

        self.assertEqual(card.code, 'NHCI')
        self.assertAlmostEqual(card.price or 0, 3062.27)
        self.assertEqual(series.granularity, 'daily')
        self.assertEqual(len(series.points), 2)
        self.assertEqual(series.points[-1].label, '2026-03-26')
        self.assertEqual(card.note, '近60个交易日日线')

    def test_boc_usdcny_points_convert_from_per_100_quote(self) -> None:
        frame = pd.DataFrame(
            {
                '日期': ['2026-03-25', '2026-03-26'],
                '美元': [689.11, 690.56],
            }
        )
        frame['USD/CNY'] = pd.to_numeric(frame['美元'], errors='coerce') / 100

        points = market_service._build_daily_points(frame, '日期', 'USD/CNY')

        self.assertEqual(len(points), 2)
        self.assertAlmostEqual(points[0].price, 6.8911)
        self.assertAlmostEqual(points[1].price, 6.9056)

    @patch('backend.app.services.market_service._get_usdcny_incremental_daily')
    @patch('backend.app.services.market_service._get_forex_hist')
    @patch('backend.app.services.market_service._get_boc_safe')
    def test_usdcny_falls_back_to_forex_hist_when_boc_unavailable(
        self,
        boc_mock,
        forex_hist_mock,
        incremental_mock,
    ) -> None:
        market_service._last_usdcny_series_points = []
        boc_mock.side_effect = RuntimeError('boc source unavailable')
        incremental_mock.side_effect = RuntimeError('incremental unavailable')
        forex_hist_mock.return_value = pd.DataFrame(
            {
                '日期': ['2026-03-25', '2026-03-26'],
                '收盘': [6.8911, 6.9056],
            }
        )

        card, series = market_service._build_usdcny_card_and_series()

        self.assertEqual(card.code, 'USDCNY')
        self.assertAlmostEqual(card.price or 0, 6.9056, places=4)
        self.assertEqual(series.granularity, 'daily')
        self.assertEqual(len(series.points), market_service.USDCNY_INCREMENTAL_KEEP_DAYS)
        self.assertAlmostEqual(series.points[-1].price, 6.9056, places=4)
        self.assertEqual(series.note, market_service.FX_SOURCE_NOTE)

    @patch('backend.app.services.market_service._get_usdcny_incremental_daily')
    @patch('backend.app.services.market_service._get_forex_hist')
    @patch('backend.app.services.market_service._get_boc_safe')
    def test_usdcny_falls_back_to_incremental_daily_when_primary_unavailable(
        self,
        boc_mock,
        forex_hist_mock,
        incremental_mock,
    ) -> None:
        market_service._last_usdcny_series_points = []
        boc_mock.side_effect = RuntimeError('boc source unavailable')
        forex_hist_mock.side_effect = RuntimeError('forex hist unavailable')
        incremental_mock.return_value = pd.DataFrame(
            {
                'date': ['2026-03-27', '2026-03-30'],
                'close': [6.9138, 6.9223],
            }
        )

        card, series = market_service._build_usdcny_card_and_series()

        self.assertEqual(card.code, 'USDCNY')
        self.assertAlmostEqual(card.price or 0, 6.9223, places=4)
        self.assertEqual(series.granularity, 'daily')
        self.assertEqual(len(series.points), market_service.USDCNY_INCREMENTAL_KEEP_DAYS)
        self.assertAlmostEqual(series.points[-1].price, 6.9223, places=4)
        self.assertIn('增量提取', series.note or '')

    @patch('backend.app.services.market_service._get_usdcny_incremental_daily')
    @patch('backend.app.services.market_service._get_forex_hist')
    @patch('backend.app.services.market_service._get_boc_safe')
    def test_usdcny_single_day_source_is_expanded_to_60_day_window(
        self,
        boc_mock,
        forex_hist_mock,
        incremental_mock,
    ) -> None:
        market_service._last_usdcny_series_points = []
        boc_mock.return_value = pd.DataFrame(
            {
                '日期': ['2026-03-30'],
                '美元': [692.23],
            }
        )
        forex_hist_mock.side_effect = RuntimeError('forex hist unavailable')
        incremental_mock.side_effect = RuntimeError('incremental unavailable')

        card, series = market_service._build_usdcny_card_and_series()

        self.assertEqual(card.code, 'USDCNY')
        self.assertEqual(series.granularity, 'daily')
        self.assertEqual(len(series.points), market_service.USDCNY_INCREMENTAL_KEEP_DAYS)
        self.assertAlmostEqual(series.points[-1].price, 6.9223, places=4)

    @patch('backend.app.services.market_service._get_usdcny_incremental_daily')
    @patch('backend.app.services.market_service._get_forex_hist')
    @patch('backend.app.services.market_service._get_boc_safe')
    @patch('backend.app.services.market_service._get_forex_spot')
    def test_usdcny_ignores_stale_daily_series_and_uses_spot_generated_curve(
        self,
        forex_spot_mock,
        boc_mock,
        forex_hist_mock,
        incremental_mock,
    ) -> None:
        market_service._last_usdcny_series_points = []
        boc_mock.return_value = pd.DataFrame(
            {
                '日期': ['2023-11-09', '2023-11-10'],
                '美元': [717.95, 717.71],
            }
        )
        forex_hist_mock.side_effect = RuntimeError('forex hist unavailable')
        incremental_mock.side_effect = RuntimeError('incremental unavailable')
        forex_spot_mock.return_value = pd.DataFrame(
            {
                '代码': ['USDCNYC'],
                '名称': ['美元人民币中间价'],
                '最新价': [6.9223],
                '昨收': [6.9141],
            }
        )

        card, series = market_service._build_usdcny_card_and_series()

        self.assertEqual(card.code, 'USDCNY')
        self.assertAlmostEqual(card.price or 0, 6.9223, places=4)
        self.assertEqual(series.granularity, 'daily')
        self.assertEqual(len(series.points), 60)
        self.assertAlmostEqual(series.points[-1].price, 6.9223, places=4)
        self.assertIn('实时点位兜底', series.note or '')

    @patch('backend.app.services.market_service._get_usdcny_incremental_daily')
    @patch('backend.app.services.market_service._get_forex_spot')
    @patch('backend.app.services.market_service._get_forex_hist')
    @patch('backend.app.services.market_service._get_boc_safe')
    def test_usdcny_falls_back_to_spot_generated_curve_when_daily_sources_unavailable(
        self,
        boc_mock,
        forex_hist_mock,
        forex_spot_mock,
        incremental_mock,
    ) -> None:
        market_service._last_usdcny_series_points = []
        boc_mock.side_effect = RuntimeError('boc source unavailable')
        forex_hist_mock.side_effect = RuntimeError('forex hist unavailable')
        incremental_mock.side_effect = RuntimeError('incremental unavailable')
        forex_spot_mock.return_value = pd.DataFrame(
            {
                '代码': ['USDCNYC'],
                '名称': ['美元人民币中间价'],
                '最新价': [6.9223],
                '昨收': [6.9141],
            }
        )

        card, series = market_service._build_usdcny_card_and_series()

        self.assertEqual(card.code, 'USDCNY')
        self.assertAlmostEqual(card.price or 0, 6.9223, places=4)
        self.assertEqual(series.granularity, 'daily')
        self.assertEqual(len(series.points), 60)
        self.assertAlmostEqual(series.points[-1].price, 6.9223, places=4)
        self.assertIn('实时点位兜底', series.note or '')

    @patch('backend.app.services.market_service._get_usdcny_incremental_daily')
    @patch('backend.app.services.market_service._get_forex_spot')
    @patch('backend.app.services.market_service._get_forex_hist')
    @patch('backend.app.services.market_service._get_boc_safe')
    def test_usdcny_does_not_reuse_stale_cached_series(
        self,
        boc_mock,
        forex_hist_mock,
        forex_spot_mock,
        incremental_mock,
    ) -> None:
        market_service._last_usdcny_series_points = [
            MarketSeriesPoint(label='2023-11-09', isoTime='2023-11-09', price=7.1795, volume=0.0),
            MarketSeriesPoint(label='2023-11-10', isoTime='2023-11-10', price=7.1771, volume=0.0),
        ]
        boc_mock.side_effect = RuntimeError('boc source unavailable')
        forex_hist_mock.side_effect = RuntimeError('forex hist unavailable')
        incremental_mock.side_effect = RuntimeError('incremental unavailable')
        forex_spot_mock.side_effect = RuntimeError('spot unavailable')

        card, series = market_service._build_usdcny_card_and_series()

        self.assertEqual(card.code, 'USDCNY')
        self.assertIsNone(card.price)
        self.assertEqual(series.granularity, 'none')
        self.assertEqual(len(series.points), 0)

    @patch('backend.app.services.market_service._save_usdcny_incremental_rates')
    @patch('backend.app.services.market_service._request_usdcny_incremental_rates')
    @patch('backend.app.services.market_service._load_usdcny_incremental_rates')
    def test_update_usdcny_incremental_rates_requests_only_new_range(
        self,
        load_mock,
        request_mock,
        save_mock,
    ) -> None:
        load_mock.return_value = {
            '2026-03-28': 6.8911,
            '2026-03-29': 6.9000,
        }
        request_mock.return_value = {'2026-03-30': 6.9223}

        rates = market_service._update_usdcny_incremental_rates()

        self.assertIn('2026-03-30', rates)
        self.assertEqual(len(rates), 3)
        start_arg, _ = request_mock.call_args.args
        self.assertEqual(start_arg.isoformat(), '2026-03-30')
        save_mock.assert_called_once()

    @patch('backend.app.services.market_service._save_usdcny_incremental_rates')
    @patch('backend.app.services.market_service._request_usdcny_incremental_rates')
    @patch('backend.app.services.market_service._load_usdcny_incremental_rates')
    def test_update_usdcny_incremental_rates_trims_to_60_days(
        self,
        load_mock,
        request_mock,
        save_mock,
    ) -> None:
        load_mock.return_value = {
            (pd.Timestamp('2026-01-01') + pd.Timedelta(days=index)).date().isoformat(): 6.80 + index * 0.001
            for index in range(60)
        }
        request_mock.return_value = {
            (pd.Timestamp('2026-03-02') + pd.Timedelta(days=index)).date().isoformat(): 6.90 + index * 0.001
            for index in range(5)
        }

        rates = market_service._update_usdcny_incremental_rates()

        self.assertEqual(len(rates), market_service.USDCNY_INCREMENTAL_KEEP_DAYS)
        keys = sorted(rates.keys())
        self.assertEqual(keys[-1], '2026-03-06')
        self.assertEqual(keys[0], '2026-01-06')
        save_mock.assert_called_once()

    @patch('backend.app.services.market_service._get_china_lpr')
    def test_build_lpr_card_uses_lpr5y_column(self, lpr_mock) -> None:
        lpr_mock.return_value = pd.DataFrame(
            {
                'TRADE_DATE': ['2026-02-20', '2026-03-20'],
                'LPR1Y': [3.10, 3.00],
                'LPR5Y': [3.60, 3.50],
                'RATE_1': [4.35, 4.35],
                'RATE_2': [3.60, 3.50],
            }
        )

        card = market_service._build_lpr_card()

        self.assertEqual(card.code, 'LPR')
        self.assertEqual(card.kind, 'rate')
        self.assertAlmostEqual(card.price or 0, 3.50)
        self.assertAlmostEqual(card.change or 0, -0.10)
        self.assertAlmostEqual(card.changePct or 0, -2.777778, places=5)

    @patch('backend.app.services.market_service.ak.stock_individual_spot_xq')
    def test_load_ticker_quote_uses_xq_spot(self, xq_mock) -> None:
        xq_mock.return_value = pd.DataFrame(
            {
                'item': ['名称', '现价', '涨幅'],
                'value': ['贵州茅台', 1401.18, -0.64],
            }
        )

        quote = market_service._load_ticker_quote('600519')

        self.assertEqual(quote.code, '600519')
        self.assertEqual(quote.name, '贵州茅台')
        self.assertAlmostEqual(quote.price or 0, 1401.18)
        self.assertAlmostEqual(quote.changePct or 0, -0.64)

    @patch('backend.app.services.market_service._build_ticker_strip_from_spot')
    @patch('backend.app.services.market_service._build_ticker_strip_from_daily')
    @patch('backend.app.services.market_service._get_ticker_quote')
    def test_build_ticker_strip_falls_back_when_xq_quotes_unavailable(
        self,
        quote_mock,
        daily_mock,
        spot_mock,
    ) -> None:
        quote_mock.side_effect = [
            market_service.MarketTickerQuote(code=code, name=market_service.TICKER_NAME_BY_CODE[code])
            for code in market_service.TICKER_CODES
        ]
        spot_mock.return_value = [
            market_service.MarketTickerQuote(code=code, name=market_service.TICKER_NAME_BY_CODE[code])
            for code in market_service.TICKER_CODES
        ]
        daily_mock.return_value = [
            market_service.MarketTickerQuote(code='600519', name='贵州茅台', price=1401.18, changePct=-0.64),
            market_service.MarketTickerQuote(code='601318', name='中国平安', price=52.32, changePct=0.45),
            market_service.MarketTickerQuote(code='000858', name='五粮液', price=133.27, changePct=0.21),
            market_service.MarketTickerQuote(code='300750', name='宁德时代', price=226.18, changePct=-0.12),
            market_service.MarketTickerQuote(code='002594', name='比亚迪', price=201.08, changePct=0.16),
            market_service.MarketTickerQuote(code='601398', name='工商银行', price=6.67, changePct=0.30),
            market_service.MarketTickerQuote(code='688981', name='中芯国际', price=48.62, changePct=-0.41),
            market_service.MarketTickerQuote(code='000333', name='美的集团', price=65.72, changePct=0.08),
        ]

        quotes = market_service._build_ticker_strip()

        self.assertEqual(len(quotes), len(market_service.TICKER_CODES))
        self.assertTrue(any(item.price is not None for item in quotes))
        spot_mock.assert_called_once()
        daily_mock.assert_called_once()

    @patch('backend.app.services.market_service._get_index_spot_sina')
    @patch('backend.app.services.market_service._get_sh_index_daily_sina')
    @patch('backend.app.services.market_service._get_sh_index_daily')
    def test_sse_falls_back_to_sina_daily_when_eastmoney_daily_unavailable(
        self,
        daily_em_mock,
        daily_sina_mock,
        spot_mock,
    ) -> None:
        daily_em_mock.side_effect = RuntimeError('eastmoney daily blocked')
        daily_sina_mock.return_value = pd.DataFrame(
            {
                'date': ['2026-03-24', '2026-03-25'],
                'close': [3881.28, 3931.84],
                'volume': [68062203900, 68834362600],
            }
        )
        spot_mock.return_value = pd.DataFrame(
            {
                '代码': ['sh000001'],
                '最新价': [3889.08],
                '涨跌额': [-42.76],
                '涨跌幅': [-1.09],
            }
        )

        card, series = market_service._build_sse_card_and_series()

        self.assertEqual(card.code, '000001')
        self.assertAlmostEqual(card.price or 0, 3889.08)
        self.assertEqual(card.note, market_service.INDEX_SOURCE_NOTE)
        self.assertEqual(series.granularity, 'daily')
        self.assertEqual(len(series.points), 2)
        self.assertEqual(series.points[-1].label, '2026-03-25')


class NhciBridgeTest(unittest.TestCase):
    @patch('backend.app.services.nhci_bridge.subprocess.run')
    def test_fetch_nhci_bundle_parses_stdout(self, run_mock) -> None:
        run_mock.return_value.stdout = json.dumps({'quote': {'price': 1}})
        run_mock.return_value.stderr = ''

        payload = nhci_bridge.fetch_nhci_bundle()

        self.assertEqual(payload['quote']['price'], 1)


if __name__ == '__main__':
    unittest.main()
