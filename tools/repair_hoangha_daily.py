#!/usr/bin/env python3
"""Append an audited corrective Daily run for verified Hoang Ha prices."""
from __future__ import annotations
import datetime as dt, json, os, ssl, urllib.request, uuid
import certifi

def request_json(url: str, key: str, *, method: str = "GET", payload=None, prefer: str | None = None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if prefer: headers["Prefer"] = prefer
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(request, timeout=60, context=context) as response:  # noqa: S310
        return json.loads(response.read() or b"[]")

def stable_id(kind: str, *parts: object) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "/".join(("price-check", kind, *(str(part) for part in parts)))))

def main() -> int:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    period_key = os.environ.get("PERIOD_KEY", "2026-09-21")
    reason = os.environ.get("REPAIR_REASON", "Corrected Hoang Ha render-backcheck: installment value was selected instead of selected SKU sale price.")
    prices = json.loads(os.environ["PRICES_JSON"])
    if not isinstance(prices, list) or not prices: raise ValueError("PRICES_JSON must be a non-empty JSON list")
    retailer_rows = request_json(f"{url}/rest/v1/retailers?select=id,code&code=eq.HOANGHA&limit=1", key)
    if len(retailer_rows) != 1: raise ValueError("HOANGHA retailer was not found")
    retailer_id = retailer_rows[0]["id"]
    products = request_json(f"{url}/rest/v1/products?select=id,name&active=eq.true&limit=500", key)
    product_by_name = {str(row["name"]).casefold(): row for row in products}
    links = request_json(f"{url}/rest/v1/product_links?select=id,product_id,retailer_id&retailer_id=eq.{retailer_id}&active=eq.true&limit=500", key)
    link_by_product = {row["product_id"]: row for row in links}
    run_key = f"daily-{period_key}-hoangha-correction"
    run_id = stable_id("crawl-run", run_key)
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    parent_rows = request_json(f"{url}/rest/v1/crawl_runs?select=id&run_key=eq.daily-{period_key}-primary&limit=1", key)
    run = {"id": run_id, "run_key": run_key, "parent_run_id": parent_rows[0]["id"] if parent_rows else None,
           "run_type": "manual", "period_type": "daily", "period_key": period_key, "period_start": period_key,
           "started_at": now, "completed_at": now, "status": "success", "total_targets": len(prices),
           "ok_count": len(prices), "oos_count": 0, "error_count": 0, "change_count": 0, "review_count": 0,
           "source": "manual_hoangha_price_correction"}
    observations = []
    for item in prices:
        name = str(item["product_name"]).strip()
        product = product_by_name.get(name.casefold())
        if product is None: raise ValueError(f"Product not found: {name}")
        link = link_by_product.get(product["id"])
        if link is None: raise ValueError(f"Hoang Ha product link not found: {name}")
        observations.append({"id": stable_id("observation", run_id, product["id"], retailer_id), "run_id": run_id,
            "product_id": product["id"], "retailer_id": retailer_id, "product_link_id": link["id"],
            "period_type": "daily", "period_key": period_key, "period_start": period_key, "observed_at": now,
            "price_vnd": int(item["price_vnd"]), "in_stock": True, "fetch_ok": True, "review_status": "confirmed",
            "confidence": "VERIFIED_RENDER", "risk_flags": [], "evidence": {"correction_reason": reason,
            "source_method": "selected_sku_sale_price", "corrected_from": 1490000}, "source_method": "manual_source_recheck"})
    request_json(f"{url}/rest/v1/crawl_runs?on_conflict=id", key, method="POST", payload=[run], prefer="resolution=merge-duplicates,return=minimal")
    request_json(f"{url}/rest/v1/price_observations?on_conflict=id", key, method="POST", payload=observations, prefer="resolution=merge-duplicates,return=minimal")
    print(json.dumps({"status": "uploaded", "run_key": run_key, "observation_count": len(observations)}, sort_keys=True))
    return 0
if __name__ == "__main__": raise SystemExit(main())
