#!/usr/bin/env python3
"""Run the validated Price Check crawler against Supabase-backed configuration."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Callable, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

import price_check_tool as price_check


ROOT = Path(__file__).resolve().parents[1]
LOCAL_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
APPLE_WEEK_ANCHOR_DATE = dt.date(2026, 9, 6)
APPLE_WEEK_ANCHOR_ID = "W11Q4FY26"
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "cloud"


@dataclass(frozen=True)
class Period:
    key: str
    start: dt.date
    period_type: str


@dataclass(frozen=True)
class RunIdentity:
    run_id: str
    run_key: str
    run_type: str
    period: Period
    parent_run_id: str | None = None


@dataclass(frozen=True)
class CatalogItem:
    target: price_check.Target
    product_id: str
    retailer_id: str
    link_id: str
    retailer_name: str = ""


@dataclass(frozen=True)
class Catalog:
    items: tuple[CatalogItem, ...]
    overrides: dict[str, tuple[int, str]]

    @property
    def by_link_id(self) -> dict[str, CatalogItem]:
        return {item.link_id: item for item in self.items}


@dataclass(frozen=True)
class RetrySelection:
    primary_run_id: str | None
    items: tuple[CatalogItem, ...]


def _stable_id(kind: str, *parts: object) -> str:
    value = "/".join(("price-check", kind, *(str(part) for part in parts)))
    return str(uuid.uuid5(uuid.NAMESPACE_URL, value))


def apple_week_period(day: dt.date) -> Period:
    """Return the Sunday-based Apple fiscal week containing ``day``."""
    match = re.fullmatch(r"W(\d+)Q(\d+)FY(\d+)", APPLE_WEEK_ANCHOR_ID)
    if not match:  # pragma: no cover - module constant integrity.
        raise ValueError(f"Invalid Apple week anchor: {APPLE_WEEK_ANCHOR_ID}")
    anchor_week, anchor_quarter, anchor_year = map(int, match.groups())
    delta_weeks = (day - APPLE_WEEK_ANCHOR_DATE).days // 7
    serial = ((anchor_year * 4 + anchor_quarter - 1) * 13 + anchor_week - 1) + delta_weeks
    quarter_serial, week_index = divmod(serial, 13)
    fiscal_year, quarter_index = divmod(quarter_serial, 4)
    start = APPLE_WEEK_ANCHOR_DATE + dt.timedelta(weeks=delta_weeks)
    return Period(
        key=f"W{week_index + 1}Q{quarter_index + 1}FY{fiscal_year:02d}",
        start=start,
        period_type="weekly",
    )


def make_run_identity(run_type: str, when: dt.datetime) -> RunIdentity:
    if when.tzinfo is None:
        when = when.replace(tzinfo=LOCAL_TIMEZONE)
    local = when.astimezone(LOCAL_TIMEZONE)
    day = local.date()
    if run_type == "weekly":
        period = apple_week_period(day)
        run_key = f"weekly-{period.key}"
    else:
        period = Period(key=day.isoformat(), start=day, period_type="daily")
        run_key = f"shadow-{day.strftime('%Y%m%d')}" if run_type == "shadow" else f"daily-{day.strftime('%Y%m%d')}-{run_type}"
    parent_run_id = None
    if run_type == "retry":
        parent_run_id = _stable_id("crawl-run", f"daily-{day.strftime('%Y%m%d')}-primary")
    return RunIdentity(
        run_id=_stable_id("crawl-run", run_key),
        run_key=run_key,
        run_type=run_type,
        period=period,
        parent_run_id=parent_run_id,
    )


def validate_run_options(run_type: str, *, dry_run: bool, limit: int) -> None:
    if limit < 0:
        raise ValueError("--limit cannot be negative")
    if limit and not dry_run and run_type != "shadow":
        raise ValueError("--limit requires --dry-run or --run-type shadow")


def _default_sender(request: urllib.request.Request, timeout: int) -> object:
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - explicit CLI destination.
        raw = response.read()
    return json.loads(raw) if raw else []


class SupabaseRestClient:
    """Small server-only PostgREST client with injectable transport for tests."""

    def __init__(
        self,
        supabase_url: str,
        service_key: str,
        *,
        sender: Callable[[urllib.request.Request, int], object] | None = None,
    ) -> None:
        if not supabase_url.strip() or not service_key:
            raise ValueError("Supabase URL and service key are required")
        self.base_url = supabase_url.rstrip("/")
        self.service_key = service_key
        self.sender = sender or _default_sender

    def _request(
        self,
        method: str,
        table: str,
        *,
        query: Mapping[str, object] | None = None,
        body: object | None = None,
        prefer: str | None = None,
    ) -> object:
        url = f"{self.base_url}/rest/v1/{table}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        request = urllib.request.Request(
            url,
            data=(json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8") if body is not None else None),
            headers=headers,
            method=method,
        )
        return self.sender(request, 60)

    def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: Mapping[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        query: dict[str, object] = {"select": columns}
        query.update(filters or {})
        if order:
            query["order"] = order
        if limit is not None:
            query["limit"] = limit
        response = self._request("GET", table, query=query)
        if not isinstance(response, list):
            raise ValueError(f"Unexpected Supabase response for {table}")
        return [dict(row) for row in response]

    def insert_ignore(self, table: str, rows: Iterable[Mapping]) -> None:
        batch = [dict(row) for row in rows]
        if not batch:
            return
        self._request(
            "POST",
            table,
            query={"on_conflict": "id"},
            body=batch,
            prefer="resolution=ignore-duplicates,return=minimal",
        )

    def update(self, table: str, values: Mapping, *, filters: Mapping[str, str]) -> None:
        self._request(
            "PATCH",
            table,
            query=filters,
            body=dict(values),
            prefer="return=minimal",
        )


def load_active_catalog(client: SupabaseRestClient) -> Catalog:
    products = client.select(
        "products", columns="id,name,category,capacity", filters={"active": "eq.true"}
    )
    retailers = client.select(
        "retailers", columns="id,code,name", filters={"active": "eq.true"}
    )
    links = client.select(
        "product_links",
        columns="id,product_id,retailer_id,url",
        filters={"active": "eq.true"},
    )
    overrides = client.select(
        "price_overrides",
        columns="id,product_link_id,override_price,note",
        filters={"active": "eq.true"},
    )
    products_by_id = {row["id"]: row for row in products}
    retailers_by_id = {row["id"]: row for row in retailers}
    items = []
    for link in links:
        product = products_by_id.get(link["product_id"])
        retailer = retailers_by_id.get(link["retailer_id"])
        if not product or not retailer:
            continue
        items.append(
            CatalogItem(
                target=price_check.Target(
                    product["name"],
                    price_check.normalize_name(retailer["code"]),
                    link["url"],
                ),
                product_id=product["id"],
                retailer_id=retailer["id"],
                link_id=link["id"],
                retailer_name=retailer["name"],
            )
        )
    items.sort(key=lambda item: (item.target.model, item.target.retailer, item.target.url))
    items_by_link = {item.link_id: item for item in items}
    override_input = {
        items_by_link[row["product_link_id"]].target.url: (int(row["override_price"]), str(row["note"]))
        for row in overrides
        if row.get("product_link_id") in items_by_link
    }
    return Catalog(tuple(items), override_input)


def load_retry_selection(
    client: SupabaseRestClient,
    catalog: Catalog,
    day: dt.date,
) -> RetrySelection:
    primary_key = f"daily-{day.strftime('%Y%m%d')}-primary"
    runs = client.select(
        "crawl_runs",
        columns="id,run_key",
        filters={"run_key": f"eq.{primary_key}"},
        limit=1,
    )
    if not runs:
        return RetrySelection(None, ())
    primary_run_id = runs[0]["id"]
    failures = client.select(
        "price_observations",
        columns="product_link_id,fetch_ok",
        filters={"run_id": f"eq.{primary_run_id}", "fetch_ok": "eq.false"},
    )
    by_link = catalog.by_link_id
    selected = {
        row["product_link_id"]: by_link[row["product_link_id"]]
        for row in failures
        if row.get("fetch_ok") is False and row.get("product_link_id") in by_link
    }
    return RetrySelection(primary_run_id, tuple(selected[key] for key in sorted(selected)))


def select_retry_items(
    client: SupabaseRestClient,
    catalog: Catalog,
    day: dt.date,
) -> list[CatalogItem]:
    return list(load_retry_selection(client, catalog, day).items)


def _clean_iso(value: str | None, fallback: dt.datetime) -> str:
    if not value:
        parsed = fallback
    else:
        text = value[:-1] + "+00:00" if value.endswith("Z") else value
        parsed = dt.datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TIMEZONE)
    return parsed.isoformat(timespec="seconds")


def _evidence(result: price_check.Result) -> dict:
    fields = (
        "base_value",
        "discount",
        "promo_note",
        "html_price",
        "rendered_price",
        "previous_week_price",
        "decision_note",
        "availability",
        "availability_method",
        "availability_text",
        "purchase_action",
        "purchase_action_method",
        "purchase_action_text",
    )
    return {field: getattr(result, field) for field in fields if getattr(result, field) not in (None, "")}


def result_to_observation(
    result: price_check.Result,
    item: CatalogItem,
    identity: RunIdentity,
    *,
    fallback_time: dt.datetime | None = None,
) -> dict:
    fallback = fallback_time or dt.datetime.now(LOCAL_TIMEZONE)
    fetch_ok = result.status in {"OK", "OOS"}
    price = result.value if result.status == "OK" and isinstance(result.value, int) else None
    in_stock = True if result.status == "OK" and price is not None else False if result.status == "OOS" else None
    flags = sorted(set(filter(None, result.risk_flags.split("|"))))
    return {
        "id": _stable_id("observation", identity.run_id, item.product_id, item.retailer_id),
        "run_id": identity.run_id,
        "product_id": item.product_id,
        "retailer_id": item.retailer_id,
        "product_link_id": item.link_id,
        "period_type": identity.period.period_type,
        "period_key": identity.period.key,
        "period_start": identity.period.start.isoformat(),
        "observed_at": _clean_iso(result.fetched_at, fallback),
        "price_vnd": price,
        "in_stock": in_stock,
        "fetch_ok": fetch_ok,
        "review_status": "pending" if price_check.is_review_needed(result) else "confirmed",
        "confidence": result.confidence or None,
        "risk_flags": flags,
        "evidence": _evidence(result),
        "source_method": result.source_method or None,
        "error_message": result.error or None,
    }


def _run_row(identity: RunIdentity, when: dt.datetime, status: str, observations: Sequence[Mapping]) -> dict:
    observed = list(observations)
    return {
        "id": identity.run_id,
        "run_key": identity.run_key,
        "parent_run_id": identity.parent_run_id,
        "run_type": identity.run_type,
        "period_type": identity.period.period_type,
        "period_key": identity.period.key,
        "period_start": identity.period.start.isoformat(),
        "scheduled_for": when.isoformat(timespec="seconds"),
        "started_at": when.isoformat(timespec="seconds"),
        "completed_at": None if status == "running" else dt.datetime.now(LOCAL_TIMEZONE).isoformat(timespec="seconds"),
        "status": status,
        "total_targets": len(observed),
        "ok_count": sum(row.get("in_stock") is True for row in observed),
        "oos_count": sum(row.get("in_stock") is False for row in observed),
        "error_count": sum(not row.get("fetch_ok", False) for row in observed),
        "change_count": 0,
        "review_count": sum(row.get("review_status") == "pending" for row in observed),
        "source": "cloud_crawler",
    }


def _previous_week_prices(client: SupabaseRestClient, catalog: Catalog) -> dict[tuple[str, str], int | str | None]:
    rows = client.select(
        "weekly_price_history",
        columns="product_id,retailer_id,effective_price_vnd,effective_in_stock,period_start",
        order="period_start.desc",
    )
    item_by_pair = {(item.product_id, item.retailer_id): item for item in catalog.items}
    previous: dict[tuple[str, str], int | str | None] = {}
    for row in rows:
        item = item_by_pair.get((row.get("product_id"), row.get("retailer_id")))
        if not item:
            continue
        key = (item.target.model, price_check.normalize_name(item.target.retailer))
        if key in previous:
            continue
        previous[key] = "OOS" if row.get("effective_in_stock") is False else row.get("effective_price_vnd")
    return previous


def _default_crawl(target: price_check.Target, overrides: dict[str, tuple[int, str]]) -> price_check.Result:
    return price_check.fetch_target(target, 0.5, overrides)


def _default_backcheck(results: list[price_check.Result], output_dir: Path) -> None:
    price_check.run_render_backcheck(results, output_dir / "render")


def execute_run(
    client: SupabaseRestClient,
    *,
    run_type: str,
    now: dt.datetime,
    dry_run: bool,
    limit: int,
    crawl: Callable[[price_check.Target, dict[str, tuple[int, str]]], price_check.Result] = _default_crawl,
    backcheck: Callable[[list[price_check.Result], Path], None] = _default_backcheck,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
) -> dict:
    """Execute one idempotent cloud crawl and return its upload payload."""
    validate_run_options(run_type, dry_run=dry_run, limit=limit)
    identity = make_run_identity(run_type, now)
    no_upload = dry_run or run_type == "shadow"
    existing_run = None
    if not no_upload:
        existing = client.select(
            "crawl_runs",
            columns="id,run_key,status,scheduled_for,started_at,completed_at",
            filters={"id": f"eq.{identity.run_id}"},
            limit=1,
        )
        existing_run = existing[0] if existing else None
        if existing_run and existing_run.get("status") in {
            "success", "partial", "failed", "no_retry", "cancelled"
        }:
            return {"status": "duplicate_noop", "run": existing[0], "observations": []}

    catalog = load_active_catalog(client)
    retry_selection = None
    if run_type == "retry":
        retry_selection = load_retry_selection(client, catalog, identity.period.start)
        identity = replace(identity, parent_run_id=retry_selection.primary_run_id)
        desired_items = list(retry_selection.items)
    else:
        desired_items = list(catalog.items)
    items = list(desired_items)
    if limit > 0:
        items = items[:limit]

    existing_observations: list[dict] = []
    if existing_run:
        existing_observations = client.select(
            "price_observations",
            columns=(
                "id,product_id,retailer_id,product_link_id,in_stock,fetch_ok,review_status"
            ),
            filters={"run_id": f"eq.{identity.run_id}"},
        )
        observed_pairs = {
            (row.get("product_id"), row.get("retailer_id"))
            for row in existing_observations
        }
        items = [
            item for item in items
            if (item.product_id, item.retailer_id) not in observed_pairs
        ]
    elif not no_upload:
        client.insert_ignore("crawl_runs", [_run_row(identity, now, "running", [])])

    results = [crawl(item.target, catalog.overrides) for item in items]
    previous = _previous_week_prices(client, catalog)
    price_check.add_initial_risk_flags_from_previous(results, previous)
    backcheck(results, Path(output_dir))
    observations = [
        result_to_observation(result, item, identity, fallback_time=now)
        for item, result in zip(items, results)
    ]
    all_observations = [*existing_observations, *observations]
    status = "no_retry" if run_type == "retry" and not desired_items else (
        "partial" if any(not row["fetch_ok"] for row in all_observations) else "success"
    )
    run = _run_row(identity, now, status, all_observations)
    if existing_run:
        for field in ("scheduled_for", "started_at"):
            if existing_run.get(field):
                run[field] = existing_run[field]
    payload = {
        "status": "dry_run" if no_upload else status,
        "run": run,
        "observations": observations,
        "resumed": bool(existing_run),
    }

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{identity.run_key}.json"
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    payload["output_path"] = str(output_path)

    if not no_upload:
        client.insert_ignore("price_observations", observations)
        final_values = {key: value for key, value in run.items() if key not in {"id", "run_key"}}
        client.update("crawl_runs", final_values, filters={"id": f"eq.{identity.run_id}"})
    return payload


def _now() -> dt.datetime:
    return dt.datetime.now(LOCAL_TIMEZONE)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-type", choices=("primary", "retry", "weekly", "shadow"), required=True)
    parser.add_argument("--dry-run", action="store_true", help="Crawl and write a local payload without Supabase writes")
    parser.add_argument("--limit", type=int, default=0, help="Limit targets after retry selection")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args(argv)
    try:
        validate_run_options(args.run_type, dry_run=args.dry_run, limit=args.limit)
    except ValueError as exc:
        parser.error(str(exc))

    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        parser.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    client = SupabaseRestClient(supabase_url, service_key)
    payload = execute_run(
        client,
        run_type=args.run_type,
        now=_now(),
        dry_run=args.dry_run,
        limit=args.limit,
        output_dir=args.output_dir,
    )
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
