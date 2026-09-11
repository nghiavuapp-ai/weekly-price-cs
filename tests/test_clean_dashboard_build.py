import csv
import datetime as dt
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import build_clean_dashboard


class DashboardBuildTests(unittest.TestCase):
    def test_built_artifact_embeds_daily_contract_without_source_urls(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            weekly = root / "weekly.csv"
            summary = root / "summary.json"
            daily_book = root / "daily.xlsx"
            snapshot = root / "snapshot.csv"
            target = root / "dashboard.html"

            with weekly.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "week_id", "week_number", "quarter", "fiscal_year", "category",
                    "raw_model", "canonical_model", "capacity", "partner", "price_vnd",
                    "stock_status", "price_change_note", "source_sheet", "source_row",
                    "source_url", "mapping_status", "import_batch_id",
                ])
                writer.writeheader()
                writer.writerow({
                    "week_id": "W11Q4FY26", "week_number": 11, "quarter": 4,
                    "fiscal_year": 26, "category": "iPhone", "raw_model": "iPhone 15 128GB",
                    "canonical_model": "iPhone 15 128GB", "capacity": "128GB", "partner": "FPT",
                    "price_vnd": 18_000_000, "stock_status": "In stock",
                })
            summary.write_text(json.dumps({"partners": {"FPT": 1}, "categories": {"iPhone": 1}}), encoding="utf-8")
            with snapshot.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "model", "retailer", "final_price", "status", "confidence", "risk_flags",
                    "fetched_at", "url",
                ])
                writer.writeheader()
                writer.writerow({
                    "model": "iPhone 15 128GB", "retailer": "FPT", "final_price": 17_900_000,
                    "status": "OK", "confidence": "HTML_OK", "fetched_at": "2026-09-10T11:00:00",
                    "url": "https://example.invalid/private-source",
                })
            workbook = Workbook()
            log = workbook.active
            log.title = "Run Log"
            log.append([
                "Run ID", "Parent Run ID", "Run Type", "Started At", "Completed At",
                "Total Targets", "OK", "OOS", "Errors", "Changes", "Review Needed",
                "Status", "Snapshot Path", "Review Path", "Backup Path",
            ])
            log.append([
                "daily-20260910-primary", "", "primary", dt.datetime(2026, 9, 10, 11),
                dt.datetime(2026, 9, 10, 11, 5), 1, 1, 0, 0, 0, 0, "SUCCESS", str(snapshot), "", "",
            ])
            workbook.save(daily_book)

            build_clean_dashboard.build(weekly, summary, daily_book, target)

            html = target.read_text(encoding="utf-8")
            match = re.search(r"const PAYLOAD=(\{.*?\}),weeklyRows=", html)
            self.assertIsNotNone(match)
            payload = json.loads(match.group(1))
            self.assertEqual(payload["dailyDates"], ["2026-09-10"])
            self.assertEqual(payload["dailyRows"][0]["price_vnd"], 17_900_000)
            self.assertNotIn("example.invalid", html)
            self.assertIn('id="periodMode"', html)
            self.assertIn('id="backWeekly"', html)
            self.assertIn('role="button" tabindex="0"', html)
            self.assertIn("event.key==='Enter'||event.key===' '", html)
            self.assertIn("Chưa kiểm tra lại", html)


if __name__ == "__main__":
    unittest.main()
