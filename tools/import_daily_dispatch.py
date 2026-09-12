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
import ssl
import urllib.parse
import urllib.request
from collections.abc import Mapping
from pathlib import Path

import certifi

from import_supabase_data import build_daily_snapshot_payload, merge_payloads, upsert_payload


MAX_SNAPSHOT_BYTES = 2_000_000
TERMINAL_RUN_STATUSES = {"success", "partial", "failed", "no_retry", "cancelled"}


def load_dispatch_inputs(environment: Mapping[str, str], event_path: Path | None) -> dict[str, str]:
    """Read workflow inputs from the event file so large snapshots stay out of step env logs."""
    if event_path and event_path.is_file():
        event = json.loads(event_path.read_text(encoding="utf-8"))
        values = event.get("inputs", {})
    else:
        values = {
            "snapshot_gzip_b64": environment.get("DAILY_SNAPSHOT_GZIP_B64", ""),
            "snapshot_sha256": environment.get("DAILY_SNAPSHOT_SHA256", ""),
            "run_json": environment.get("DAILY_RUN_JSON", ""),
        }
    return {name: str(values.get(name, "")) for name in (
        "snapshot_gzip_b64", "snapshot_sha256", "run_json"
    )}


def _default_json_sender(request: urllib.request.Request, timeout: int) -> object:
    context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:  # noqa: S310
        return json.loads(response.read() or b"[]")


def is_terminal_run_uploaded(
    payload: Mapping[str, object],
    supabase_url: str,
    service_key: str,
    *,
    sender=None,
) -> bool:
    """Return true when the deterministic Daily run already exists in a terminal state."""
    runs = list(payload.get("crawl_runs", []))
    if not runs:
        raise ValueError("Daily payload has no crawl run")
    run_id = runs[0]["id"]
    query = urllib.parse.urlencode({"select": "id,status", "id": f"eq.{run_id}", "limit": 1})
    request = urllib.request.Request(
        f"{supabase_url.rstrip('/')}/rest/v1/crawl_runs?{query}",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
    )
    rows = (sender or _default_json_sender)(request, 60)
    return bool(rows and rows[0].get("status") in TERMINAL_RUN_STATUSES)


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
    event_path = Path(os.environ["GITHUB_EVENT_PATH"]) if os.environ.get("GITHUB_EVENT_PATH") else None
    inputs = load_dispatch_inputs(os.environ, event_path)
    payload = build_dispatch_payload(
        snapshot_gzip_b64=inputs["snapshot_gzip_b64"],
        snapshot_sha256=inputs["snapshot_sha256"],
        run_json=inputs["run_json"],
        generated_at=_generated_at(),
    )
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    run = payload["crawl_runs"][0]
    if is_terminal_run_uploaded(payload, supabase_url, service_key):
        print(json.dumps({"status": "duplicate_noop", "run_key": run["run_key"]}, sort_keys=True))
        return 0
    counts = upsert_payload(payload, supabase_url, service_key)
    print(json.dumps({
        "status": "uploaded",
        "run_key": run["run_key"],
        "counts": counts,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
