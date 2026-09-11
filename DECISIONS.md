# Price Check — Decisions

## Quy ước

Chỉ ghi quyết định đã xác nhận, gồm ngày, trạng thái, lý do và tác động.

## Đã xác nhận

### D-001 — Dùng context chung cho Codex và Claude

- **Ngày:** 2026-09-07
- **Trạng thái:** confirmed
- **Quyết định:** Năm file `PROJECT_CONTEXT.md`, `DECISIONS.md`, `TODO.md`, `SOURCES.md` và `HANDOFF.md` là nguồn sự thật chung; `AGENTS.md` và `CLAUDE.md` chỉ chứa hướng dẫn công cụ.
- **Lý do:** Giảm lệch context khi chuyển giao.
- **Tác động:** Mọi thay đổi phải cập nhật file chung tương ứng.

### D-002 — Tách Price Check Daily khỏi Weekly

- **Ngày:** 2026-09-10
- **Trạng thái:** confirmed
- **Quyết định:** Daily dùng workbook mới `Price Check Daily.xlsx`; `Price Check.xlsx` và crawler Weekly không thay đổi.
- **Lý do:** Tăng tần suất theo dõi nhưng không làm phình hoặc phá cấu trúc sheet tuần.
- **Tác động:** Daily dùng chung link, override và parser; dữ liệu audit nằm dưới `outputs/daily/`.

### D-003 — Workbook Daily chỉ lưu trạng thái mới nhất và sự kiện thay đổi

- **Ngày:** 2026-09-10
- **Trạng thái:** confirmed
- **Quyết định:** Workbook gồm `Latest`, `Changes`, `Run Log`; snapshot đầy đủ lưu CSV riêng.
- **Lý do:** Giữ workbook gọn nhưng vẫn audit lại được mọi lượt crawl.
- **Tác động:** Baseline đầu tiên không tạo change event; mọi thay đổi giá hoặc tồn kho sau đó đều được ghi.

### D-004 — Lịch và chính sách lỗi Daily

- **Ngày:** 2026-09-10
- **Trạng thái:** confirmed
- **Quyết định:** Primary chạy 11:00 hằng ngày và luôn báo cáo; retry lúc 11:30 chỉ chạy lại target lỗi.
- **Lý do:** Không bỏ lỡ lỗi tạm thời nhưng tránh crawl lại toàn bộ danh sách.
- **Tác động:** Kết quả rủi ro được ghi và tô vàng; lỗi fetch không ghi đè `Latest`.

### D-005 — Gộp hai mốc chạy trong một Codex heartbeat

- **Ngày:** 2026-09-10
- **Trạng thái:** confirmed
- **Quyết định:** Một heartbeat chạy ở cả 11:00 và 11:30; prompt chọn primary hoặc retry theo thời điểm.
- **Lý do:** Codex chỉ cho phép một heartbeat hoạt động trên mỗi task.
- **Tác động:** Hành vi hai lượt mỗi ngày giữ nguyên mà không tạo cron workaround.

### D-006 — Tích hợp Daily vào dashboard theo mô hình hai cấp

- **Ngày:** 2026-09-10
- **Trạng thái:** confirmed
- **Quyết định:** Màn hình tổng quan cho phép lọc toàn bộ model theo tuần hoặc ngày. Chi tiết model mặc định là Weekly tối đa 13 tuần; điểm tuần có Daily cho phép drill-down sang tối đa 7 ngày Chủ Nhật–Thứ Bảy của chính tuần đó.
- **Lý do:** Giữ được góc nhìn tổng quan dài hạn của Weekly và bổ sung diễn biến ngắn hạn mà không thay đổi crawler hay workbook nguồn.
- **Tác động:** Dashboard chỉ lấy Daily từ snapshot có trong `Run Log`, carry-forward trạng thái hợp lệ với nhãn stale, không đưa URL/lỗi crawl chi tiết vào HTML và hiện chỉ được build để duyệt local.

### D-007 — Xác minh tồn kho bằng CTA mua hàng

- **Ngày:** 2026-09-11
- **Trạng thái:** confirmed
- **Quyết định:** Chỉ coi sản phẩm còn bán được khi có giá và CTA mua/đặt hàng đang hiển thị; CTA `Chờ liên hệ`, `Liên hệ tư vấn`, `Sắp về hàng`, `Sản phẩm ngừng kinh doanh`, `Sold out` hoặc `Out of stock` được coi là OOS.
- **Lý do:** Giá vẫn có thể còn trong metadata hoặc trang sản phẩm dù SKU không thể đặt hàng, như iPhone 13 trên Shopdunk và FPT.
- **Tác động:** Browser back-check ghi nhận CTA đang hiển thị; HTML có CTA xung đột hoặc không xác minh được bị giữ ở review, không tự động ghi là còn hàng.

## Chưa quyết định

- **unknown:** Thời điểm duyệt và deploy dashboard tích hợp lên hosting.
