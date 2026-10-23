# LHM Customer Handoff Center — nghiệm thu bán thử theo bằng chứng

## Trên ứng dụng
Mở **Công cụ → Thông tin phần mềm → Kiểm tra trước khi bàn giao khách hàng**.
Bấm **Chạy kiểm tra cục bộ**, có thể chủ động **Xuất báo cáo hỗ trợ JSON**.

LHM lấy trạng thái hiện có, không gọi mạng và không can thiệp tài khoản:
- Có đang chạy ứng dụng EXE đóng gói hay bản developer.
- License hiện tại có thể hoạt động, đã hết hạn/hạn chế hay còn trial.
- Trạng thái máy chủ xác minh thuê tháng: có dữ liệu cục bộ **không đồng nghĩa** máy chủ thương mại đã nghiệm thu.
- Có khóa công khai Ed25519 cho cập nhật: **không có nghĩa** manifest công khai đã được xác minh end-to-end.
- Đọc kiểm tra an toàn nâng cấp và tính nhất quán của hồ sơ/proxy.
- Mọi lỗi bắt buộc được đánh dấu **CẦN SỬA**. Thiếu bằng chứng không được chuyển thành dấu tích PASS.

Báo cáo chỉ chứa số đếm và nhãn trạng thái, không có installation ID,
license token, profile ID/tên, đường dẫn, proxy IP/credential,
cookies, URL khách hay dữ liệu phiên.

## Chính sách quyết định
- `blocked`: lỗi license, cấu hình nghiêm trọng hoặc dữ liệu cục bộ không an toàn.
- `review`: có cảnh báo, hạ tầng chưa nghiệm thu hoặc bằng chứng chưa đủ.
- `local_checks_only`: chỉ có nghĩa các kiểm tra nội bộ đã đạt; KHÔNG bao giờ đồng nghĩa được phép phát hành công khai.
- Bốn cổng độc lập vẫn `NOT_VERIFIED`: Windows khách thật, signed online update, thuê tháng + thanh toán, owner Gate 4.

## GitHub Windows acceptance
Thêm **màn hình thứ 9**: ứng dụng gọi kiểm tra từ Electron thật,
nhận đủ 6 thẻ kết quả và phải giữ cảnh báo 'chưa xác minh'.
Ảnh được chụp hai lần, trên app source và EXE đóng gói. Windows CI
lưu SHA-256 chính xác của EXE và 9 màn hình vào evidence.

Nghiệm thu trên máy khách (Gate 3) vẫn bắt buộc. Phần mềm có thể
không ký Authenticode nhưng không được bỏ qua xác minh Ed25519
của update/engine hoặc tắt bảo vệ Windows.
