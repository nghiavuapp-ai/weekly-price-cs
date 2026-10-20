"""Atomic Daily import protocol and independent, paginated content verification."""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import re
import ssl
import urllib.parse
import urllib.request
import certifi

PROTOCOL_VERSION = 1


def canonical_observations(rows, fields):
    values = []
    for source in rows:
        row = {key: source.get(key) for key in fields}
        if row.get('observed_at'):
            row['observed_at'] = dt.datetime.fromisoformat(str(row['observed_at']).replace('Z', '+00:00')).astimezone(dt.timezone.utc).isoformat()
        values.append(row)
    return sorted(values, key=lambda row: row['id'])


def digest(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def build_manifest(payload: dict, snapshot_sha256: str) -> dict:
    if not re.fullmatch(r'[a-fA-F0-9]{64}', snapshot_sha256):
        raise ValueError('Invalid source SHA-256')
    runs = payload.get('crawl_runs', [])
    if len(runs) != 1:
        raise ValueError('Daily import must contain exactly one run')
    rows = payload.get('price_observations', [])
    ids = [row['id'] for row in rows]
    pairs = [(row['product_id'], row['retailer_id']) for row in rows]
    if not rows or len(set(ids)) != len(ids) or len(set(pairs)) != len(pairs):
        raise ValueError('Empty or duplicate Daily observations')
    if any(row['run_id'] != runs[0]['id'] for row in rows):
        raise ValueError('Observation run_id mismatch')
    if runs[0]['total_targets'] != len(rows):
        raise ValueError('Declared target count differs from unique observations')
    fields = sorted(rows[0])
    if any(sorted(row) != fields for row in rows):
        raise ValueError('Inconsistent observation schema')
    return dict(protocol_version=PROTOCOL_VERSION, run_id=runs[0]['id'],
                source_sha256=snapshot_sha256.lower(), expected_count=len(rows),
                observation_ids=sorted(ids), fields=fields,
                payload_digest=digest(canonical_observations(rows, fields)))


def verify_observations(payload: dict, actual: list[dict]) -> None:
    expected = payload['price_observations']
    if len(actual) != len(expected) or {r['id'] for r in actual} != {r['id'] for r in expected}:
        raise ValueError('IMPORT_INCOMPLETE: observation count or exact ID set mismatch')
    if digest(canonical_observations(actual, sorted(expected[0]))) != digest(canonical_observations(expected, sorted(expected[0]))):
        raise ValueError('CONTENT_CONFLICT: observation content differs')


def _send(request, timeout):
    with urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context(cafile=certifi.where())) as response:
        return json.loads(response.read() or b'null')


def _headers(key):
    return {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}


def read_observations(run_id, fields, url, key, *, sender=None):
    send = sender or _send
    rows = []; offset = 0
    while True:
        query = urllib.parse.urlencode({'select': ','.join(fields), 'run_id': f'eq.{run_id}',
                                        'order': 'id.asc', 'limit': 500, 'offset': offset})
        page = send(urllib.request.Request(f'{url.rstrip("/")}/rest/v1/price_observations?{query}', headers=_headers(key)), 60)
        if not isinstance(page, list): raise ValueError('Invalid readback response')
        rows.extend(page)
        if len(page) < 500: return rows
        offset += len(page)


def import_daily_atomically(payload, manifest, supabase_url, service_key, *, sender=None):
    if not supabase_url or not service_key: raise ValueError('Supabase credentials required')
    if build_manifest(payload, manifest['source_sha256']) != manifest:
        raise ValueError('Manifest does not match payload')
    send = sender or _send
    request = urllib.request.Request(f'{supabase_url.rstrip("/")}/rest/v1/rpc/import_daily_atomic',
        headers=_headers(service_key), method='POST',
        data=json.dumps({'p_payload': payload, 'p_manifest': manifest}, ensure_ascii=False).encode())
    receipt = send(request, 60)
    if not isinstance(receipt, dict) or any(receipt.get(k) != manifest[k] for k in
        ['protocol_version', 'run_id', 'source_sha256', 'payload_digest']):
        raise ValueError('Invalid atomic import receipt; recovery blocked')
    if receipt.get('actual_count') != manifest['expected_count'] or receipt.get('status') not in {'imported', 'verified_duplicate'}:
        raise ValueError('Incomplete atomic import receipt')
    verify_observations(payload, read_observations(manifest['run_id'], manifest['fields'],
                         supabase_url, service_key, sender=send))
    return dict(receipt, readback_verified=True, daily_run_key=payload["crawl_runs"][0]["run_key"])
