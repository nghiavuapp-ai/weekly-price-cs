# Price Check — Project Context

> Trạng thái: confirmed / assumption / unknown.

## Bối cảnh

- **confirmed:** Thư mục dự án là `/Users/vutrungnghia/Downloads/Codex Projects/Price Check`.
- **confirmed:** Bộ context này dùng chung cho Codex và Claude.
- **confirmed:** Dashboard phục vụ hai cấp xem giá: tổng quan toàn bộ model và chi tiết một model.
- **confirmed:** Dashboard cloud React/Vite đã được triển khai ở mức mã nguồn và local preview; chưa provision Supabase/GitHub/Vercel production trong trạng thái kiểm định này.

## Phạm vi

- **confirmed / in-scope:** Duy trì context và hướng dẫn riêng cho dự án này.
- **confirmed / out-of-scope:** Không đọc hoặc chỉnh sửa context dự án khác; không tự ý thay đổi mã nguồn hay tài liệu nghiệp vụ.

## Thuật ngữ và thông tin nền

- **unknown:** Chưa có thuật ngữ hoặc thông tin nền được xác nhận.
- **TODO:** Bổ sung khi có nguồn chính thức.

## Context dự án đã xác nhận

- **confirmed:** Price Check Automation cập nhật Price Check.xlsx từ link trực tiếp trong Link Product.xlsx; không tự search website. Price Overrides.csv có audit note. price_check_tool.py tạo backup, report crawl, review report và clean dashboard; có rule riêng cho FPT, MW, CPS, Shopdunk, Viettel. Đọc README.md trước khi chạy thật.
- **confirmed:** Price Check Daily chạy độc lập với Weekly, dùng `Price Check Daily.xlsx`, lưu snapshot đầy đủ và chỉ ghi biến động vào sheet `Changes`.
- **confirmed:** Daily chạy 11:00 mỗi ngày; 11:30 chỉ retry target lỗi. Kết quả rủi ro vẫn được ghi và tô vàng để kiểm tra thủ công.
- **confirmed:** Daily không sửa hoặc thay thế `Price Check.xlsx`; Weekly tiếp tục vận hành như hiện tại.
- **confirmed:** Dashboard mặc định mở bảng toàn bộ model iPhone tại tuần Weekly mới nhất; khi chọn model, biểu đồ hiển thị tối đa 13 tuần trong cùng quý FY.
- **confirmed:** Daily dashboard chỉ đọc snapshot được tham chiếu trong `Price Check Daily.xlsx` / `Run Log`, giới hạn 13 tuần Daily gần nhất và ánh xạ tuần Apple từ Chủ Nhật đến Thứ Bảy.
- **confirmed:** Một điểm Weekly chỉ drill-down khi tuần đó có Daily; Daily giữ cùng model, đặt Partner về tất cả và hiển thị tối đa 7 ngày của tuần.
- **confirmed:** Kiến trúc cloud dùng Supabase Postgres/Auth/Realtime làm source of truth, GitHub Actions chạy crawler và Vercel host frontend tĩnh.
- **confirmed:** Admin chỉ nhập mật khẩu ở UI; email cố định là cấu hình công khai. Mật khẩu và service-role key không được ghi vào Git hoặc bundle trình duyệt.
- **confirmed:** Chỉnh sửa thủ công là correction append-only cho đúng observation/ngày/tuần; crawler tương lai không ghi đè lịch sử đã sửa.
- **confirmed:** Lịch cloud mục tiêu là Daily 11:00, retry 11:30 hằng ngày và Weekly 12:00 thứ Sáu theo Asia/Ho_Chi_Minh.
