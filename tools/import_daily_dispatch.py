#!/usr/bin/env python3
"""Import one local Daily snapshot delivered through workflow_dispatch."""

from __future__ import annotations

import base64
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import os
from collections.abc import Mapping

from import_supabase_data import build_daily_snapshot_payload, merge_payloads, upsert_payload


MAX_SNAPSHOT_BYTES = 2_000_000


def build_dispatch_payload(
    *,
    snapshot_gzip_b64: str,
    snapshot_sha256: str,
    run_json: str,
    generated_at: str,
) -> dict[str, object]:
    """Decode, integrity-check, and convert a dispatched Daily snapshot."""
    if not snapshot_gzip_b64:
        raise ValueError("Daily snapshot payload is blank")
    try:
        compressed = base64.b64decode(snapshot_gzip_b64, validate=True)
        snapshot = gzip.decompress(compressed)
    except (ValueError, gzip.BadGzipFile) as exc:
        raise ValueError("Daily snapshot payload is not valid gzip/base64") from exc
    if len(snapshot) > MAX_SNAPSHOT_BYTES:
        raise ValueError("Daily snapshot exceeds the allowed size")
    actual_sha256 = hashlib.sha256(snapshot).hexdigest()
    if actual_sha256 != snapshot_sha256.lower():
        raise ValueError("Daily snapshot SHA-256 mismatch")

    run = json.loads(run_json)
    if not isinstance(run, Mapping):
        raise ValueError("Daily run metadata must be a JSON object")
    text = snapshot.decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text, newline="")))
    if not rows:
        raise ValueError("Daily snapshot contains no observations")
    return merge_payloads(
        [build_daily_snapshot_payload(run, rows)],
        generated_at=generated_at,
    )


def _generated_at() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def main() -> int:
    payload = build_dispatch_payload(
        snapshot_gzip_b64=os.environ.get("DAILY_SNAPSHOT_GZIP_B64", ""),
        snapshot_sha256=os.environ.get("DAILY_SNAPSHOT_SHA256", ""),
        run_json=os.environ.get("DAILY_RUN_JSON", ""),
        generated_at=_generated_at(),
    )
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    counts = upsert_payload(payload, supabase_url, service_key)
    run = payload["crawl_runs"][0]
    print(json.dumps({
        "status": "uploaded",
        "run_key": run["run_key"],
        "counts": counts,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
