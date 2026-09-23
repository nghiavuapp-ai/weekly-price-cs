# Price Check — Handoff

## Tóm tắt hiện tại

- **2026-09-23 — confirmed:** Production UI của `https://weekly-price-cs.vercel.app` đã được cập nhật từ commit `435dbc6`: nhận diện Community Specialist, tiêu đề/metadata/fav icon `Community Specialist - Bảng giá bán lẻ Apple`, liên kết `Bản tin` tới Daily News và token giao diện đồng nhất với Community Specialist. Không thay đổi crawler, Supabase, workbook hay quy tắc dữ liệu. Đã xác nhận build, 35 frontend tests và browser smoke trên production.
- **2026-09-23 — confirmed:** Production UI từ commit `916164b` cân bằng lại cụm bộ lọc desktop theo lưới một hàng, giữ bố cục mobile không tràn ngang, và liên kết `Bản tin` mở trong tab mới. Không thay đổi crawler, Supabase, workbook hay quy tắc dữ liệu. Đã xác nhận 35 frontend tests, build và browser smoke ở desktop/mobile trên production.

Context đã được nâng cấp theo tài liệu thực tế trong `/Users/vutrungnghia/Downloads/Codex Projects/Price Check`. Đọc `PROJECT_CONTEXT.md` và các nguồn được liệt kê trong `SOURCES.md` trước khi làm việc; thông tin chưa có nguồn vẫn là unknown.

Price Check Daily đã được thiết kế độc lập với Weekly. Entry point là
`tools/daily_price_check.py`; workbook là `Price Check Daily.xlsx`; output audit nằm
trong `outputs/daily/`. Đọc mục `Price Check Daily` trong README trước khi vận hành.

Dashboard nguồn đã tích hợp hai cấp Weekly/Daily. `tools/build_clean_dashboard.py`
gọi module mới `tools/daily_dashboard_data.py`, sau đó đóng gói template, CSS và JS
thành `dashboard-gia-ban-le-clean.html`. Các file giao diện nguồn là
`tools/dashboard_template.html`, `tools/dashboard_style.css` và
`tools/dashboard_ui.js`.

Nền tảng cloud nằm trong `supabase/`, `tools/cloud_price_check.py`,
`.github/workflows/price-check.yml` và `web/`. Vercel production, Supabase và public
GitHub repo đã hoạt động. Cloud đang ở chế độ shadow: production được khóa bằng
`price_automation_state` và chỉ tự mở sau 7 ngày liên tiếp có
`quality_gate.passed=true`. FPT có fallback public BFF API khi HTML bị chặn 403.

## Việc cần làm tiếp theo

1. Theo dõi automation primary 11:00 và retry 11:30.
2. Kiểm tra các dòng màu vàng có `Review Status = Pending`.
3. Chỉ sửa giá đã xác nhận qua `Price Overrides.csv`.
4. Không dùng Daily để thay thế Weekly khi chưa có quyết định mới.
5. Theo dõi artifact `shadow-comparison` lúc 13:17 hằng ngày; không bật production
   thủ công. Gate tự bật sau đúng 7 ngày liên tiếp đạt và tự reset chuỗi khi có ngày
   lỗi hoặc thiếu baseline local.
6. Weekly Price Check kiểm tra CTA mua hàng cùng với giá: CTA âm tính là OOS; CTA xung đột hoặc không xác minh được phải review.

## Kiểm định gần nhất

- **2026-09-14:** snapshot local chính xác `daily-20260914-primary` đã được import
  lên Supabase để làm baseline shadow: 195 dòng, 132 có giá, 63 OOS, 0 lỗi,
  0 review, SHA256 `6c00a10f59f461f66e393f629ae4f7caf4a4731e502783ce29da28b16af6a3cc`.
- **Cloud code:** 81/81 unit test đạt; lịch GitHub dùng UTC cố định tương ứng
  11:00, 11:30, 12:00 thứ Sáu và shadow 13:17 giờ Việt Nam. Production vẫn khóa
  cho đến khi hoàn tất gate 7 ngày.

- **2026-09-11:** W11Q4FY26 đã được cập nhật từ report `price_results_W11Q4FY26_20260911-013037.csv` và có backup tương ứng.
- **Kết quả:** 195 dòng, 135 OK, 60 OOS; không còn dòng cần review sau khi xác minh lại CTA và cổng tồn kho Shopdunk.
- **Đã xác nhận:** iPhone 13 FPT là OOS qua `Liên hệ tư vấn`; iPhone 13 Shopdunk là OOS qua `shopdunk_stock_endpoint` với `finalGate=false`.
- **Kiểm thử:** 37/37 unit test đạt; `py_compile`, `node --check` và kiểm tra ZIP workbook đều đạt.

## Quy tắc chuyển giao

Codex và Claude phải đọc 5 file context chung; AGENTS.md và CLAUDE.md không phải nguồn sự thật riêng biệt.
