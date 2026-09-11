#!/usr/bin/env python3
"""Generate the frontend fallback fixture from the current clean project data."""
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = ROOT / "web"
sys.path.insert(0, str(ROOT / "tools"))

from import_supabase_data import build_project_payload  # noqa: E402


def effective_row(observation: dict, products: dict[str, dict], retailers: dict[str, dict]) -> dict:
    product = products[observation["product_id"]]
    retailer = retailers[observation["retailer_id"]]
    return {
        "id": observation["id"],
        "run_id": observation["run_id"],
        "product_id": observation["product_id"],
        "product_name": product["name"],
        "category": product["category"],
        "capacity": product["capacity"] or None,
        "retailer_id": observation["retailer_id"],
        "retailer_code": retailer["code"],
        "retailer_name": retailer["name"],
        "period_type": observation["period_type"],
        "period_key": observation["period_key"],
        "period_start": observation["period_start"],
        "observed_at": observation["observed_at"],
        "effective_price_vnd": observation["price_vnd"],
        "effective_in_stock": observation["in_stock"],
        "fetch_ok": observation["fetch_ok"],
        "effective_review_status": observation["review_status"],
        "confidence": observation["confidence"],
        "risk_flags": observation["risk_flags"],
        "source_method": observation["source_method"],
        "latest_correction_id": None,
        "corrected_at": None,
    }


def main() -> None:
    payload = build_project_payload(ROOT, generated_at="2026-09-11T00:00:00+07:00")
    observations = payload["price_observations"]
    weekly_periods = sorted({
        row["period_start"] for row in observations if row["period_type"] == "weekly"
    })[-13:]
    kept = [
        row for row in observations
        if row["period_type"] == "daily" or row["period_start"] in weekly_periods
    ]
    kept_run_ids = {row["run_id"] for row in kept}
    products = {row["id"]: row for row in payload["products"]}
    retailers = {row["id"]: row for row in payload["retailers"]}
    effective = [effective_row(row, products, retailers) for row in kept]
    effective.sort(key=lambda row: (
        row["period_start"], row["observed_at"], row["product_name"], row["retailer_code"]
    ))
    latest_daily = max(
        (row["period_start"] for row in kept if row["period_type"] == "daily"), default=None
    )
    latest_weekly = max(weekly_periods, default=None)
    fixture = {
        "generatedAt": payload["generated_at"],
        "effectiveRows": effective,
        "health": [
            {"check_name": "daily_stale", "healthy": latest_daily is not None, "detail": {"latest_daily": latest_daily}},
            {"check_name": "retry_unresolved", "healthy": True, "detail": {"unresolved_runs": 0}},
            {"check_name": "weekly_missing", "healthy": latest_weekly is not None, "detail": {"latest_weekly": latest_weekly}},
            {"check_name": "run_incomplete", "healthy": True, "detail": {"incomplete_runs": 0}},
        ],
        "runs": [row for row in payload["crawl_runs"] if row["id"] in kept_run_ids],
        "products": payload["products"],
        "retailers": payload["retailers"],
        "productLinks": payload["product_links"],
        "priceOverrides": payload["price_overrides"],
    }
    target = WEB_ROOT / "src" / "data" / "fixture.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(fixture, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {target}: {len(effective)} observations, "
        f"{len(weekly_periods)} Weekly periods, {len(fixture['runs'])} runs"
    )


if __name__ == "__main__":
    main()
