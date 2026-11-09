# 9. Cập nhật phiên bản, quyền riêng tư và hỗ trợ

## 9.1 Cập nhật phiên bản

Ứng dụng **không tự kiểm tra, không tự tải, không tự cài** bản mới. Mọi
bước đều do bạn bấm:

1. Mở **Công cụ → Thông tin phần mềm**, tab **Phiên bản & cập nhật**.
2. (Nên làm) bấm **Kiểm tra an toàn nâng cấp**. Đây là kiểm tra chỉ đọc
   trên máy: hồ sơ, quy trình, trạng thái license/kho proxy và các phiên
   đang chạy. Nó không sao lưu cookie — muốn giữ phiên đăng nhập, tạo
   **Snapshot phiên** trước (chương 5).
3. Bấm **Kiểm tra phiên bản online**. Ứng dụng tải một tệp mô tả nhỏ
   (manifest) từ GitHub. Thao tác này để lộ địa chỉ IP của máy bạn với
   GitHub.
4. Nếu có bản mới, bấm **Tải bản cập nhật đã xác minh**. Ứng dụng chỉ nhận
   tệp khi manifest có chữ ký Ed25519 của nhà phát hành **và** tệp tải về
   khớp đúng mã SHA-256 trong manifest. Không khớp thì tải bị từ chối.
5. Bấm **Mở thư mục bộ cài**, đóng ứng dụng, chạy bộ cài mới. Cài đè giữ
   nguyên thư mục dữ liệu (`%APPDATA%\power-browser`) và license.

Nếu chưa có khóa nhà phát hành hoặc manifest hợp lệ, nút tải bị khóa — đó
là hành vi an toàn có chủ đích, không phải lỗi.

## 9.2 Quyền riêng tư

- Ứng dụng không gửi cookie, mật khẩu, lịch sử duyệt web hay dữ liệu hồ sơ
  về máy chủ của bên bán.
- Kích hoạt license chỉ cần dán mã license; khi bên bán bật máy chủ xác
  minh, ứng dụng chỉ gửi mã license và mã cài đặt để nhận biên nhận có chữ
  ký.
- **AI Advisor** chỉ chạy khi bạn tự lưu API key OpenRouter của mình. Câu
  hỏi bạn gõ (và, nếu bạn tick đồng ý, số lượng tổng hợp hồ sơ/engine/nhóm/
  proxy — không gửi tên, địa chỉ proxy hay URL) được gửi tới OpenRouter và
  nhà cung cấp model; có thể phát sinh chi phí API của chính bạn. Không lưu
  key thì không gửi gì.

## 9.3 Gửi thông tin khi cần hỗ trợ

Gửi bên bán:

- Phiên bản (Công cụ → Thông tin phần mềm) và **mã cài đặt** (Công cụ →
  Giấy phép & gia hạn → Sao chép mã).
- Ảnh chụp màn hình lỗi.
- Khi được yêu cầu: **Kiểm tra hồ sơ → Hệ thống & engine → Xuất báo cáo hỗ
  trợ**. Báo cáo không chứa mật khẩu, cookie hay token.

**Không bao giờ** gửi mật khẩu tài khoản, mật khẩu proxy, mã license hay
cookie cho bất kỳ ai, kể cả người tự xưng là bên hỗ trợ.
