# Price Check — Sources

## Nguyên tắc

Chỉ ghi nguồn đã cung cấp hoặc kiểm chứng. Không ghi mật khẩu, API key, token, dữ liệu cá nhân hoặc thông tin nhạy cảm.

## Nguồn đã kiểm chứng

| ID | Nguồn | Loại | Trạng thái | Ghi chú |
|---|---|---|---|---|
| S-001 | `/Users/vutrungnghia/Downloads/Codex Projects/Price Check` | Thư mục dự án | confirmed | Nguồn filesystem trong phạm vi dự án. |
| S-002 | `Link Product.xlsx` | Link sản phẩm trực tiếp | confirmed | Nguồn URL dùng chung cho Daily và Weekly. |
| S-003 | `Price Overrides.csv` | Override giá đã xác nhận | confirmed | Nguồn hiệu chỉnh có audit note. |
| S-004 | `tools/price_check_tool.py` | Crawler và rule giá | confirmed | Parser/risk/back-check dùng chung cho Daily và Weekly. |
| S-005 | `supabase/migrations/202609110001_price_platform.sql` | Schema cloud | confirmed | RLS, append-only observations/corrections, effective views và Realtime. |
| S-006 | `.github/workflows/price-check.yml` | Runner cloud | confirmed | Workflow thủ công được Supabase dispatcher gọi theo lịch. |

## Nguồn cần bổ sung

- **unknown:** Tài liệu yêu cầu, dữ liệu, repository, website hoặc đường link chính thức.
- **confirmed:** README, guide, runbook hoặc tài liệu gốc hiện có trong thư mục là nguồn cần đọc trước task tương ứng.
