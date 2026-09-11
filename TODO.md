# Price Check — TODO

## Trạng thái hiện tại

- **confirmed:** Đã khởi tạo bộ 7 file context dùng chung.
- **confirmed:** Đã triển khai mã, test và workbook cho Price Check Daily.
- **confirmed:** Đã tích hợp Weekly/Daily vào dashboard nguồn và tạo local preview đã qua test tự động cùng kiểm tra trình duyệt desktop.

## Đang làm

- [ ] Người dùng duyệt local preview của dashboard tích hợp.

## Việc tiếp theo

- [ ] Đối chiếu context với README/guide/runbook hoặc tài liệu gốc trước mỗi thay đổi lớn.
- [ ] Đánh giá chất lượng Daily sau thời gian vận hành trước khi cân nhắc thay thế Weekly.
- [ ] Điều tra chứng chỉ SSL Viettel nếu lỗi `CERTIFICATE_VERIFY_FAILED` tiếp tục xuất hiện sau lượt retry kế tiếp.
- [ ] Chỉ deploy hoặc sao chép sang thư mục hosting sau khi local preview được duyệt.

## Vấn đề còn mở

- **unknown:** Ngày Daily đầu tiên có thể drill-down trực tiếp từ điểm Weekly; hiện Weekly mới nhất là `W11Q4FY26`, còn Daily hiện có thuộc `W11Q4FY26`.
