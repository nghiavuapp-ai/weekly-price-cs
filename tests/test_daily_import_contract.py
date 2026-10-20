import copy
import importlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))


def payload():
    from import_supabase_data import build_daily_snapshot_payload
    return build_daily_snapshot_payload(
        {'run_id': 'daily-test-primary', 'run_type': 'primary', 'status': 'SUCCESS',
         'completed_at': '2026-10-19T11:00:00+07:00'},
        [{'model': 'iPhone 17 256GB', 'retailer': name, 'status': 'OK',
          'final_price': '26990000', 'fetched_at': '2026-10-19T11:00:00+07:00'}
         for name in ['FPT', 'MW']])


class DailyImportContractTests(unittest.TestCase):
    def contract(self):
        self.assertIsNotNone(importlib.util.find_spec('daily_import_contract'),
                             'Atomic import contract is missing')
        return importlib.import_module('daily_import_contract')

    def test_terminal_run_with_zero_or_one_of_two_rows_is_not_a_duplicate(self):
        c = self.contract(); p = payload()
        for n in [0, 1]:
            with self.subTest(rows=n), self.assertRaisesRegex(ValueError, 'IMPORT_INCOMPLETE'):
                c.verify_observations(p, p['price_observations'][:n])

    def test_equal_count_with_wrong_price_or_key_is_rejected(self):
        c = self.contract(); p = payload()
        for field, value in [('price_vnd', 1), ('id', 'wrong-id')]:
            actual = copy.deepcopy(p['price_observations']); actual[0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                c.verify_observations(p, actual)

    def test_timezone_normalization_and_extra_database_fields_do_not_change_content(self):
        c = self.contract(); p = payload(); actual = copy.deepcopy(p['price_observations'])
        for row in actual:
            row['observed_at'] = '2026-10-19T04:00:00+00:00'
            row['created_at'] = '2026-10-19T04:00:01Z'
        c.verify_observations(p, actual)
        self.assertEqual(c.build_manifest(p, 'a'*64)['expected_count'], 2)

    def test_duplicate_id_and_wrong_run_are_rejected_before_transport(self):
        c = self.contract(); p = payload()
        p['price_observations'].append(copy.deepcopy(p['price_observations'][0]))
        with self.assertRaises(ValueError): c.build_manifest(p, 'a'*64)
        p = payload(); p['price_observations'][0]['run_id'] = 'other'
        with self.assertRaises(ValueError): c.build_manifest(p, 'a'*64)

    def test_import_requires_receipt_then_independent_readback(self):
        c = self.contract(); p = payload(); manifest = c.build_manifest(p, 'a'*64)
        calls = []
        def sender(request, timeout):
            calls.append(request)
            if request.get_method() == 'POST':
                return dict(protocol_version=1, run_id=manifest['run_id'],
                            source_sha256='a'*64, payload_digest=manifest['payload_digest'],
                            actual_count=2, status='imported')
            return p['price_observations']
        receipt = c.import_daily_atomically(p, manifest, 'https://example.invalid', 'fake', sender=sender)
        self.assertTrue(receipt['readback_verified'])
        self.assertEqual(len(calls), 2)
        self.assertIn('/rpc/import_daily_atomic', calls[0].full_url)
        def bad_sender(request, timeout):
            return sender(request, timeout) if request.get_method() == 'POST' else []
        with self.assertRaisesRegex(ValueError, 'IMPORT_INCOMPLETE'):
            c.import_daily_atomically(p, manifest, 'https://example.invalid', 'fake', sender=bad_sender)

if __name__ == '__main__': unittest.main()
