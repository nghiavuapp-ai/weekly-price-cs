import datetime as dt
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import shadow_gate  # noqa: E402


class ShadowGateTests(unittest.TestCase):
    def test_scheduled_shadow_and_production_runs_are_mutually_exclusive(self):
        self.assertTrue(shadow_gate.scheduled_run_allowed("shadow", production_enabled=False))
        self.assertFalse(shadow_gate.scheduled_run_allowed("primary", production_enabled=False))
        self.assertFalse(shadow_gate.scheduled_run_allowed("shadow", production_enabled=True))
        self.assertTrue(shadow_gate.scheduled_run_allowed("primary", production_enabled=True))
        self.assertTrue(shadow_gate.scheduled_run_allowed("retry", production_enabled=True))
        self.assertTrue(shadow_gate.scheduled_run_allowed("weekly", production_enabled=True))

    def test_seven_contiguous_passes_promote(self):
        rows = [
            {"period_key": (dt.date(2026, 9, 7) + dt.timedelta(days=index)).isoformat(), "passed": True}
            for index in range(7)
        ]

        result = shadow_gate.evaluate_streak(rows)

        self.assertEqual(result["consecutive_passes"], 7)
        self.assertTrue(result["should_promote"])
        self.assertEqual(result["latest_period_key"], "2026-09-13")

    def test_failure_or_calendar_gap_breaks_streak(self):
        failed = [
            {"period_key": "2026-09-13", "passed": True},
            {"period_key": "2026-09-12", "passed": False},
            {"period_key": "2026-09-11", "passed": True},
        ]
        gap = [
            {"period_key": "2026-09-13", "passed": True},
            {"period_key": "2026-09-11", "passed": True},
        ]

        self.assertEqual(shadow_gate.evaluate_streak(failed)["consecutive_passes"], 1)
        self.assertEqual(shadow_gate.evaluate_streak(gap)["consecutive_passes"], 1)

    def test_record_updates_state_and_latches_production_after_promotion(self):
        class FakeClient:
            def __init__(self):
                self.upserts = []
                self.updates = []

            def upsert(self, table, rows, *, on_conflict):
                self.upserts.append((table, rows, on_conflict))

            def select(self, table, **kwargs):
                if table == "shadow_quality_runs":
                    return [
                        {"period_key": (dt.date(2026, 9, 7) + dt.timedelta(days=index)).isoformat(),
                         "passed": True}
                        for index in range(7)
                    ]
                return [{"production_enabled": False}]

            def update(self, table, values, *, filters):
                self.updates.append((table, values, filters))

        client = FakeClient()
        report = {
            "period_key": "2026-09-13",
            "quality_gate": {"status": "passed", "passed": True, "failed_checks": []},
        }

        result = shadow_gate.record_report(client, report)

        self.assertTrue(result["production_enabled"])
        self.assertEqual(client.upserts[0][0], "shadow_quality_runs")
        self.assertEqual(client.updates[0][0], "price_automation_state")
        self.assertTrue(client.updates[0][1]["production_enabled"])


if __name__ == "__main__":
    unittest.main()
