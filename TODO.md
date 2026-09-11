# Price Check — TODO

## Trạng thái hiện tại

- **confirmed:** Đã khởi tạo bộ 7 file context dùng chung.
- **confirmed:** Đã triển khai mã, test và workbook cho Price Check Daily.
- **confirmed:** Đã tích hợp Weekly/Daily vào dashboard nguồn và tạo local preview đã qua test tự động cùng kiểm tra trình duyệt desktop.
- **confirmed:** Đã thêm schema Supabase/RLS/Realtime, importer lịch sử, cloud crawler, React admin dashboard và cấu hình GitHub Actions/Supabase Cron/Vercel ở mức mã nguồn.

## Đang làm

- [ ] Provision project Supabase, Auth admin, GitHub App/secrets và Vercel production.
- [ ] Import toàn bộ lịch sử rồi chạy shadow và đối chiếu 7 ngày trước khi bật authoritative schedule.

## Việc tiếp theo

- [ ] Đối chiếu context với README/guide/runbook hoặc tài liệu gốc trước mỗi thay đổi lớn.
- [ ] Đánh giá chất lượng Daily sau thời gian vận hành trước khi cân nhắc thay thế Weekly.
- [ ] Điều tra chứng chỉ SSL Viettel nếu lỗi `CERTIFICATE_VERIFY_FAILED` tiếp tục xuất hiện sau lượt retry kế tiếp.
- [ ] Chạy smoke test production cho public dashboard, admin correction realtime và tải hai workbook.

## Vấn đề còn mở

- **unknown:** Ngày Daily đầu tiên có thể drill-down trực tiếp từ điểm Weekly; hiện Weekly mới nhất là `W11Q4FY26`, còn Daily hiện có thuộc `W11Q4FY26`.
