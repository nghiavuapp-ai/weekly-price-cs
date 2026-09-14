#!/usr/bin/env python3
"""Compare a cloud shadow crawl with the same-day local Daily observations."""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Mapping, Sequence

from cloud_price_check import SupabaseRestClient


REFERENCE_COLUMNS = (
    "product_id,retailer_id,product_name,retailer_code,retailer_name,observed_at,"
    "effective_price_vnd,effective_in_stock,fetch_ok,effective_review_status,risk_flags"
)


def _key(row: Mapping) -> tuple[str, str]:
    return str(row.get("product_id", "")), str(row.get("retailer_id", ""))


def _latest_by_key(rows: Sequence[Mapping]) -> dict[tuple[str, str], dict]:
    latest: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = _key(row)
        if not all(key):
            continue
        candidate = dict(row)
        if key not in latest or str(candidate.get("observed_at", "")) >= str(latest[key].get("observed_at", "")):
            latest[key] = candidate
    return latest


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator * 100 / denominator, 2) if denominator else None


def _quality_gate(status: str, counts: Mapping[str, int], rates: Mapping[str, float | None]) -> dict:
    """Encode the promotion contract in the artifact itself."""
    required = {
        "status": "compared",
        "cloud_only": 0,
        "reference_only": 0,
        "shadow_fetch_errors": 0,
        "shadow_pending_reviews": 0,
        "price_mismatches": 0,
        "stock_mismatches": 0,
        "price_match_pct": 100.0,
        "stock_match_pct": 100.0,
    }
    if status != "compared":
        return {
            "status": "waiting_local",
            "passed": False,
            "failed_checks": ["status"],
            "required": required,
        }
    actual = {**counts, **rates, "status": status}
    failed_checks = [key for key, expected in required.items() if actual.get(key) != expected]
    return {
        "status": "passed" if not failed_checks else "failed",
        "passed": not failed_checks,
        "failed_checks": failed_checks,
        "required": required,
    }


def compare_rows(
    shadow_observations: Sequence[Mapping],
    reference_rows: Sequence[Mapping],
    *,
    period_key: str,
) -> dict:
    """Return an audit report without treating missing local input as a failure."""
    shadow = _latest_by_key(shadow_observations)
    reference = _latest_by_key(reference_rows)
    common_keys = sorted(shadow.keys() & reference.keys())
    cloud_only_keys = sorted(shadow.keys() - reference.keys())
    reference_only_keys = sorted(reference.keys() - shadow.keys())

    price_matches = price_mismatches = price_comparable = 0
    stock_matches = stock_mismatches = 0
    mismatches: list[dict] = []
    partner_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"common": 0, "price_matches": 0, "price_mismatches": 0,
                 "stock_matches": 0, "stock_mismatches": 0}
    )

    for key in common_keys:
        cloud = shadow[key]
        local = reference[key]
        partner = str(local.get("retailer_code") or local.get("retailer_name") or key[1])
        group = partner_counts[partner]
        group["common"] += 1

        cloud_stock = cloud.get("in_stock")
        local_stock = local.get("effective_in_stock")
        stock_equal = cloud_stock == local_stock
        if stock_equal:
            stock_matches += 1
            group["stock_matches"] += 1
        else:
            stock_mismatches += 1
            group["stock_mismatches"] += 1

        price_equal: bool | None = None
        if cloud_stock is True and local_stock is True:
            price_comparable += 1
            price_equal = cloud.get("price_vnd") == local.get("effective_price_vnd")
            if price_equal:
                price_matches += 1
                group["price_matches"] += 1
            else:
                price_mismatches += 1
                group["price_mismatches"] += 1

        if not stock_equal or price_equal is False:
            mismatches.append({
                "product_id": key[0],
                "retailer_id": key[1],
                "product_name": local.get("product_name"),
                "partner": partner,
                "cloud": {
                    "price_vnd": cloud.get("price_vnd"),
                    "in_stock": cloud_stock,
                    "fetch_ok": cloud.get("fetch_ok"),
                    "review_status": cloud.get("review_status"),
                    "risk_flags": cloud.get("risk_flags") or [],
                },
                "local": {
                    "price_vnd": local.get("effective_price_vnd"),
                    "in_stock": local_stock,
                    "observed_at": local.get("observed_at"),
                },
            })

    counts = {
        "shadow_total": len(shadow),
        "reference_total": len(reference),
        "common_total": len(common_keys),
        "cloud_only": len(cloud_only_keys),
        "reference_only": len(reference_only_keys),
        "shadow_fetch_errors": sum(not row.get("fetch_ok", False) for row in shadow.values()),
        "shadow_pending_reviews": sum(row.get("review_status") == "pending" for row in shadow.values()),
        "price_matches": price_matches,
        "price_mismatches": price_mismatches,
        "stock_matches": stock_matches,
        "stock_mismatches": stock_mismatches,
    }
    status = "compared" if reference else "waiting_local"
    rates = {
        "catalog_overlap_pct": _rate(len(common_keys), len(reference)),
        "price_match_pct": _rate(price_matches, price_comparable),
        "stock_match_pct": _rate(stock_matches, len(common_keys)),
    }
    return {
        "status": status,
        "period_key": period_key,
        "counts": counts,
        "rates": rates,
        "quality_gate": _quality_gate(status, counts, rates),
        "by_partner": dict(sorted(partner_counts.items())),
        "mismatches": mismatches,
        "cloud_only": [dict(shadow[key]) for key in cloud_only_keys],
        "reference_only": [dict(reference[key]) for key in reference_only_keys],
    }


def _latest_shadow_path(output_dir: Path) -> Path:
    candidates = sorted(output_dir.glob("shadow-[0-9]*.json"))
    if not candidates:
        raise FileNotFoundError(f"No shadow payload found in {output_dir}")
    return candidates[-1]


def create_comparison(output_dir: Path, client: SupabaseRestClient) -> dict:
    shadow_path = _latest_shadow_path(output_dir)
    payload = json.loads(shadow_path.read_text(encoding="utf-8"))
    period_key = str(payload.get("run", {}).get("period_key") or "")
    if not period_key:
        raise ValueError(f"Shadow payload has no run.period_key: {shadow_path}")
    reference = client.select(
        "effective_price_observations",
        columns=REFERENCE_COLUMNS,
        filters={"period_type": "eq.daily", "period_key": f"eq.{period_key}"},
        order="observed_at.asc",
    )
    report = compare_rows(payload.get("observations", []), reference, period_key=period_key)
    report["shadow_payload"] = shadow_path.name
    report_path = output_dir / f"shadow-comparison-{period_key.replace('-', '')}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    report["output_path"] = str(report_path)
    return report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shadow-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        parser.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    report = create_comparison(args.shadow_dir, SupabaseRestClient(supabase_url, service_key))
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
