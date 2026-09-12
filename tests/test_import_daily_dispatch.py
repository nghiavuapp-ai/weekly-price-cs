import base64
import gzip
import hashlib
import json
import tempfile
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from import_daily_dispatch import (  # noqa: E402
    build_dispatch_payload,
    is_terminal_run_uploaded,
    load_dispatch_inputs,
)


class DailyDispatchImportTests(unittest.TestCase):
    def test_reads_inputs_from_github_event_without_putting_snapshot_in_step_env(self):
        event_path = Path(tempfile.mkdtemp()) / "event.json"
        event_path.write_text(json.dumps({"inputs": {
            "snapshot_gzip_b64": "encoded",
            "snapshot_sha256": "hash",
            "run_json": "{}",
        }}), encoding="utf-8")

        inputs = load_dispatch_inputs({}, event_path)

        self.assertEqual(inputs, {
            "snapshot_gzip_b64": "encoded",
            "snapshot_sha256": "hash",
            "run_json": "{}",
        })

    def test_completed_run_is_a_duplicate_noop_before_any_upsert(self):
        requests = []

        def sender(request, timeout):
            requests.append((request, timeout))
            return [{"id": "run-id", "status": "success"}]

        uploaded = is_terminal_run_uploaded(
            {"crawl_runs": [{"id": "run-id"}]},
            "https://example.supabase.co",
            "service-key",
            sender=sender,
        )

        self.assertTrue(uploaded)
        self.assertEqual(len(requests), 1)
        self.assertIn("crawl_runs", requests[0][0].full_url)
        self.assertIn("id=eq.run-id", requests[0][0].full_url)

    def test_decodes_verified_snapshot_and_builds_one_daily_run(self):
        snapshot = (
            "model,retailer,url,status,final_price,confidence,risk_flags,fetched_at\n"
            "iPhone 17e 256GB,FPT,https://example.test/a,OK,20590000,HTML_OK,,2026-09-12T11:02:00+07:00\n"
            "iPhone 17e 256GB,Shopdunk,https://example.test/b,OOS,,OOS_CONFIRMED,,2026-09-12T11:02:01+07:00\n"
        ).encode("utf-8-sig")
        run = {
            "run_id": "daily-20260912-primary",
            "run_type": "primary",
            "started_at": "2026-09-12T11:00:00+07:00",
            "completed_at": "2026-09-12T11:11:53+07:00",
            "total_targets": 2,
            "ok_count": 1,
            "oos_count": 1,
            "error_count": 0,
            "change_count": 2,
            "review_count": 0,
            "status": "SUCCESS",
        }

        payload = build_dispatch_payload(
            snapshot_gzip_b64=base64.b64encode(gzip.compress(snapshot)).decode("ascii"),
            snapshot_sha256=hashlib.sha256(snapshot).hexdigest(),
            run_json=json.dumps(run),
            generated_at="2026-09-12T04:15:00Z",
        )

        self.assertEqual(payload["crawl_runs"][0]["run_key"], "daily-20260912-primary")
        self.assertEqual(payload["crawl_runs"][0]["change_count"], 2)
        self.assertEqual(len(payload["price_observations"]), 2)
        self.assertEqual(
            sorted(row["in_stock"] for row in payload["price_observations"]),
            [False, True],
        )

    def test_rejects_snapshot_when_hash_does_not_match(self):
        snapshot = b"model,retailer,status\n"

        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            build_dispatch_payload(
                snapshot_gzip_b64=base64.b64encode(gzip.compress(snapshot)).decode("ascii"),
                snapshot_sha256="0" * 64,
                run_json=json.dumps({"run_id": "daily-20260912-primary"}),
                generated_at="2026-09-12T04:15:00Z",
            )


if __name__ == "__main__":
    unittest.main()
