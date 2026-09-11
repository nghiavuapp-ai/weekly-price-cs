"""Build auditable long-form clean data and a quality preview from Price Check.xlsx."""
from __future__ import annotations

import csv
import hashlib
import html
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Price Check.xlsx"
OUTPUT_DIR = ROOT / "outputs" / "clean-data"
PARTNER_ALIASES = {
    "MW": "MW", "FPT": "FPT", "VIETTEL": "Viettel", "CPS": "CPS", "SHOPDUNK": "Shopdunk",
    "SD": "Shopdunk", "TZ": "TZ", "HOANG HA": "Hoang Ha", "HH": "Hoang Ha", "VT": "Viettel",
}
CATEGORIES = ("iPhone", "iPad", "MacBook", "Apple Watch", "AirPods", "Review")


def canonical_week(value):
    match = re.search(r"W(\d+)Q(\d)FY(\d+)", str(value).replace(" ", ""), re.I)
    if not match:
        return None
    week, quarter, year = map(int, match.groups())
    return {"week_id": f"W{week}Q{quarter}FY{year}", "week_number": week,
            "quarter": quarter, "fiscal_year": year}


def _clean_text(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\u00a0", " ")).strip()


def _is_model_candidate(value):
    """Exclude clearly narrative/comment rows while retaining unknown products for Review."""
    text = _clean_text(value)
    if not text:
        return False
    upper = text.upper()
    return len(text) <= 120 and not upper.startswith(("THÔNG TIN THỊ TRƯỜNG", "GHI CHÚ:", "NOTE:"))


def classify_category(model):
    value = _clean_text(model).casefold()
    for prefix, category in (("iphone", "iPhone"), ("ipad", "iPad"), ("macbook", "MacBook"), ("airpods", "AirPods"),
                             ("apple watch", "Apple Watch"), ("watch", "Apple Watch"), ("aw ", "Apple Watch"), ("aw-", "Apple Watch")):
        if value.startswith(prefix):
            return category
    return "Review"


def canonicalize_model(raw_model):
    raw = _clean_text(raw_model)
    category = classify_category(raw)
    if category == "Review":
        return {"raw_model": raw, "canonical_model": raw, "category": category,
                "capacity": None, "mapping_status": "Review"}
    value = raw
    value = value.replace("”", '"').replace("“", '"').replace("’", "'")
    value = re.sub(r"^iphone\b", "iPhone", value, flags=re.I)
    value = re.sub(r"^ipad\b", "iPad", value, flags=re.I)
    value = re.sub(r"^macbook\b", "MacBook", value, flags=re.I)
    value = re.sub(r"^airpods\b", "AirPods", value, flags=re.I)
    value = re.sub(r"^apple\s+watch\b", "Apple Watch", value, flags=re.I)
    value = re.sub(r"^watch\b", "Apple Watch", value, flags=re.I)
    value = re.sub(r"^aw(?:\s+|-)\b", "Apple Watch ", value, flags=re.I)
    # Explicit, reviewed aliases from the source workbook.
    value = re.sub(r"^iphone 14 128$", "iPhone 14 128GB", value, flags=re.I)
    value = re.sub(r"^iphone 15 pro max 1256gb$", "iPhone 15 Pro Max 256GB", value, flags=re.I)
    value = re.sub(r"^ipad air 5 m1\s+", "iPad Air 5 ", value, flags=re.I)
    value = re.sub(r"^ipad air 5\s*\(wi[- ]fi\s+([^)]*)\)$", r"iPad Air 5 \1 Wifi", value, flags=re.I)
    value = re.sub(r"^ipad (?:gen )?10th\s*\(wi[- ]fi\s+([^)]*)\)$", r"iPad Gen 10th \1 Wifi", value, flags=re.I)
    value = re.sub(r"^ipad gen 10th\s+64gb wifi$", "iPad Gen 10th 64GB Wifi", value, flags=re.I)
    value = re.sub(r"^ipad mini 6\s*\(wi[- ]fi\s+([^)]*)\)$", r"iPad Mini 6 \1 Wifi", value, flags=re.I)
    value = re.sub(r"^ipad pro m([1245])\s*\(wi[- ]fi\s+11\"\s+([^)]*)\)$", 'iPad Pro 11" M\\1 \\2 Wifi', value, flags=re.I)
    value = re.sub(r"^ipad pro 11\" m([1245])\s+(.+)$", 'iPad Pro 11" M\\1 \\2', value, flags=re.I)
    value = re.sub(r"^macbook air m([123])$", r'MacBook Air 13" M\1 8/256GB', value, flags=re.I)
    value = re.sub(r"^macbook air m([123])\s+13'\s+256gb$", r'MacBook Air 13" M\1 8/256GB', value, flags=re.I)
    value = re.sub(r"^macbook air m([123])\s+15'\s+256gb$", r'MacBook Air 15" M\1 8/256GB', value, flags=re.I)
    value = re.sub(r"^apple watch 9\b", "Apple Watch S9", value, flags=re.I)
    value = re.sub(r"^apple watch se2\b", "Apple Watch SE 2", value, flags=re.I)
    value = re.sub(r"^apple watch ultra\s*\(\s*", "Apple Watch Ultra (", value, flags=re.I)
    value = re.sub(r"\(\s*([^)]*?)\s*\)", lambda m: "(" + _clean_text(m.group(1)) + ")", value)
    value = re.sub(r"(\d+)\s*(?:GB|Gb|gb|G|g)\b", r"\1GB", value)
    value = re.sub(r"(\d+)\s*(TB|tb)\b", r"\1TB", value)
    value = _clean_text(value)
    capacity_match = re.search(r"(\d+)(GB|TB)\b", value, flags=re.I)
    capacity = capacity_match.group(0).upper() if capacity_match else None
    return {"raw_model": raw, "canonical_model": value, "category": category,
            "capacity": capacity, "mapping_status": "Auto-normalized" if value != raw else "Mapped"}


def normalize_price(value):
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    if isinstance(value, str):
        compact = value.replace(".", "").replace(",", "").replace(" ", "").strip()
        if compact.isdigit() and int(compact) > 0:
            return int(compact)
    return None


def stock_status(value):
    if value is None or _clean_text(value) == "":
        return "Missing"
    return "OOS" if _clean_text(value).casefold() == "oos" else "In stock"


def _partner(value):
    # TZ and Hoang Ha are retained in source lineage but excluded from tracked partners.
    canonical = PARTNER_ALIASES.get(_clean_text(value).upper())
    return None if canonical in {"TZ", "Hoang Ha"} else canonical


def _batch_id():
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()[:12]
    return f"price_check_{digest}"


def _iter_observations(sheet, meta, batch_id):
    rows = sheet.iter_rows(values_only=True)
    header_values = next(rows, ())
    headers = [_partner(value) for value in header_values]
    notes = {}
    for idx, value in enumerate(header_values):
        label = _clean_text(value).casefold()
        if "thay đổi" in label or "thay doi" in label:
            raw_partner = re.sub(r"^.*?thay\s+đổi\s*", "", _clean_text(value), flags=re.I)
            partner = _partner(raw_partner)
            if partner:
                notes[partner] = idx
    # Legacy sheets store model/price pairs. Current sheets store model in column A and prices by partner.
    paired = any(headers[col] and col + 1 < len(headers) and headers[col] == headers[col + 1]
                 for col in range(1, len(headers) - 1))
    for row, values in enumerate(rows, start=2):
        values = list(values)
        if paired:
            # In paired sheets, even columns contain model names and the
            # following odd column contains that model's price/status.
            for idx in range(0, len(values) - 1, 2):
                # Keep unknown product names as Category=Review so they remain
                # visible in the mapping/review queue instead of disappearing.
                if not isinstance(values[idx], str) or not _is_model_candidate(values[idx]):
                    continue
                partner = headers[idx] or (headers[idx + 1] if idx + 1 < len(headers) else None)
                if not partner:
                    continue
                yield _make_record(values[idx], values[idx + 1], partner, meta, sheet.title, row, batch_id, values[notes[partner]] if partner in notes and notes[partner] < len(values) else None)
        else:
            model = values[0] if values else None
            # Unknown prefixes are retained as Review rows for auditability.
            if not isinstance(model, str) or not _is_model_candidate(model):
                continue
            for idx in range(1, len(values)):
                if headers[idx]:
                    partner = headers[idx]
                    yield _make_record(model, values[idx], partner, meta, sheet.title, row, batch_id, values[notes[partner]] if partner in notes and notes[partner] < len(values) else None)


def _make_record(raw_model, raw_price, partner, meta, source_sheet, source_row, batch_id, change_note=None):
    identity = canonicalize_model(raw_model)
    price = normalize_price(raw_price)
    corrected = False
    # Confirmed source typo: MW listed iPhone 16e 128GB as 169,900,000.
    if (identity["canonical_model"] == "iPhone 16e 128GB" and partner == "MW" and price == 169900000):
        price = 16990000
        corrected = True
    status = stock_status(raw_price)
    if price is not None:
        status = "In stock"
    return {**meta, **identity, "partner": partner, "price_vnd": price,
            "stock_status": status, "source_sheet": source_sheet, "source_row": source_row,
            "source_url": "", "import_batch_id": batch_id, "price_corrected": corrected,
            "price_change_note": change_note if isinstance(change_note, str) and not change_note.startswith("#") else None}


def build_clean_data(source=SOURCE):
    global SOURCE
    SOURCE = Path(source)
    batch_id = _batch_id()
    book = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    records, mapping = [], {}
    for sheet in book.worksheets:
        meta = canonical_week(sheet.title)
        if meta:
            records.extend(_iter_observations(sheet, meta, batch_id))
    for record in records:
        mapping[record["raw_model"]] = {k: record[k] for k in ("raw_model", "canonical_model", "category", "capacity", "mapping_status")}
    records.sort(key=lambda x: (x["fiscal_year"], x["quarter"], x["week_number"], x["canonical_model"], x["partner"], x["source_sheet"], x["source_row"]))
    grouped = defaultdict(list)
    for record in records:
        grouped[(record["week_id"], record["canonical_model"], record["partner"])].append(record)
    issues = []
    clean = []
    duplicate_keys = []
    for key, candidates in grouped.items():
        if len(candidates) > 1:
            duplicate_keys.append(key)
            values = {(r["price_vnd"], r["stock_status"]) for r in candidates}
            if len(values) > 1:
                issues.append({"severity": "High", "type": "conflicting_duplicate", "key": "|".join(key), "detail": str(sorted(values, key=repr))})
            else:
                issues.append({"severity": "Medium", "type": "duplicate", "key": "|".join(key), "detail": f"{len(candidates)} identical observations"})
        # Deterministic status precedence: valid price > OOS > Missing.
        # This prevents a blank/OOS duplicate from masking an observed price.
        priced = [r for r in candidates if r["price_vnd"] is not None]
        if priced:
            chosen = priced[-1]
        else:
            oos = [r for r in candidates if r["stock_status"] == "OOS"]
            chosen = oos[-1] if oos else candidates[-1]
        if len(candidates) > 1 and len({(r["price_vnd"], r["stock_status"]) for r in candidates}) > 1:
            chosen = {**chosen, "mapping_status": "Review"}
        clean.append(chosen)
    clean.sort(key=lambda x: (x["fiscal_year"], x["quarter"], x["week_number"], x["category"], x["canonical_model"], x["partner"]))
    weeks = sorted({r["week_id"] for r in clean}, key=lambda w: (next(r for r in clean if r["week_id"] == w)["fiscal_year"], next(r for r in clean if r["week_id"] == w)["quarter"], next(r for r in clean if r["week_id"] == w)["week_number"]))
    model_weeks = defaultdict(set)
    for r in clean:
        model_weeks[r["canonical_model"]].add(r["week_id"])
    week_pos = {w: i for i, w in enumerate(weeks)}
    lifecycle = []
    for model, seen in sorted(model_weeks.items()):
        first, last = min(seen, key=lambda w: week_pos[w]), max(seen, key=lambda w: week_pos[w])
        lifecycle.append({"canonical_model": model, "category": next(r["category"] for r in clean if r["canonical_model"] == model), "first_seen_week": first, "last_seen_week": last, "weeks_seen": len(seen), "status": "Active" if last == weeks[-1] else "Not seen in latest week"})
    summary = {
        "source_file": Path(SOURCE).name, "import_batch_id": batch_id, "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input_observations": len(records), "clean_observations": len(clean), "duplicate_keys": len(duplicate_keys),
        "conflicting_duplicate_issues": sum(i["type"] == "conflicting_duplicate" for i in issues),
        "weeks": len(weeks), "models": len({r["canonical_model"] for r in clean}), "raw_models": len(mapping),
        "categories": dict(Counter(r["category"] for r in clean)), "partners": dict(Counter(r["partner"] for r in clean)),
        "stock_status": dict(Counter(r["stock_status"] for r in clean)), "mapping_status": dict(Counter(r["mapping_status"] for r in clean)),
        "corrected_prices": sum(bool(r.get("price_corrected")) for r in clean),
        "new_models_by_week": {w: sorted({r["canonical_model"] for r in clean if r["week_id"] == w and next((x for x in lifecycle if x["canonical_model"] == r["canonical_model"]), {}) .get("first_seen_week") == w}) for w in weeks},
        "model_lifecycle": lifecycle, "issues": issues,
    }
    return clean, list(mapping.values()), summary


def _write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader(); writer.writerows(rows)


def write_outputs(clean, mapping, summary, out_dir=OUTPUT_DIR):
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    clean_fields = ["week_id", "week_number", "quarter", "fiscal_year", "category", "raw_model", "canonical_model", "capacity", "partner", "price_vnd", "stock_status", "price_change_note", "source_sheet", "source_row", "source_url", "mapping_status", "import_batch_id"]
    _write_csv(out_dir / "clean_price_data.csv", clean, clean_fields)
    _write_csv(out_dir / "model_mapping.csv", mapping, ["raw_model", "canonical_model", "category", "capacity", "mapping_status"])
    (out_dir / "data_quality_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_preview(out_dir / "data_quality_preview.html", clean, mapping, summary)


def _write_preview(path, clean, mapping, summary):
    def table(headers, rows):
        body = "".join("<tr>" + "".join(f"<td>{html.escape(str(row.get(h, '')))}</td>" for h in headers) + "</tr>" for row in rows)
        return f"<table><thead><tr>{''.join(f'<th>{html.escape(h)}</th>' for h in headers)}</tr></thead><tbody>{body}</tbody></table>"
    issue_rows = summary["issues"][:250]
    lifecycle = summary["model_lifecycle"]
    weeks = [{"week_id": w, "models": sum(1 for x in clean if x["week_id"] == w), "oos": sum(x["stock_status"] == "OOS" for x in clean if x["week_id"] == w), "missing": sum(x["stock_status"] == "Missing" for x in clean if x["week_id"] == w)} for w in sorted({x["week_id"] for x in clean})]
    cards = "".join(f"<div class='card'><small>{html.escape(k)}</small><strong>{html.escape(str(v))}</strong></div>" for k,v in [("Input observations",summary["input_observations"]),("Clean observations",summary["clean_observations"]),("Weeks",summary["weeks"]),("Canonical models",summary["models"]),("Duplicate keys",summary["duplicate_keys"]),("Review issues",len([x for x in mapping if x['mapping_status']=='Review'])+summary['conflicting_duplicate_issues'])])
    content = f"""<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Price Watch · Data Quality Preview</title><style>body{{margin:0;background:#f4f2ed;color:#18231e;font:14px system-ui,-apple-system,sans-serif}}main{{max-width:1450px;margin:auto;padding:30px}}h1{{letter-spacing:-.04em;margin:0 0 6px}}h2{{margin:34px 0 10px;font-size:17px}}p,small{{color:#68766d}}.cards{{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:25px 0}}.card{{background:white;border:1px solid #e2e6df;border-radius:10px;padding:16px}}.card strong{{display:block;font-size:25px;margin-top:7px}}.panel{{background:#fff;border:1px solid #e2e6df;border-radius:10px;padding:18px;margin:12px 0;overflow:auto}}table{{width:100%;border-collapse:collapse;font-size:12px;min-width:700px}}th{{text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:10px;color:#68766d;padding:10px;border-bottom:1px solid #e4e9e2;white-space:nowrap}}td{{padding:10px;border-bottom:1px solid #eef1ed;white-space:nowrap}}.ok{{color:#176245}}.warn{{color:#a66028}}.bad{{color:#ad4239}}@media(max-width:850px){{.cards{{grid-template-columns:repeat(2,1fr)}}main{{padding:18px}}}}</style></head><body><main><p>PRICE CHECK · CLEAN DATA PREVIEW</p><h1>Data contract & quality gate</h1><p>Source: {html.escape(summary['source_file'])} · Batch: {html.escape(summary['import_batch_id'])} · Generated: {html.escape(summary['generated_at'])}</p><div class='cards'>{cards}</div><h2>Coverage by week</h2><div class='panel'>{table(['week_id','models','oos','missing'],weeks)}</div><h2>Model mapping ({len(mapping)} raw names)</h2><div class='panel'>{table(['raw_model','canonical_model','category','capacity','mapping_status'],mapping)}</div><h2>Model lifecycle</h2><div class='panel'>{table(['canonical_model','category','first_seen_week','last_seen_week','weeks_seen','status'],lifecycle)}</div><h2>Quality issues</h2><div class='panel'>{table(['severity','type','key','detail'],issue_rows) if issue_rows else '<p class="ok">No quality issues found.</p>'}</div></main></body></html>"""
    path.write_text(content, encoding="utf-8")


def main():
    clean, mapping, summary = build_clean_data()
    write_outputs(clean, mapping, summary)
    print(json.dumps({k: summary[k] for k in ("input_observations", "clean_observations", "weeks", "models", "duplicate_keys", "categories", "stock_status")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
