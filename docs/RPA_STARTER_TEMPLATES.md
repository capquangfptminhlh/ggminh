# Bộ mẫu RPA khởi đầu — Automation Studio

Bản nâng cấp này cung cấp ba **mẫu cục bộ, tĩnh và có thể chỉnh sửa**:

1. Kiểm tra tiêu đề trang bằng `wait_for` và `assert_text`.
2. Kiểm tra có điều kiện bằng `if_exists / else / end_if`.
3. Kiểm tra nhấn nút với `approval` bắt buộc.

## Cách dùng

Mở **Automation Studio → Mẫu quy trình có sẵn → Dùng mẫu**.
Studio chỉ tạo **bản nháp chưa lưu**, không chạy tự động và không yêu cầu mạng
để tải template. Thay `example.com` bằng website hợp pháp mà bạn sở hữu
hoặc có quyền kiểm thử; sửa selector và nội dung so khớp; chọn hồ sơ,
bấm **Lưu quy trình**; chỉ chạy khi đã kiểm tra đầy đủ.

Các mẫu không chứa mã nhúng, cookies, session, mật khẩu, token, OTP
hoặc cấu hình fingerprint. Đường chạy vẫn qua `WorkflowStore.save()`,
`clean()` và bộ kiểm tra quyền/cho phép tên miền sẵn có, với xác nhận
trước thao tác click/fill theo chính sách Studio.

## Kỹ thuật

- Danh sách mẫu: `src/automation/workflowTemplates.js`
- IPC read-only: `studio-templates`, được expose bởi `preload.js`
- UI: `src/ui/workflowStudio.js`, tạo bản nháp riêng, không ghi tự động
- Tests: `node test/rpa-templates.js` trong `npm test`

Đây **không phải marketplace**, không hỗ trợ cài template từ bên ngoài
và không phải AI Agent tự vận hành. Cần thử trên Windows đóng gói trước khi
đưa vào nhánh phát hành.
