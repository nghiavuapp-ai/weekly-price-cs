import base64
import copy
import gzip
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))


def sample_payload(run_key="daily-20261026-primary", date="2026-10-26"):
    return {
        "crawl_runs": [{
            "id": f"run-{date}", "run_key": run_key, "parent_run_id": None,
            "run_type": "primary", "period_type": "daily", "period_key": date,
            "period_start": date, "scheduled_for": f"{date}T11:00:00+07:00",
            "started_at": f"{date}T11:00:00+07:00", "completed_at": f"{date}T11:15:00+07:00",
            "status": "partial", "total_targets": 3, "ok_count": 1, "oos_count": 1,
            "error_count": 1, "change_count": 2, "review_count": 1, "source": "daily_import",
        }],
        "products": [
            {"id": "product-a", "name": "iPhone 18 Pro 256GB", "category": "iPhone", "capacity": "256GB", "active": True},
            {"id": "product-b", "name": "Apple Watch S11 46mm", "category": "Watch", "capacity": None, "active": True},
        ],
        "retailers": [
            {"id": "retailer-fpt", "code": "FPT", "name": "FPT", "active": True},
            {"id": "retailer-mw", "code": "MW", "name": "MW", "active": True},
            {"id": "retailer-viettel", "code": "VIETTEL", "name": "Viettel", "active": True},
        ],
        "price_observations": [
            {
                "id": "obs-ok", "run_id": f"run-{date}", "product_id": "product-a", "retailer_id": "retailer-fpt",
                "product_link_id": "link-fpt", "period_type": "daily", "period_key": date, "period_start": date,
                "observed_at": f"{date}T10:57:28+07:00", "price_vnd": 41_990_000, "in_stock": True,
                "fetch_ok": True, "review_status": "confirmed", "confidence": "HTML_OK", "risk_flags": [],
                "evidence": {"purchase_action": "IN_STOCK", "raw_html": "private"},
                "source_method": "fpt_structured_offer_price", "error_message": None,
            },
            {
                "id": "obs-oos", "run_id": f"run-{date}", "product_id": "product-a", "retailer_id": "retailer-mw",
                "product_link_id": "link-mw", "period_type": "daily", "period_key": date, "period_start": date,
                "observed_at": f"{date}T10:57:29+07:00", "price_vnd": None, "in_stock": False,
                "fetch_ok": True, "review_status": "confirmed", "confidence": "OOS_CONFIRMED", "risk_flags": [],
                "evidence": {}, "source_method": "mw_product_page", "error_message": None,
            },
            {
                "id": "obs-pending", "run_id": f"run-{date}", "product_id": "product-b", "retailer_id": "retailer-viettel",
                "product_link_id": "link-viettel", "period_type": "daily", "period_key": date, "period_start": date,
                "observed_at": f"{date}T10:57:30+07:00", "price_vnd": 12_990_000, "in_stock": True,
                "fetch_ok": False, "review_status": "pending", "confidence": "VERIFY_PENDING",
                "risk_flags": ["WARN_STOCK_ACTION_UNVERIFIED"], "evidence": {"local_path": "/private/evidence.png"},
                "source_method": "daily_targeted_browser", "error_message": "browser timeout",
            },
        ],
    }


class DailyStaticFallbackTests(unittest.TestCase):
    def test_builds_public_effective_rows_from_verified_daily_payload(self):
        from daily_static_fallback import build_static_overlay

        overlay = build_static_overlay(sample_payload(), None, "a" * 64, "2026-10-26T04:20:00Z")

        self.assertEqual(overlay["schemaVersion"], 1)
        self.assertEqual(overlay["generatedAt"], "2026-10-26T04:20:00Z")
        self.assertEqual(overlay["sourceSha256ByRun"], {"daily-20261026-primary": "a" * 64})
        self.assertEqual([row["id"] for row in overlay["effectiveRows"]], ["obs-ok", "obs-oos", "obs-pending"])
        self.assertEqual(overlay["effectiveRows"][0], {
            "id": "obs-ok", "run_id": "run-2026-10-26", "product_id": "product-a",
            "product_name": "iPhone 18 Pro 256GB", "category": "iPhone", "capacity": "256GB",
            "retailer_id": "retailer-fpt", "retailer_code": "FPT", "retailer_name": "FPT",
            "period_type": "daily", "period_key": "2026-10-26", "period_start": "2026-10-26",
            "observed_at": "2026-10-26T10:57:28+07:00", "effective_price_vnd": 41_990_000,
            "effective_in_stock": True, "fetch_ok": True, "effective_review_status": "confirmed",
            "confidence": "HTML_OK", "risk_flags": [], "source_method": "fpt_structured_offer_price",
            "latest_correction_id": None, "corrected_at": None,
        })
        self.assertEqual(overlay["effectiveRows"][1]["effective_in_stock"], False)
        self.assertIsNone(overlay["effectiveRows"][1]["effective_price_vnd"])
        self.assertEqual(overlay["effectiveRows"][2]["effective_review_status"], "pending")
        self.assertFalse(overlay["effectiveRows"][2]["fetch_ok"])
        serialized = json.dumps(overlay, ensure_ascii=False).lower()
        for forbidden in ["evidence", "error_message", "raw_html", "local_path", "/private/", "service_role", "secret"]:
            self.assertNotIn(forbidden, serialized)

    def test_merge_is_idempotent_and_retains_dates_in_stable_order(self):
        from daily_static_fallback import build_static_overlay, serialize_overlay

        first = build_static_overlay(sample_payload(), None, "a" * 64, "2026-10-26T04:20:00Z")
        repeated = build_static_overlay(sample_payload(), first, "a" * 64, "2026-10-26T04:21:00Z")
        second_payload = sample_payload("daily-20261027-primary", "2026-10-27")
        for row in second_payload["price_observations"]:
            row["id"] += "-20261027"
        second = build_static_overlay(second_payload, repeated, "b" * 64, "2026-10-27T04:20:00Z")

        self.assertEqual(len(repeated["effectiveRows"]), 3)
        self.assertEqual(serialize_overlay(first), serialize_overlay(repeated))
        self.assertEqual([run["run_key"] for run in second["runs"]], [
            "daily-20261026-primary", "daily-20261027-primary",
        ])
        self.assertEqual(
            sorted({row["period_start"] for row in second["effectiveRows"]}),
            ["2026-10-26", "2026-10-27"],
        )
        reordered = copy.deepcopy(second)
        reordered["effectiveRows"].reverse()
        reordered["runs"].reverse()
        self.assertEqual(serialize_overlay(second), serialize_overlay(reordered))

    def test_retry_replaces_visible_natural_key_but_keeps_both_run_records(self):
        from daily_static_fallback import build_static_overlay

        primary = build_static_overlay(sample_payload(), None, "a" * 64, "2026-10-26T04:20:00Z")
        retry_payload = sample_payload("daily-20261026-retry", "2026-10-26")
        retry_payload["crawl_runs"][0]["run_type"] = "retry"
        retry_payload["crawl_runs"][0]["parent_run_id"] = primary["runs"][0]["id"]
        retry_payload["price_observations"] = [copy.deepcopy(retry_payload["price_observations"][2])]
        retry_payload["price_observations"][0]["id"] = "obs-pending-retry"
        retry_payload["price_observations"][0]["price_vnd"] = 12_490_000
        retry_payload["price_observations"][0]["fetch_ok"] = True
        retry_payload["price_observations"][0]["review_status"] = "confirmed"
        retry_payload["price_observations"][0]["confidence"] = "VERIFIED_RENDER"
        retry_payload["crawl_runs"][0].update(total_targets=1, ok_count=1, oos_count=0, error_count=0)

        merged = build_static_overlay(retry_payload, primary, "b" * 64, "2026-10-26T08:20:00Z")

        self.assertEqual(len(merged["runs"]), 2)
        self.assertEqual(len(merged["effectiveRows"]), 3)
        watch = next(row for row in merged["effectiveRows"] if row["product_id"] == "product-b")
        self.assertEqual(watch["id"], "obs-pending-retry")
        self.assertEqual(watch["effective_price_vnd"], 12_490_000)

    def test_conflicting_observation_id_and_run_sha_are_rejected(self):
        from daily_static_fallback import build_static_overlay

        original = build_static_overlay(sample_payload(), None, "a" * 64, "2026-10-26T04:20:00Z")
        conflict = sample_payload()
        conflict["price_observations"][0]["price_vnd"] = 1
        with self.assertRaisesRegex(ValueError, "observation ID conflict"):
            build_static_overlay(conflict, original, "a" * 64, "2026-10-26T04:21:00Z")
        with self.assertRaisesRegex(ValueError, "SHA-256 conflict"):
            build_static_overlay(sample_payload(), original, "b" * 64, "2026-10-26T04:21:00Z")

    def test_receipt_and_atomic_write_use_incoming_run_count(self):
        from daily_static_fallback import build_static_overlay, static_receipt, write_overlay

        overlay = build_static_overlay(sample_payload(), None, "a" * 64, "2026-10-26T04:20:00Z")
        receipt = static_receipt(overlay, "daily-20261026-primary", "a" * 64)
        self.assertEqual(receipt, {
            "protocol_version": 1,
            "daily_run_key": "daily-20261026-primary",
            "source_sha256": "a" * 64,
            "row_count": 3,
            "latest_date": "2026-10-26",
        })
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "daily-fallback.json"
            write_overlay(target, overlay)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), overlay)
            self.assertEqual(list(target.parent.glob("*.tmp")), [])

    def test_publish_dispatch_inputs_writes_overlay_and_exact_receipt(self):
        from daily_static_fallback import publish_dispatch_inputs

        snapshot = (
            "model,retailer,url,status,final_price,confidence,risk_flags,fetched_at\n"
            "iPhone 18 Pro 256GB,FPT,https://example.test/a,OK,41990000,HTML_OK,,2026-10-26T10:57:28+07:00\n"
        ).encode("utf-8-sig")
        run = {
            "run_id": "daily-20261026-primary", "run_type": "primary",
            "started_at": "2026-10-26T11:00:00+07:00", "completed_at": "2026-10-26T11:15:00+07:00",
            "total_targets": 1, "ok_count": 1, "oos_count": 0, "error_count": 0,
            "change_count": 1, "review_count": 0, "status": "SUCCESS",
        }
        inputs = {
            "snapshot_gzip_b64": base64.b64encode(gzip.compress(snapshot)).decode("ascii"),
            "snapshot_sha256": hashlib.sha256(snapshot).hexdigest(),
            "run_json": json.dumps(run),
        }
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "daily-fallback.json"
            receipt = publish_dispatch_inputs(inputs, target, target, "2026-10-26T04:20:00Z")
            overlay = json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual(receipt["daily_run_key"], "daily-20261026-primary")
        self.assertEqual(receipt["row_count"], 1)
        self.assertEqual(receipt["latest_date"], "2026-10-26")
        self.assertEqual(len(overlay["effectiveRows"]), 1)


if __name__ == "__main__":
    unittest.main()
