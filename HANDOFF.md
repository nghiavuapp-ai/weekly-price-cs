# Price Check — Handoff

## Tóm tắt hiện tại

Context đã được nâng cấp theo tài liệu thực tế trong `/Users/vutrungnghia/Downloads/Codex Projects/Price Check`. Đọc `PROJECT_CONTEXT.md` và các nguồn được liệt kê trong `SOURCES.md` trước khi làm việc; thông tin chưa có nguồn vẫn là unknown.

Price Check Daily đã được thiết kế độc lập với Weekly. Entry point là
`tools/daily_price_check.py`; workbook là `Price Check Daily.xlsx`; output audit nằm
trong `outputs/daily/`. Đọc mục `Price Check Daily` trong README trước khi vận hành.

Dashboard nguồn đã tích hợp hai cấp Weekly/Daily. `tools/build_clean_dashboard.py`
gọi module mới `tools/daily_dashboard_data.py`, sau đó đóng gói template, CSS và JS
thành `dashboard-gia-ban-le-clean.html`. Các file giao diện nguồn là
`tools/dashboard_template.html`, `tools/dashboard_style.css` và
`tools/dashboard_ui.js`.

Nền tảng cloud mới nằm trong `supabase/`, `tools/cloud_price_check.py`,
`.github/workflows/price-check.yml` và `web/`. Frontend đã qua 20/20 test, production
build và kiểm tra trình duyệt thật cho bảng Weekly, chọn model, drill-down Daily và
màn mở khóa admin. Production cloud chưa được provision ở thời điểm handoff này.

## Việc cần làm tiếp theo

1. Theo dõi automation primary 11:00 và retry 11:30.
2. Kiểm tra các dòng màu vàng có `Review Status = Pending`.
3. Chỉ sửa giá đã xác nhận qua `Price Overrides.csv`.
4. Không dùng Daily để thay thế Weekly khi chưa có quyết định mới.
5. Provision cloud theo runbook trong README, import lịch sử và chạy shadow 7 ngày trước khi bật lịch authoritative.
6. Weekly Price Check kiểm tra CTA mua hàng cùng với giá: CTA âm tính là OOS; CTA xung đột hoặc không xác minh được phải review.

## Kiểm định gần nhất

- **2026-09-11:** W11Q4FY26 đã được cập nhật từ report `price_results_W11Q4FY26_20260911-013037.csv` và có backup tương ứng.
- **Kết quả:** 195 dòng, 135 OK, 60 OOS; không còn dòng cần review sau khi xác minh lại CTA và cổng tồn kho Shopdunk.
- **Đã xác nhận:** iPhone 13 FPT là OOS qua `Liên hệ tư vấn`; iPhone 13 Shopdunk là OOS qua `shopdunk_stock_endpoint` với `finalGate=false`.
- **Kiểm thử:** 37/37 unit test đạt; `py_compile`, `node --check` và kiểm tra ZIP workbook đều đạt.

## Quy tắc chuyển giao

Codex và Claude phải đọc 5 file context chung; AGENTS.md và CLAUDE.md không phải nguồn sự thật riêng biệt.
