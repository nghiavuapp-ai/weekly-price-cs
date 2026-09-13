import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class AutomationConfigTests(unittest.TestCase):
    def test_workflow_schedules_daily_shadow_after_the_local_validation_window(self):
        workflow = (ROOT / ".github/workflows/price-check.yml").read_text(encoding="utf-8")
        self.assertIn("schedule:", workflow)
        self.assertIn("cron: '17 13 * * *'", workflow)
        self.assertIn('timezone: "Asia/Ho_Chi_Minh"', workflow)
        self.assertIn("github.event_name == 'schedule' && 'shadow' || inputs.run_type", workflow)

    def test_workflow_is_manual_idempotent_and_least_privilege(self):
        workflow = (ROOT / ".github/workflows/price-check.yml").read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", workflow)
        self.assertRegex(workflow, r"options:\s*\n\s*- primary\s*\n\s*- retry\s*\n\s*- weekly\s*\n\s*- shadow")
        self.assertIn("permissions:\n  contents: read", workflow)
        self.assertIn("concurrency:", workflow)
        self.assertIn("timeout-minutes:", workflow)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY", workflow)
        self.assertIn("tools/cloud_price_check.py", workflow)
        self.assertIn("if: always()", workflow)
        self.assertNotRegex(workflow, r"uses:\s+[^\s]+@v\d")

    def test_dispatcher_validates_payload_and_uses_github_app(self):
        dispatcher = (ROOT / "supabase/functions/dispatch-price-check/index.ts").read_text(encoding="utf-8")
        for value in ("primary", "retry", "weekly", "shadow"):
            self.assertIn(f"'{value}'", dispatcher)
        self.assertIn("DISPATCH_SHARED_SECRET", dispatcher)
        self.assertIn("GITHUB_APP_PRIVATE_KEY", dispatcher)
        self.assertIn("access_tokens", dispatcher)
        self.assertIn("/dispatches", dispatcher)
        config = (ROOT / "supabase/config.toml").read_text(encoding="utf-8")
        self.assertIn("verify_jwt = false", config)

    def test_seed_schedules_vietnam_business_times_without_secrets(self):
        seed = (ROOT / "supabase/seed.sql").read_text(encoding="utf-8")
        self.assertIn("'0 4 * * *'", seed)     # 11:00 Asia/Ho_Chi_Minh
        self.assertIn("'30 4 * * *'", seed)    # 11:30 Asia/Ho_Chi_Minh
        self.assertIn("'0 5 * * 5'", seed)     # Friday 12:00 Asia/Ho_Chi_Minh
        self.assertNotRegex(seed, re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"))
        self.assertIn("vault.decrypted_secrets", seed)

    def test_vercel_builds_the_web_workspace(self):
        config = (ROOT / "vercel.json").read_text(encoding="utf-8")
        self.assertIn('"outputDirectory": "web/dist"', config)
        self.assertIn('"buildCommand": "npm --prefix web ci && npm --prefix web run build"', config)


if __name__ == "__main__":
    unittest.main()
