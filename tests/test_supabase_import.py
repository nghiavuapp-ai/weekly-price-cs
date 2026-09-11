import copy
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from import_supabase_data import (  # noqa: E402
    build_catalog_payload,
    build_daily_snapshot_payload,
    build_weekly_payload,
    merge_payloads,
    upsert_payload,
)


class CatalogPayloadTests(unittest.TestCase):
    def test_builds_deterministic_product_retailer_link_and_override_records(self):
        link_rows = [{
            "Model": "  iPhone 17e 256GB ",
            "SD": " https://shopdunk.com/iphone-17e ",
            "FPT": "https://fptshop.com.vn/dien-thoai/iphone-17e",
        }]
        override_rows = [{
            "url": "https://shopdunk.com/iphone-17e",
            "value": "17,290,000",
            "note": "Browser-confirmed price.",
        }]

        payload = build_catalog_payload(link_rows, override_rows)

        self.assertEqual(payload["products"], [{
            "id": "0580abb3-9fc5-581a-bcb3-6ad093c106bd",
            "name": "iPhone 17e 256GB",
            "category": "iPhone",
            "capacity": "256GB",
            "active": True,
        }])
        self.assertEqual(payload["retailers"], [
            {
                "id": "cf15a8ae-160c-59c0-b685-4f1a51028a8d",
                "code": "FPT",
                "name": "FPT",
                "active": True,
            },
            {
                "id": "678b1532-43b1-5c34-905d-74bab55dbeb1",
                "code": "SHOPDUNK",
                "name": "Shopdunk",
                "active": True,
            },
        ])
        self.assertEqual(payload["product_links"], [
            {
                "id": "a7b203a8-2f7a-53c3-a2bd-9bc17044a692",
                "product_id": "0580abb3-9fc5-581a-bcb3-6ad093c106bd",
                "retailer_id": "cf15a8ae-160c-59c0-b685-4f1a51028a8d",
                "url": "https://fptshop.com.vn/dien-thoai/iphone-17e",
                "active": True,
            },
            {
                "id": "295a3222-af3b-5157-9eae-3cc93621a4de",
                "product_id": "0580abb3-9fc5-581a-bcb3-6ad093c106bd",
                "retailer_id": "678b1532-43b1-5c34-905d-74bab55dbeb1",
                "url": "https://shopdunk.com/iphone-17e",
                "active": True,
            },
        ])
        self.assertEqual(payload["price_overrides"], [{
            "id": "cedec4b6-4aef-5910-b935-9b9c4165a47f",
            "product_link_id": "295a3222-af3b-5157-9eae-3cc93621a4de",
            "override_price": 17_290_000,
            "note": "Browser-confirmed price.",
            "active": True,
        }])


class HistoricalPayloadTests(unittest.TestCase):
    def test_builds_weekly_price_and_oos_observations_with_source_lineage(self):
        rows = [
            {
                "week_id": "W11Q4FY26", "week_number": 11, "quarter": 4,
                "fiscal_year": 26, "raw_model": "iPhone 17e 256GB",
                "canonical_model": "iPhone 17e 256GB", "category": "iPhone",
                "capacity": "256GB", "partner": "FPT", "price_vnd": 21_490_000,
                "stock_status": "In stock", "source_sheet": "W11Q4FY26",
                "source_row": 2, "mapping_status": "Mapped", "price_change_note": None,
            },
            {
                "week_id": "W11Q4FY26", "week_number": 11, "quarter": 4,
                "fiscal_year": 26, "raw_model": "iPhone 17e 256GB",
                "canonical_model": "iPhone 17e 256GB", "category": "iPhone",
                "capacity": "256GB", "partner": "Shopdunk", "price_vnd": None,
                "stock_status": "OOS", "source_sheet": "W11Q4FY26",
                "source_row": 2, "mapping_status": "Mapped", "price_change_note": "was 17,290K",
            },
        ]

        payload = build_weekly_payload(rows)

        self.assertEqual(payload["crawl_runs"], [{
            "id": "58825e07-e216-5544-8581-ef48da2f8f63",
            "run_key": "historical-weekly:W11Q4FY26",
            "parent_run_id": None,
            "run_type": "historical_weekly",
            "period_type": "weekly",
            "period_key": "W11Q4FY26",
            "period_start": "2026-09-06",
            "scheduled_for": "2026-09-06T12:00:00+07:00",
            "started_at": "2026-09-06T12:00:00+07:00",
            "completed_at": "2026-09-06T12:00:00+07:00",
            "status": "success",
            "total_targets": 2,
            "ok_count": 1,
            "oos_count": 1,
            "error_count": 0,
            "change_count": 0,
            "review_count": 0,
            "source": "historical_import",
        }])
        observations = payload["price_observations"]
        self.assertEqual([row["id"] for row in observations], [
            "0d231911-9440-522e-8840-1812601a2c75",
            "c8d6e825-1055-5d32-8fa8-a2de0b2ff7cd",
        ])
        self.assertEqual(observations[0]["price_vnd"], 21_490_000)
        self.assertIs(observations[0]["in_stock"], True)
        self.assertEqual(observations[0]["review_status"], "confirmed")
        self.assertEqual(observations[0]["evidence"], {
            "mapping_status": "Mapped",
            "price_change_note": None,
            "raw_model": "iPhone 17e 256GB",
            "source_row": 2,
            "source_sheet": "W11Q4FY26",
        })
        self.assertIsNone(observations[1]["price_vnd"])
        self.assertIs(observations[1]["in_stock"], False)
        self.assertTrue(observations[1]["fetch_ok"])

    def test_builds_daily_success_oos_and_failed_fetch_observations(self):
        run = {
            "run_id": "daily-20260910-primary",
            "parent_run_id": None,
            "run_type": "primary",
            "started_at": "2026-09-10T11:00:00",
            "completed_at": "2026-09-10T11:05:00",
            "total_targets": 3,
            "ok_count": 1,
            "oos_count": 1,
            "error_count": 1,
            "change_count": 0,
            "review_count": 1,
            "status": "PARTIAL",
        }
        rows = [
            {
                "model": "iPhone 17e 256GB", "retailer": "FPT",
                "final_price": "21490000", "source_method": "fpt_structured_offer_price",
                "purchase_action": "IN_STOCK", "purchase_action_text": "Mua ngay",
                "risk_flags": "WARN_WEEK_CHANGE", "confidence": "VERIFIED_RENDER",
                "decision_note": "render matched", "status": "OK", "error": "",
                "fetched_at": "2026-09-10T11:00:10",
                "url": "https://fptshop.com.vn/dien-thoai/iphone-17e",
            },
            {
                "model": "iPhone 17e 256GB", "retailer": "Shopdunk",
                "final_price": "", "source_method": "shopdunk_stock_endpoint",
                "purchase_action": "OUT_OF_STOCK", "purchase_action_text": "finalGate=false",
                "risk_flags": "", "confidence": "OOS_CONFIRMED",
                "decision_note": "CTA is unavailable", "status": "OOS", "error": "",
                "fetched_at": "2026-09-10T11:00:20",
                "url": "https://shopdunk.com/iphone-17e",
            },
            {
                "model": "iPhone 17e 256GB", "retailer": "Viettel",
                "final_price": "", "source_method": "", "risk_flags": "WARN_FETCH_STATUS",
                "confidence": "REVIEW", "decision_note": "TLS failed",
                "status": "URL_ERROR", "error": "certificate verify failed",
                "fetched_at": "2026-09-10T11:00:30",
                "url": "https://viettelstore.vn/iphone-17e",
            },
        ]

        payload = build_daily_snapshot_payload(run, rows)
        by_retailer = {
            next(item["name"] for item in payload["retailers"] if item["id"] == row["retailer_id"]): row
            for row in payload["price_observations"]
        }

        self.assertEqual(len(payload["crawl_runs"]), 1)
        self.assertEqual(payload["crawl_runs"][0]["run_key"], "daily-20260910-primary")
        self.assertEqual(payload["crawl_runs"][0]["status"], "partial")
        self.assertEqual(by_retailer["FPT"]["price_vnd"], 21_490_000)
        self.assertIs(by_retailer["FPT"]["in_stock"], True)
        self.assertEqual(by_retailer["FPT"]["risk_flags"], ["WARN_WEEK_CHANGE"])
        self.assertEqual(by_retailer["FPT"]["evidence"]["purchase_action_text"], "Mua ngay")
        self.assertIs(by_retailer["Shopdunk"]["in_stock"], False)
        self.assertEqual(by_retailer["Shopdunk"]["review_status"], "confirmed")
        self.assertIs(by_retailer["Viettel"]["fetch_ok"], False)
        self.assertIsNone(by_retailer["Viettel"]["in_stock"])
        self.assertEqual(by_retailer["Viettel"]["error_message"], "certificate verify failed")
        self.assertEqual(by_retailer["Viettel"]["review_status"], "pending")


class IdempotencyTests(unittest.TestCase):
    def test_merge_is_idempotent_and_only_generation_timestamp_varies(self):
        part = build_catalog_payload([{
            "Model": "iPhone 17e 256GB",
            "FPT": "https://fptshop.com.vn/dien-thoai/iphone-17e",
        }])

        first = merge_payloads([part, copy.deepcopy(part)], generated_at="2026-09-11T01:00:00Z")
        second = merge_payloads([copy.deepcopy(part)], generated_at="2026-09-11T02:00:00Z")
        first_without_timestamp = {key: value for key, value in first.items() if key != "generated_at"}
        second_without_timestamp = {key: value for key, value in second.items() if key != "generated_at"}

        self.assertEqual(first_without_timestamp, second_without_timestamp)
        self.assertNotEqual(first["generated_at"], second["generated_at"])
        self.assertEqual(
            json.dumps(first_without_timestamp, ensure_ascii=False, sort_keys=True),
            json.dumps(second_without_timestamp, ensure_ascii=False, sort_keys=True),
        )
        self.assertEqual(len(first["products"]), 1)
        self.assertEqual(len(first["product_links"]), 1)

    def test_upload_batches_in_dependency_order_and_ignores_append_only_conflicts(self):
        calls = []

        def sender(request, timeout):
            calls.append((request, timeout))
            return None

        payload = {
            "generated_at": "2026-09-11T01:00:00Z",
            "products": [{"id": "p1"}, {"id": "p2"}],
            "retailers": [{"id": "r1"}],
            "product_links": [],
            "price_overrides": [],
            "crawl_runs": [{"id": "run1"}],
            "price_observations": [{"id": "o1"}, {"id": "o2"}],
            "price_corrections": [{"id": "c1"}],
        }

        counts = upsert_payload(
            payload,
            supabase_url="https://example.supabase.co",
            service_key="server-secret",
            batch_size=1,
            sender=sender,
        )

        self.assertEqual(counts, {
            "retailers": 1, "products": 2, "product_links": 0,
            "price_overrides": 0, "crawl_runs": 1,
            "price_observations": 2, "price_corrections": 1,
        })
        self.assertEqual([request.full_url.split("/")[-1].split("?")[0] for request, _ in calls], [
            "retailers", "products", "products", "crawl_runs",
            "price_observations", "price_observations", "price_corrections",
        ])
        self.assertIn("resolution=merge-duplicates", calls[0][0].get_header("Prefer"))
        self.assertIn("resolution=ignore-duplicates", calls[-1][0].get_header("Prefer"))
        self.assertNotIn("server-secret", json.dumps(counts))


if __name__ == "__main__":
    unittest.main()
