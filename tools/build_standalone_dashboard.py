"""Create a self-contained local HTML dashboard for browsers that block sibling file:// scripts."""
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
SOURCE_HTML = PROJECT / "dashboard-gia-ban-le.html"
DATA = PROJECT / "dashboard-data.js"
TARGET = Path("/Users/vutrungnghia/Downloads/Price Check/dashboard-gia-ban-le-thuc-te.html")

html = SOURCE_HTML.read_text(encoding="utf-8")
data = DATA.read_text(encoding="utf-8")
external_tag = '  <script src="dashboard-data.js"></script>'
if external_tag not in html:
    raise SystemExit("Expected external data tag not found")
html = html.replace(external_tag, "  <script>" + data + "</script>", 1)
TARGET.write_text(html, encoding="utf-8")
print(f"Wrote standalone dashboard: {TARGET} ({TARGET.stat().st_size:,} bytes)")
