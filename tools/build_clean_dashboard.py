"""Build a self-contained Weekly and Daily retail pricing dashboard."""
from __future__ import annotations

import csv
import json
from pathlib import Path

from daily_dashboard_data import DEFAULT_DAILY_WORKBOOK, load_daily_payload


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs" / "clean-data" / "clean_price_data.csv"
SUMMARY = ROOT / "outputs" / "clean-data" / "data_quality_summary.json"
TARGET = ROOT / "dashboard-gia-ban-le-clean.html"
TEMPLATE = ROOT / "tools" / "dashboard_template.html"
STYLE = ROOT / "tools" / "dashboard_style.css"
SCRIPT = ROOT / "tools" / "dashboard_ui.js"


def load_rows(source: Path = SOURCE) -> list[dict]:
    with Path(source).open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        for name in ("week_number", "quarter", "fiscal_year"):
            row[name] = int(row[name])
        row["price_vnd"] = int(row["price_vnd"]) if row["price_vnd"] else None
        for name in ("price_change_note", "source_url"):
            row.pop(name, None)
    return sorted(rows, key=lambda r: (
        r["fiscal_year"], r["quarter"], r["week_number"],
        r["canonical_model"], r["partner"],
    ))


def build_payload(
    source: Path = SOURCE,
    summary_path: Path = SUMMARY,
    daily_workbook: Path = DEFAULT_DAILY_WORKBOOK,
) -> dict:
    payload = {
        "rows": load_rows(source),
        "summary": json.loads(Path(summary_path).read_text(encoding="utf-8")),
    }
    payload.update(load_daily_payload(Path(daily_workbook), retention_weeks=13))
    return payload


def build(
    source: Path = SOURCE,
    summary_path: Path = SUMMARY,
    daily_workbook: Path = DEFAULT_DAILY_WORKBOOK,
    target: Path = TARGET,
) -> None:
    payload = json.dumps(
        build_payload(source, summary_path, daily_workbook),
        ensure_ascii=False,
        separators=(",", ":"),
    ).replace("</", "<\\/")
    html = TEMPLATE.read_text(encoding="utf-8")
    html = html.replace("__STYLE__", STYLE.read_text(encoding="utf-8"))
    html = html.replace("__PAYLOAD__", payload)
    html = html.replace("__SCRIPT__", SCRIPT.read_text(encoding="utf-8"))
    output = Path(target)
    output.write_text(html, encoding="utf-8")
    print(f"Wrote {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
