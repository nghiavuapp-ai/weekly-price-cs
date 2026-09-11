import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from clean_price_data import (  # noqa: E402
    canonicalize_model,
    classify_category,
    normalize_price,
    stock_status,
)


def test_model_normalization_collapses_case_spacing_and_gb_variants():
    assert canonicalize_model("  iPhone 14   128 Gb ")["canonical_model"] == "iPhone 14 128GB"
    assert canonicalize_model("iPhone 15 Pro Max 1256Gb")["canonical_model"] == "iPhone 15 Pro Max 256GB"
    assert canonicalize_model("iPad Air 5 M1 64GB Wifi")["canonical_model"] == "iPad Air 5 64GB Wifi"
    assert canonicalize_model("iPad Mini 6 (Wi-fi 64GB)")["canonical_model"] == "iPad Mini 6 64GB Wifi"
    assert canonicalize_model("MacBook Air M2")["canonical_model"] == 'MacBook Air 13" M2 8/256GB'


def test_category_supports_requested_product_families():
    assert classify_category("MacBook Pro 14 16GB") == "MacBook"
    assert classify_category("Apple Watch Series 10") == "Apple Watch"
    assert classify_category("Watch S9 (41mm GPS)") == "Apple Watch"
    assert canonicalize_model("AW S10 (42mm GPS)")["canonical_model"].startswith("Apple Watch")
    assert classify_category("AirPods Pro 2") == "AirPods"
    assert classify_category("unknown device") == "Review"


def test_price_and_status_keep_oos_distinct_from_missing():
    assert normalize_price("19.990.000") == 19990000
    assert normalize_price("OOS") is None
    assert stock_status("OOS") == "OOS"
    assert stock_status(None) == "Missing"
