import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('update', Path(__file__).with_name('update.py'))
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)
NOW = datetime(2026, 10, 9, 18, tzinfo=timezone.utc)

def fixture():
    days = [NOW - timedelta(days=80 - i) for i in range(81)]
    return {'chart': {'error': None, 'result': [{
        'meta': {'symbol': 'AAPL', 'currency': 'USD', 'exchangeTimezoneName': 'America/New_York'},
        'timestamp': [int(day.timestamp()) for day in days],
        'indicators': {'quote': [{'close': [100 + i for i in range(81)], 'volume': [1000] * 81}]}
    }]}}

class UpdateTests(unittest.TestCase):
    def test_current_session_excluded(self):
        rows = update.parse_chart(fixture(), 'AAPL', NOW)
        self.assertEqual(rows[-1]['date'], '2026-10-08')
        self.assertEqual(len(rows), 80)

    def test_null_rows_excluded(self):
        payload = fixture()
        payload['chart']['result'][0]['indicators']['quote'][0]['close'][0] = None
        self.assertEqual(len(update.parse_chart(payload, 'AAPL', NOW)), 79)

    def test_bad_prices_and_volume(self):
        for key, value in [('close', 0), ('close', -1), ('close', float('nan')),
                           ('close', float('inf')), ('close', True), ('volume', -1)]:
            with self.subTest(key=key, value=value):
                payload = fixture()
                payload['chart']['result'][0]['indicators']['quote'][0][key][-2] = value
                with self.assertRaises(ValueError):
                    update.parse_chart(payload, 'AAPL', NOW)

    def test_provider_error(self):
        for payload in [{'chart': {'error': {'code': 'Not Found'}}}, {'chart': {'result': []}}]:
            with self.assertRaisesRegex(ValueError, 'sin cotizaciones'):
                update.parse_chart(payload, 'AAPL', NOW)

    def test_symbol_currency_timezone(self):
        for key, value in [('symbol', 'MSFT'), ('currency', 'EUR'), ('exchangeTimezoneName', 'UTC')]:
            payload = fixture()
            payload['chart']['result'][0]['meta'][key] = value
            with self.assertRaises(ValueError):
                update.parse_chart(payload, 'AAPL', NOW)

    def test_misaligned_series(self):
        payload = fixture()
        payload['chart']['result'][0]['timestamp'].pop()
        with self.assertRaisesRegex(ValueError, 'inconsistentes'):
            update.parse_chart(payload, 'AAPL', NOW)

    def test_duplicate_future_short_stale(self):
        rows = update.parse_chart(fixture(), 'AAPL', NOW)
        for changed in [rows + [rows[-1]], rows[:54], rows[:-10],
                        rows[:-1] + [{**rows[-1], 'date': '2026-10-10'}]]:
            with self.assertRaises(ValueError):
                update.validate_rows(changed, NOW)

    def test_known_indicators(self):
        rows = update.parse_chart(fixture(), 'AAPL', NOW)
        result = update.analyze(rows)
        self.assertEqual(result['checks'], [True, True, True, False])
        self.assertEqual(result['ma20'], 169.5)
        self.assertEqual(result['ma50'], 154.5)

    def test_total_outage_preserves_file_and_returns_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'market-data.json'
            path.write_text('previous valid data')
            with patch.object(update, 'fetch', side_effect=ValueError('sin cotizaciones')):
                self.assertEqual(update.main(path), 1)
            self.assertEqual(path.read_text(), 'previous valid data')

    def test_partial_success_has_errors(self):
        rows = update.parse_chart(fixture(), 'AAPL', NOW)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'market-data.json'
            with patch.object(update, 'ASSETS', {'AAPL.US': ('Apple', 'USD'), 'MSFT.US': ('Microsoft', 'USD')}), \
                 patch.object(update, 'fetch', side_effect=[rows, ValueError('HTTP 429')]), \
                 patch.object(update, 'datetime') as clock:
                clock.now.return_value = NOW
                clock.fromisoformat = datetime.fromisoformat
                self.assertEqual(update.main(path), 0)
                output = json.loads(path.read_text())
                self.assertEqual(len(output['assets']), 1)
                self.assertEqual(len(output['errors']), 1)
                update.validate_dataset(output, NOW)
                output['assets'][0]['score'] = 4
                with self.assertRaisesRegex(ValueError, 'indicadores'):
                    update.validate_dataset(output, NOW)

    def test_cli_invalid_file_exits_nonzero(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'empty.json'
            path.write_text('{}')
            result = subprocess.run([sys.executable, str(Path(update.__file__)), '--validate', str(path)],
                                    capture_output=True)
            self.assertNotEqual(result.returncode, 0)

if __name__ == '__main__':
    unittest.main()
