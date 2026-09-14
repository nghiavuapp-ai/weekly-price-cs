#!/usr/bin/env python3
"""Persist shadow quality evidence and expose the cloud production latch."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
from typing import Mapping, Sequence

from cloud_price_check import SupabaseRestClient


STATE_ID = "apple_price_check"
REQUIRED_STREAK = 7


def evaluate_streak(rows: Sequence[Mapping]) -> dict:
    normalized = sorted(
        ({"period_key": str(row.get("period_key", "")), "passed": row.get("passed") is True} for row in rows),
        key=lambda row: row["period_key"],
        reverse=True,
    )
    streak = 0
    expected: dt.date | None = None
    latest = normalized[0]["period_key"] if normalized else None
    for row in normalized:
        try:
            day = dt.date.fromisoformat(row["period_key"])
        except ValueError:
            break
        if not row["passed"] or (expected is not None and day != expected):
            break
        streak += 1
        expected = day - dt.timedelta(days=1)
    return {
        "consecutive_passes": streak,
        "should_promote": streak >= REQUIRED_STREAK,
        "latest_period_key": latest,
    }


def production_status(client: SupabaseRestClient) -> dict:
    rows = client.select(
        "price_automation_state",
        columns="id,production_enabled,consecutive_passes,last_shadow_date,promoted_at,updated_at",
        filters={"id": f"eq.{STATE_ID}"},
        limit=1,
    )
    if not rows:
        return {"production_enabled": False, "consecutive_passes": 0, "state_missing": True}
    return dict(rows[0])


def record_report(client: SupabaseRestClient, report: Mapping) -> dict:
    period_key = str(report.get("period_key") or "")
    dt.date.fromisoformat(period_key)
    gate = report.get("quality_gate") or {}
    passed = gate.get("passed") is True
    client.upsert(
        "shadow_quality_runs",
        [{
            "period_key": period_key,
            "passed": passed,
            "status": str(gate.get("status") or report.get("status") or "unknown"),
            "failed_checks": list(gate.get("failed_checks") or []),
            "report": dict(report),
        }],
        on_conflict="period_key",
    )
    history = client.select(
        "shadow_quality_runs",
        columns="period_key,passed",
        order="period_key.desc",
        limit=30,
    )
    streak = evaluate_streak(history)
    current = production_status(client)
    already_enabled = current.get("production_enabled") is True
    production_enabled = already_enabled or streak["should_promote"]
    values = {
        "production_enabled": production_enabled,
        "consecutive_passes": streak["consecutive_passes"],
        "last_shadow_date": period_key,
        "updated_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
    }
    if production_enabled and not already_enabled:
        values["promoted_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    if current.get("state_missing"):
        client.upsert(
            "price_automation_state",
            [{"id": STATE_ID, **values}],
            on_conflict="id",
        )
    else:
        client.update("price_automation_state", values, filters={"id": f"eq.{STATE_ID}"})
    return {**streak, "production_enabled": production_enabled}


def _client() -> SupabaseRestClient:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return SupabaseRestClient(url, key)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    record = subparsers.add_parser("record")
    record.add_argument("--report", type=Path, required=True)
    subparsers.add_parser("status")
    args = parser.parse_args(argv)
    client = _client()
    if args.command == "record":
        result = record_report(client, json.loads(args.report.read_text(encoding="utf-8")))
    else:
        result = production_status(client)
        output_path = os.environ.get("GITHUB_OUTPUT")
        if output_path:
            with Path(output_path).open("a", encoding="utf-8") as output:
                output.write(f"allowed={'true' if result.get('production_enabled') else 'false'}\n")
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
