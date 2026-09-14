import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import compare_shadow_to_daily as comparison  # noqa: E402


class ShadowComparisonTests(unittest.TestCase):
    def test_compares_only_common_product_partner_pairs_and_groups_mismatches(self):
        shadow = [
            {"product_id": "p1", "retailer_id": "r1", "price_vnd": 10_000, "in_stock": True,
             "fetch_ok": True, "review_status": "confirmed", "risk_flags": []},
            {"product_id": "p2", "retailer_id": "r1", "price_vnd": 20_000, "in_stock": True,
             "fetch_ok": True, "review_status": "pending", "risk_flags": ["WARN_WEEK_CHANGE"]},
            {"product_id": "p3", "retailer_id": "r2", "price_vnd": None, "in_stock": False,
             "fetch_ok": True, "review_status": "confirmed", "risk_flags": []},
            {"product_id": "cloud-only", "retailer_id": "r2", "price_vnd": None, "in_stock": None,
             "fetch_ok": False, "review_status": "pending", "risk_flags": ["FETCH_ERROR"]},
        ]
        reference = [
            {"product_id": "p1", "retailer_id": "r1", "effective_price_vnd": 10_000,
             "effective_in_stock": True, "retailer_code": "FPT", "product_name": "Model 1",
             "observed_at": "2026-09-13T11:00:00+07:00"},
            {"product_id": "p2", "retailer_id": "r1", "effective_price_vnd": 19_000,
             "effective_in_stock": True, "retailer_code": "FPT", "product_name": "Model 2",
             "observed_at": "2026-09-13T11:00:00+07:00"},
            {"product_id": "p3", "retailer_id": "r2", "effective_price_vnd": 30_000,
             "effective_in_stock": True, "retailer_code": "MW", "product_name": "Model 3",
             "observed_at": "2026-09-13T11:00:00+07:00"},
            {"product_id": "local-only", "retailer_id": "r2", "effective_price_vnd": 40_000,
             "effective_in_stock": True, "retailer_code": "MW", "product_name": "Local only",
             "observed_at": "2026-09-13T11:00:00+07:00"},
        ]

        report = comparison.compare_rows(shadow, reference, period_key="2026-09-13")

        self.assertEqual(report["status"], "compared")
        self.assertEqual(report["counts"], {
            "shadow_total": 4, "reference_total": 4, "common_total": 3,
            "cloud_only": 1, "reference_only": 1,
            "shadow_fetch_errors": 1, "shadow_pending_reviews": 2,
            "price_matches": 1, "price_mismatches": 1,
            "stock_matches": 2, "stock_mismatches": 1,
        })
        self.assertEqual(report["rates"]["price_match_pct"], 50.0)
        self.assertEqual(report["rates"]["stock_match_pct"], 66.67)
        self.assertEqual(report["by_partner"]["FPT"]["price_mismatches"], 1)
        self.assertEqual(report["by_partner"]["MW"]["stock_mismatches"], 1)
        self.assertEqual(report["mismatches"][0]["product_name"], "Model 2")
        self.assertEqual(report["quality_gate"]["status"], "failed")
        self.assertFalse(report["quality_gate"]["passed"])
        self.assertIn("cloud_only", report["quality_gate"]["failed_checks"])
        self.assertIn("price_match_pct", report["quality_gate"]["failed_checks"])

    def test_latest_reference_observation_wins_for_duplicate_pair(self):
        shadow = [{"product_id": "p1", "retailer_id": "r1", "price_vnd": 12_000,
                   "in_stock": True, "fetch_ok": True, "review_status": "confirmed", "risk_flags": []}]
        reference = [
            {"product_id": "p1", "retailer_id": "r1", "effective_price_vnd": 10_000,
             "effective_in_stock": True, "retailer_code": "FPT", "product_name": "Model",
             "observed_at": "2026-09-13T10:00:00+07:00"},
            {"product_id": "p1", "retailer_id": "r1", "effective_price_vnd": 12_000,
             "effective_in_stock": True, "retailer_code": "FPT", "product_name": "Model",
             "observed_at": "2026-09-13T11:00:00+07:00"},
        ]

        report = comparison.compare_rows(shadow, reference, period_key="2026-09-13")

        self.assertEqual(report["counts"]["reference_total"], 1)
        self.assertEqual(report["counts"]["price_matches"], 1)

    def test_quality_gate_passes_only_for_an_exact_clean_match(self):
        shadow = [{"product_id": "p1", "retailer_id": "r1", "price_vnd": 12_000,
                   "in_stock": True, "fetch_ok": True, "review_status": "confirmed",
                   "risk_flags": []}]
        reference = [{"product_id": "p1", "retailer_id": "r1",
                      "effective_price_vnd": 12_000, "effective_in_stock": True,
                      "retailer_code": "FPT", "product_name": "Model",
                      "observed_at": "2026-09-13T11:00:00+07:00"}]

        report = comparison.compare_rows(shadow, reference, period_key="2026-09-13")

        self.assertEqual(report["quality_gate"], {
            "status": "passed",
            "passed": True,
            "failed_checks": [],
            "required": {
                "status": "compared",
                "cloud_only": 0,
                "reference_only": 0,
                "shadow_fetch_errors": 0,
                "shadow_pending_reviews": 0,
                "price_mismatches": 0,
                "stock_mismatches": 0,
                "price_match_pct": 100.0,
                "stock_match_pct": 100.0,
            },
        })

    def test_missing_same_day_local_reference_waits_instead_of_failing(self):
        report = comparison.compare_rows(
            [{"product_id": "p1", "retailer_id": "r1", "fetch_ok": False,
              "review_status": "pending", "risk_flags": ["FETCH_ERROR"]}],
            [],
            period_key="2026-09-14",
        )

        self.assertEqual(report["status"], "waiting_local")
        self.assertEqual(report["counts"]["shadow_total"], 1)
        self.assertEqual(report["counts"]["reference_total"], 0)
        self.assertIsNone(report["rates"]["price_match_pct"])
        self.assertEqual(report["quality_gate"]["status"], "waiting_local")
        self.assertFalse(report["quality_gate"]["passed"])


class ShadowComparisonCliTests(unittest.TestCase):
    def test_main_reads_latest_shadow_payload_and_writes_comparison(self):
        class FakeClient:
            def select(self, table, **kwargs):
                self.call = (table, kwargs)
                return []

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            (output_dir / "shadow-20260913.json").write_text(json.dumps({
                "run": {"period_key": "2026-09-13"},
                "observations": [{"product_id": "p1", "retailer_id": "r1", "fetch_ok": False,
                                  "review_status": "pending", "risk_flags": []}],
            }), encoding="utf-8")
            client = FakeClient()

            result = comparison.create_comparison(output_dir, client)

            self.assertEqual(result["status"], "waiting_local")
            self.assertTrue((output_dir / "shadow-comparison-20260913.json").exists())
            self.assertEqual(client.call[0], "effective_price_observations")
            self.assertEqual(client.call[1]["filters"], {
                "period_type": "eq.daily", "period_key": "eq.2026-09-13"
            })


if __name__ == "__main__":
    unittest.main()
