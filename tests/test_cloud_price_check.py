import datetime as dt
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import price_check_tool as price_check  # noqa: E402


class RunIdentityTests(unittest.TestCase):
    def setUp(self):
        try:
            import cloud_price_check  # noqa: PLC0415
        except ModuleNotFoundError:
            self.fail("cloud_price_check module is required")
        self.cloud = cloud_price_check

    def test_stable_ids_cover_primary_retry_weekly_and_shadow(self):
        when = dt.datetime(2026, 9, 11, 11, 30, tzinfo=self.cloud.LOCAL_TIMEZONE)

        identities = {
            run_type: self.cloud.make_run_identity(run_type, when)
            for run_type in ("primary", "retry", "weekly", "shadow")
        }

        self.assertEqual(identities["primary"].run_key, "daily-20260911-primary")
        self.assertEqual(identities["primary"].run_id, "2f02aefb-05e1-58f8-aba8-c2f9b300e0ad")
        self.assertEqual(identities["retry"].run_key, "daily-20260911-retry")
        self.assertEqual(identities["retry"].run_id, "843ece81-5f3e-57c4-99d9-a324c4221098")
        self.assertEqual(identities["weekly"].run_key, "weekly-W11Q4FY26")
        self.assertEqual(identities["weekly"].run_id, "2769fac1-f13d-54cd-83d9-ca61d80cf551")
        self.assertEqual(identities["shadow"].run_key, "shadow-20260911")
        self.assertEqual(identities["shadow"].run_id, "9397b4f9-10a0-5052-bde1-ae4a522569de")
        self.assertEqual(identities["retry"].parent_run_id, identities["primary"].run_id)

    def test_apple_week_selection_rolls_week_quarter_and_fiscal_year(self):
        cases = {
            dt.date(2026, 9, 6): ("W11Q4FY26", dt.date(2026, 9, 6)),
            dt.date(2026, 9, 12): ("W11Q4FY26", dt.date(2026, 9, 6)),
            dt.date(2026, 9, 13): ("W12Q4FY26", dt.date(2026, 9, 13)),
            dt.date(2026, 9, 27): ("W1Q1FY27", dt.date(2026, 9, 27)),
        }

        for day, expected in cases.items():
            with self.subTest(day=day):
                period = self.cloud.apple_week_period(day)
                self.assertEqual((period.key, period.start), expected)


class FakeReadClient:
    def __init__(self):
        self.calls = []

    def select(self, table, *, columns="*", filters=None, order=None, limit=None):
        self.calls.append((table, columns, filters, order, limit))
        rows = {
            "products": [
                {"id": "p-active", "name": "iPhone 17e 256GB", "category": "iPhone", "capacity": "256GB"},
            ],
            "retailers": [
                {"id": "r-fpt", "code": "FPT", "name": "FPT"},
                {"id": "r-sd", "code": "SHOPDUNK", "name": "Shopdunk"},
            ],
            "product_links": [
                {"id": "l-fpt", "product_id": "p-active", "retailer_id": "r-fpt", "url": "https://fpt.test/17e"},
                {"id": "l-sd", "product_id": "p-active", "retailer_id": "r-sd", "url": "https://shopdunk.test/17e"},
            ],
            "price_overrides": [
                {"id": "o-fpt", "product_link_id": "l-fpt", "override_price": 17_290_000, "note": "Confirmed"},
            ],
            "crawl_runs": [
                {"id": "run-primary", "run_key": "daily-20260911-primary"},
            ],
            "price_observations": [
                {"product_link_id": "l-fpt", "fetch_ok": False},
                {"product_link_id": "l-sd", "fetch_ok": True},
            ],
        }
        return rows[table]


class CatalogAndRetryTests(unittest.TestCase):
    def setUp(self):
        import cloud_price_check  # noqa: PLC0415

        self.cloud = cloud_price_check
        self.client = FakeReadClient()

    def test_active_database_rows_map_to_existing_targets_and_override_input(self):
        catalog = self.cloud.load_active_catalog(self.client)

        self.assertEqual(
            [(item.target.model, item.target.retailer, item.target.url) for item in catalog.items],
            [
                ("iPhone 17e 256GB", "FPT", "https://fpt.test/17e"),
                ("iPhone 17e 256GB", "Shopdunk", "https://shopdunk.test/17e"),
            ],
        )
        self.assertEqual(catalog.overrides, {"https://fpt.test/17e": (17_290_000, "Confirmed")})
        self.assertEqual(
            [(call[0], call[2]) for call in self.client.calls[:4]],
            [
                ("products", {"active": "eq.true"}),
                ("retailers", {"active": "eq.true"}),
                ("product_links", {"active": "eq.true"}),
                ("price_overrides", {"active": "eq.true"}),
            ],
        )

    def test_retry_uses_failed_observations_from_same_day_primary_run(self):
        catalog = self.cloud.load_active_catalog(self.client)

        selected = self.cloud.select_retry_items(
            self.client,
            catalog,
            dt.date(2026, 9, 11),
        )

        self.assertEqual([item.link_id for item in selected], ["l-fpt"])
        run_call = next(call for call in self.client.calls if call[0] == "crawl_runs")
        observation_call = next(call for call in self.client.calls if call[0] == "price_observations")
        self.assertEqual(run_call[2], {"run_key": "eq.daily-20260911-primary"})
        self.assertEqual(observation_call[2], {"run_id": "eq.run-primary", "fetch_ok": "eq.false"})

    def test_renamed_retailer_uses_immutable_code_for_crawler_rules(self):
        class RenamedRetailerClient(FakeReadClient):
            def select(self, table, **kwargs):
                rows = super().select(table, **kwargs)
                if table == "retailers":
                    rows[0] = {**rows[0], "name": "FPT Vietnam Display Name"}
                return rows

        catalog = self.cloud.load_active_catalog(RenamedRetailerClient())
        fpt = next(item for item in catalog.items if item.link_id == "l-fpt")

        self.assertEqual(fpt.target.retailer, "FPT")
        self.assertEqual(fpt.retailer_name, "FPT Vietnam Display Name")

    def test_uppercase_database_code_is_normalized_for_site_specific_parser_rules(self):
        catalog = self.cloud.load_active_catalog(self.client)
        shopdunk = next(item for item in catalog.items if item.link_id == "l-sd")

        self.assertEqual(shopdunk.target.retailer, "Shopdunk")


class ObservationTests(unittest.TestCase):
    def setUp(self):
        import cloud_price_check  # noqa: PLC0415

        self.cloud = cloud_price_check

    def test_result_serializes_success_and_full_crawler_evidence(self):
        item = self.cloud.CatalogItem(
            target=price_check.Target("iPhone 17e 256GB", "FPT", "https://fpt.test/17e"),
            product_id="p-active",
            retailer_id="r-fpt",
            link_id="l-fpt",
        )
        result = price_check.Result(
            model=item.target.model,
            retailer=item.target.retailer,
            url=item.target.url,
            value=17_290_000,
            status="OK",
            fetched_at="2026-09-11T11:00:12+07:00",
            base_value=17_990_000,
            discount=700_000,
            promo_note="Direct discount",
            source_method="fpt_structured_offer_price",
            html_price=17_290_000,
            rendered_price=17_290_000,
            previous_week_price=17_990_000,
            risk_flags="WARN_WEEK_CHANGE|OVERRIDE_USED",
            confidence="VERIFIED_RENDER",
            decision_note="render matched",
            availability="IN_STOCK",
            availability_method="rendered_dom",
            availability_text="Available",
            purchase_action="IN_STOCK",
            purchase_action_method="rendered_action:main button",
            purchase_action_text="Mua ngay",
        )
        identity = self.cloud.make_run_identity(
            "primary", dt.datetime(2026, 9, 11, 11, tzinfo=self.cloud.LOCAL_TIMEZONE)
        )

        row = self.cloud.result_to_observation(result, item, identity)

        self.assertEqual(row["id"], "0fa571dc-3dbb-53ee-bc20-584885cc1a67")
        self.assertEqual(row["run_id"], identity.run_id)
        self.assertEqual(row["period_key"], "2026-09-11")
        self.assertEqual(row["price_vnd"], 17_290_000)
        self.assertIs(row["in_stock"], True)
        self.assertTrue(row["fetch_ok"])
        self.assertEqual(row["review_status"], "confirmed")
        self.assertEqual(row["risk_flags"], ["OVERRIDE_USED", "WARN_WEEK_CHANGE"])
        self.assertEqual(row["evidence"]["purchase_action_text"], "Mua ngay")
        self.assertEqual(row["evidence"]["discount"], 700_000)

    def test_failed_fetch_is_an_observation_with_unknown_stock(self):
        item = self.cloud.CatalogItem(
            target=price_check.Target("iPhone 17e 256GB", "Viettel", "https://viettel.test/17e"),
            product_id="p-active",
            retailer_id="r-vt",
            link_id="l-vt",
        )
        result = price_check.Result(
            item.target.model,
            item.target.retailer,
            item.target.url,
            None,
            "URL_ERROR",
            error="certificate verify failed",
            fetched_at="2026-09-11T11:00:30+07:00",
            risk_flags="WARN_FETCH_STATUS",
            confidence="REVIEW",
        )
        identity = self.cloud.make_run_identity(
            "primary", dt.datetime(2026, 9, 11, 11, tzinfo=self.cloud.LOCAL_TIMEZONE)
        )

        row = self.cloud.result_to_observation(result, item, identity)

        self.assertFalse(row["fetch_ok"])
        self.assertIsNone(row["in_stock"])
        self.assertIsNone(row["price_vnd"])
        self.assertEqual(row["review_status"], "pending")
        self.assertEqual(row["error_message"], "certificate verify failed")


class RestAndDuplicateTests(unittest.TestCase):
    def setUp(self):
        import cloud_price_check  # noqa: PLC0415

        self.cloud = cloud_price_check

    def test_append_only_rest_write_ignores_duplicate_ids(self):
        requests = []

        def sender(request, timeout):
            requests.append((request, timeout))
            return []

        client = self.cloud.SupabaseRestClient(
            "https://example.supabase.co", "server-secret", sender=sender
        )

        client.insert_ignore("price_observations", [{"id": "observation-1"}])

        request, timeout = requests[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(timeout, 60)
        self.assertIn("on_conflict=id", request.full_url)
        self.assertIn("resolution=ignore-duplicates", request.get_header("Prefer"))
        self.assertEqual(json.loads(request.data), [{"id": "observation-1"}])
        self.assertNotIn("server-secret", request.full_url)

    class RunClient(FakeReadClient):
        def __init__(self, existing_run=None, existing_observations=None, primary_run=None):
            super().__init__()
            self.existing_run = existing_run
            self.existing_observations = existing_observations or []
            self.primary_run = primary_run
            self.writes = []

        def select(self, table, *, columns="*", filters=None, order=None, limit=None):
            self.calls.append((table, columns, filters, order, limit))
            if table == "crawl_runs":
                if filters and "id" in filters:
                    return [self.existing_run] if self.existing_run else []
                return [self.primary_run] if self.primary_run else []
            if table == "price_observations":
                return list(self.existing_observations)
            if table == "weekly_price_history":
                return []
            return super().select(table, columns=columns, filters=filters, order=order, limit=limit)

        def insert_ignore(self, table, rows):
            self.writes.append(("insert", table, rows))

        def update(self, table, values, *, filters):
            self.writes.append(("update", table, values, filters))

    def test_completed_existing_run_is_a_no_op_before_crawling_or_writing(self):
        client = self.RunClient(existing_run={
            "id": "2f02aefb-05e1-58f8-aba8-c2f9b300e0ad",
            "run_key": "daily-20260911-primary",
            "status": "success",
            "completed_at": "2026-09-11T11:05:00+07:00",
        })
        crawled = []
        now = dt.datetime(2026, 9, 11, 11, tzinfo=self.cloud.LOCAL_TIMEZONE)

        outcome = self.cloud.execute_run(
            client,
            run_type="primary",
            now=now,
            dry_run=False,
            limit=0,
            crawl=lambda *_: crawled.append(True),
            backcheck=lambda *_: None,
        )

        self.assertEqual(outcome["status"], "duplicate_noop")
        self.assertEqual(crawled, [])
        self.assertEqual(client.writes, [])

    def test_incomplete_run_resumes_missing_observations_and_finalizes(self):
        existing = {
            "id": "existing-fpt-observation",
            "product_id": "p-active",
            "retailer_id": "r-fpt",
            "product_link_id": "l-fpt",
            "in_stock": True,
            "fetch_ok": True,
            "review_status": "confirmed",
        }
        client = self.RunClient(
            existing_run={
                "id": "2f02aefb-05e1-58f8-aba8-c2f9b300e0ad",
                "run_key": "daily-20260911-primary",
                "status": "running",
                "completed_at": None,
                "scheduled_for": "2026-09-11T11:00:00+07:00",
                "started_at": "2026-09-11T11:00:02+07:00",
            },
            existing_observations=[existing],
        )
        crawled = []

        def crawl(target, _overrides):
            crawled.append(target.url)
            return price_check.Result(
                target.model,
                target.retailer,
                target.url,
                17_190_000,
                "OK",
                fetched_at="2026-09-11T11:06:00+07:00",
                source_method="structured_offer_price",
                purchase_action="IN_STOCK",
            )

        with tempfile.TemporaryDirectory() as tmp:
            outcome = self.cloud.execute_run(
                client,
                run_type="primary",
                now=dt.datetime(2026, 9, 11, 11, tzinfo=self.cloud.LOCAL_TIMEZONE),
                dry_run=False,
                limit=0,
                crawl=crawl,
                backcheck=lambda *_: None,
                output_dir=Path(tmp),
            )

        self.assertEqual(crawled, ["https://shopdunk.test/17e"])
        observation_insert = next(write for write in client.writes if write[:2] == ("insert", "price_observations"))
        self.assertEqual([row["product_link_id"] for row in observation_insert[2]], ["l-sd"])
        self.assertFalse(any(write[:2] == ("insert", "crawl_runs") for write in client.writes))
        run_update = next(write for write in client.writes if write[:2] == ("update", "crawl_runs"))
        self.assertEqual(run_update[2]["status"], "success")
        self.assertEqual(run_update[2]["total_targets"], 2)
        self.assertEqual(run_update[2]["ok_count"], 2)
        self.assertEqual(run_update[2]["scheduled_for"], "2026-09-11T11:00:00+07:00")
        self.assertEqual(run_update[2]["started_at"], "2026-09-11T11:00:02+07:00")
        self.assertEqual(outcome["status"], "success")

    def test_retry_without_primary_records_safe_no_retry_without_parent_fk(self):
        client = self.RunClient()

        with tempfile.TemporaryDirectory() as tmp:
            outcome = self.cloud.execute_run(
                client,
                run_type="retry",
                now=dt.datetime(2026, 9, 11, 11, 30, tzinfo=self.cloud.LOCAL_TIMEZONE),
                dry_run=False,
                limit=0,
                crawl=lambda *_: self.fail("retry without a primary must not crawl"),
                backcheck=lambda *_: None,
                output_dir=Path(tmp),
            )

        run_insert = next(write for write in client.writes if write[:2] == ("insert", "crawl_runs"))
        run_update = next(write for write in client.writes if write[:2] == ("update", "crawl_runs"))
        self.assertIsNone(run_insert[2][0]["parent_run_id"])
        self.assertIsNone(run_update[2]["parent_run_id"])
        self.assertEqual(run_update[2]["status"], "no_retry")
        self.assertEqual(outcome["status"], "no_retry")


class RunOptionTests(unittest.TestCase):
    def setUp(self):
        import cloud_price_check  # noqa: PLC0415

        self.cloud = cloud_price_check

    def test_limit_is_rejected_for_all_canonical_production_runs(self):
        for run_type in ("primary", "retry", "weekly"):
            with self.subTest(run_type=run_type):
                with self.assertRaisesRegex(ValueError, "--limit requires --dry-run or --run-type shadow"):
                    self.cloud.validate_run_options(run_type, dry_run=False, limit=1)

    def test_limit_is_allowed_for_dry_run_and_shadow(self):
        self.cloud.validate_run_options("primary", dry_run=True, limit=1)
        self.cloud.validate_run_options("shadow", dry_run=False, limit=1)


class BrowserRuntimeTests(unittest.TestCase):
    def test_linux_runtime_is_discovered_and_environment_can_override_every_path(self):
        discovered = {
            "node": "/usr/bin/node",
            "chromium": "/usr/bin/chromium",
        }

        runtime = price_check.resolve_browser_runtime(
            env={}, platform_name="linux", which=lambda name: discovered.get(name)
        )

        self.assertEqual(runtime.node_bin, Path("/usr/bin/node"))
        self.assertEqual(runtime.chromium_bin, Path("/usr/bin/chromium"))

        overridden = price_check.resolve_browser_runtime(
            env={
                "PRICE_CHECK_NODE_BIN": "/opt/node",
                "PRICE_CHECK_NODE_PATH": "/opt/node_modules",
                "PRICE_CHECK_CHROMIUM_BIN": "/opt/chrome",
            },
            platform_name="linux",
            which=lambda _name: None,
        )
        self.assertEqual(overridden.node_bin, Path("/opt/node"))
        self.assertEqual(overridden.node_path, Path("/opt/node_modules"))
        self.assertEqual(overridden.chromium_bin, Path("/opt/chrome"))


if __name__ == "__main__":
    unittest.main()
