import unittest

from backend.app.services import app_state


class AppStateNormalizationTest(unittest.TestCase):
    def test_thirdparty_records_are_not_auto_repopulated_after_delete(self) -> None:
        payload = {
            'strategies': {
                'backtest': [],
                'live': [],
                'thirdparty': [{'id': 'tp-custom-deleted-others'}],
            }
        }

        normalized = app_state._normalize_state(payload)

        self.assertEqual(
            [item.get('id') for item in normalized['strategies']['thirdparty']],
            ['tp-custom-deleted-others'],
        )

    def test_missing_thirdparty_key_falls_back_to_seed(self) -> None:
        payload = {
            'strategies': {
                'backtest': [],
                'live': [],
            }
        }

        normalized = app_state._normalize_state(payload)

        self.assertGreater(len(normalized['strategies']['thirdparty']), 0)


if __name__ == '__main__':
    unittest.main()
