#!/usr/bin/env python3
"""Build the public Daily static overlay used while Supabase is restricted."""

from __future__ import annotations

import argparse
from collections.abc import Mapping
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

from import_daily_dispatch import build_dispatch_payload, load_dispatch_inputs


SCHEMA_VERSION = 1
PUBLIC_RUN_FIELDS = (
    "id", "run_key", "parent_run_id", "run_type", "period_type", "period_key",
    "period_start", "scheduled_for", "started_at", "completed_at", "status",
    "total_targets", "ok_count", "oos_count", "error_count", "change_count",
    "review_count", "source",
)


def _public_run(source: Mapping[str, object]) -> dict[str, object]:
    return {key: source.get(key) for key in PUBLIC_RUN_FIELDS}


def _effective_row(
    source: Mapping[str, object],
    products: Mapping[str, Mapping[str, object]],
    retailers: Mapping[str, Mapping[str, object]],
) -> dict[str, object]:
    product = products.get(str(source.get("product_id")))
    retailer = retailers.get(str(source.get("retailer_id")))
    if product is None or retailer is None:
        raise ValueError("Static observation references an unknown product or retailer")
    return {
        "id": source.get("id"),
        "run_id": source.get("run_id"),
        "product_id": source.get("product_id"),
        "product_name": product.get("name"),
        "category": product.get("category"),
        "capacity": product.get("capacity"),
        "retailer_id": source.get("retailer_id"),
        "retailer_code": retailer.get("code"),
        "retailer_name": retailer.get("name"),
        "period_type": source.get("period_type"),
        "period_key": source.get("period_key"),
        "period_start": source.get("period_start"),
        "observed_at": source.get("observed_at"),
        "effective_price_vnd": source.get("price_vnd"),
        "effective_in_stock": source.get("in_stock"),
        "fetch_ok": source.get("fetch_ok"),
        "effective_review_status": source.get("review_status"),
        "confidence": source.get("confidence"),
        "risk_flags": list(source.get("risk_flags") or []),
        "source_method": source.get("source_method"),
        "latest_correction_id": None,
        "corrected_at": None,
    }


def build_static_overlay(
    payload: Mapping[str, object],
    existing: Mapping[str, object] | None,
    source_sha256: str,
    generated_at: str,
) -> dict[str, object]:
    """Convert one verified importer payload into the public dashboard shape."""
    if not re.fullmatch(r"[a-fA-F0-9]{64}", source_sha256):
        raise ValueError("Invalid source SHA-256")
    runs = list(payload.get("crawl_runs") or [])
    if len(runs) != 1:
        raise ValueError("Static Daily payload must contain exactly one run")
    run = runs[0]
    run_key = str(run.get("run_key") or "")
    if not run_key or "dryrun" in run_key:
        raise ValueError("Static Daily run key is blank or dry-run")
    products = {str(row["id"]): row for row in payload.get("products") or []}
    retailers = {str(row["id"]): row for row in payload.get("retailers") or []}
    rows = [
        _effective_row(row, products, retailers)
        for row in payload.get("price_observations") or []
    ]
    if len(rows) != int(run.get("total_targets") or 0):
        raise ValueError("Static Daily row count differs from declared target count")
    base = dict(existing or {})
    saved_hashes = dict(base.get("sourceSha256ByRun") or {})
    saved_row_digests = dict(base.get("rowDigestByRun") or {})
    saved_sha = saved_hashes.get(run_key)
    if saved_sha and saved_sha != source_sha256.lower():
        raise ValueError("Static run SHA-256 conflict")
    saved_hashes[run_key] = source_sha256.lower()

    row_digest = hashlib.sha256(json.dumps(
        sorted(rows, key=lambda row: str(row["id"])),
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode()).hexdigest()
    saved_digest = saved_row_digests.get(run_key)
    if saved_digest and saved_digest != row_digest:
        raise ValueError("Static observation ID conflict")
    saved_row_digests[run_key] = row_digest

    existing_rows = {str(row.get("id")): dict(row) for row in base.get("effectiveRows") or []}
    for row in rows:
        prior = existing_rows.get(str(row["id"]))
        if prior is not None and prior != row:
            raise ValueError("Static observation ID conflict")
    natural_rows = {
        (str(row.get("period_start")), str(row.get("product_id")), str(row.get("retailer_id"))): dict(row)
        for row in base.get("effectiveRows") or []
    }
    for row in rows:
        natural_rows[(str(row["period_start"]), str(row["product_id"]), str(row["retailer_id"]))] = row

    existing_runs = {str(item.get("run_key")): dict(item) for item in base.get("runs") or []}
    public_run = _public_run(run)
    prior_run = existing_runs.get(run_key)
    if prior_run is not None and prior_run != public_run:
        raise ValueError("Static run metadata conflict")
    if saved_sha and saved_digest and prior_run is not None:
        return _canonical_overlay(base)
    existing_runs[run_key] = public_run

    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "sourceSha256ByRun": dict(sorted(saved_hashes.items())),
        "rowDigestByRun": dict(sorted(saved_row_digests.items())),
        "effectiveRows": sorted(natural_rows.values(), key=lambda row: (
            str(row.get("period_start")), str(row.get("product_id")), str(row.get("retailer_id")), str(row.get("id")),
        )),
        "health": list(base.get("health") or []),
        "runs": sorted(existing_runs.values(), key=lambda item: (
            str(item.get("period_start")), 0 if item.get("run_type") == "primary" else 1, str(item.get("run_key")),
        )),
        "products": list(base.get("products") or []),
        "retailers": list(base.get("retailers") or []),
        "productLinks": list(base.get("productLinks") or []),
        "priceOverrides": list(base.get("priceOverrides") or []),
        "corrections": list(base.get("corrections") or []),
    }


def _canonical_overlay(overlay: Mapping[str, object]) -> dict[str, object]:
    value = dict(overlay)
    value["sourceSha256ByRun"] = dict(sorted(dict(value.get("sourceSha256ByRun") or {}).items()))
    value["rowDigestByRun"] = dict(sorted(dict(value.get("rowDigestByRun") or {}).items()))
    value["effectiveRows"] = sorted(value.get("effectiveRows") or [], key=lambda row: (
        str(row.get("period_start")), str(row.get("product_id")), str(row.get("retailer_id")), str(row.get("id")),
    ))
    value["runs"] = sorted(value.get("runs") or [], key=lambda item: (
        str(item.get("period_start")), 0 if item.get("run_type") == "primary" else 1, str(item.get("run_key")),
    ))
    for name in ("health", "products", "retailers", "productLinks", "priceOverrides", "corrections"):
        value[name] = list(value.get(name) or [])
    return value


def serialize_overlay(overlay: Mapping[str, object]) -> str:
    return json.dumps(_canonical_overlay(overlay), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"


def static_receipt(overlay: Mapping[str, object], run_key: str, source_sha256: str) -> dict[str, object]:
    saved_sha = dict(overlay.get("sourceSha256ByRun") or {}).get(run_key)
    if saved_sha != source_sha256.lower():
        raise ValueError("Static receipt SHA-256 mismatch")
    run = next((item for item in overlay.get("runs") or [] if item.get("run_key") == run_key), None)
    if run is None:
        raise ValueError("Static receipt run is missing")
    return {
        "protocol_version": SCHEMA_VERSION,
        "daily_run_key": run_key,
        "source_sha256": saved_sha,
        "row_count": int(run.get("total_targets") or 0),
        "latest_date": str(run.get("period_start") or ""),
    }


def write_overlay(path: Path, overlay: Mapping[str, object]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(serialize_overlay(overlay))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def publish_dispatch_inputs(
    inputs: Mapping[str, str],
    existing_path: Path,
    output_path: Path,
    generated_at: str,
) -> dict[str, object]:
    payload = build_dispatch_payload(
        snapshot_gzip_b64=inputs.get("snapshot_gzip_b64", ""),
        snapshot_sha256=inputs.get("snapshot_sha256", ""),
        run_json=inputs.get("run_json", ""),
        generated_at=generated_at,
    )
    existing_path = Path(existing_path)
    existing = json.loads(existing_path.read_text(encoding="utf-8")) if existing_path.is_file() else None
    overlay = build_static_overlay(
        payload, existing, inputs.get("snapshot_sha256", ""), generated_at,
    )
    write_overlay(Path(output_path), overlay)
    run_key = json.loads(inputs["run_json"])["run_id"]
    return static_receipt(overlay, run_key, inputs["snapshot_sha256"])


def _generated_at() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-path", type=Path)
    parser.add_argument("--snapshot-gzip-b64")
    parser.add_argument("--snapshot-sha256")
    parser.add_argument("--run-json")
    parser.add_argument("--existing", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--generated-at", default=None)
    args = parser.parse_args()
    direct = {
        "snapshot_gzip_b64": args.snapshot_gzip_b64 or "",
        "snapshot_sha256": args.snapshot_sha256 or "",
        "run_json": args.run_json or "",
    }
    inputs = load_dispatch_inputs(direct, args.event_path)
    receipt = publish_dispatch_inputs(
        inputs, args.existing, args.output, args.generated_at or _generated_at(),
    )
    print("DAILY_STATIC_JSON=" + json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
