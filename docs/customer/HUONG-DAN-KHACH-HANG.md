# Hướng dẫn sử dụng LHM Ads Browser — dành cho khách hàng

Phiên bản áp dụng: 5.8.0 cho Windows 10/11 64-bit.

LHM Ads Browser quản lý nhiều hồ sơ trình duyệt trên máy của bạn: mỗi hồ sơ
có thư mục dữ liệu riêng, proxy riêng và có thể chạy quy trình tự động hóa
do bạn tạo. Mọi dữ liệu nằm trên máy bạn.

---

## 1. Cài đặt

**Cần có:** Windows 10 hoặc 11 bản 64-bit, đã cài Google Chrome hoặc
Microsoft Edge, khoảng 1 GB trống (ứng dụng chiếm ~400 MB, phần còn lại cho
dữ liệu hồ sơ).

1. Tải đúng file bộ cài do bên bán gửi. Bên bán kèm mã **SHA-256** của
   file; nếu muốn kiểm tra, mở PowerShell và chạy
   `Get-FileHash "<đường dẫn file>"` rồi so mã.
2. Chạy bộ cài. **Windows có thể hiện màn hình "Windows đã bảo vệ PC
   của bạn" (SmartScreen)** vì bộ cài chưa ký bằng chứng chỉ Authenticode.
   Nếu file và mã SHA-256 đúng như bên bán gửi: bấm **Thông tin bổ sung**
   → **Vẫn chạy**. Nếu mã không khớp, **không cài** và báo bên bán.
3. Làm theo các bước của bộ cài (có thể đổi thư mục cài). Bộ cài tạo
   biểu tượng **LHM Ads Browser** trên màn hình; mở ứng dụng từ đó.

## 2. Dùng thử và kích hoạt

- Lần đầu mở, ứng dụng cho **dùng thử 10 ngày, tối đa 10 hồ sơ**.
- Để mua/thuê: mở menu **Công cụ → Giấy phép & gia hạn**, bấm
  **Sao chép mã** ở dòng *Mã cài đặt* và gửi mã này cho bên bán.
  Mã cài đặt gắn với **đúng bản cài trên máy này**; cài lại hoặc sang máy
  khác sẽ ra mã khác.
- Bên bán gửi lại **mã license**. Trong màn Giấy phép bấm **Kích hoạt hoặc
  gia hạn**, dán mã vào ô *Nhập mã license có chữ ký số*, bấm
  **Kích hoạt / gia hạn**. Màn hình hiện gói, hạn dùng và số hồ sơ tối đa.
- **Giữ mã license bí mật.** Không đăng lên nhóm chat; mã chỉ dùng được
  với mã cài đặt của bạn.

| Gói | Dùng được |
|---|---|
| Starter | Hồ sơ trình duyệt |
| Pro / Business | Hồ sơ + Local API + tự động hóa (Automation Studio, RPA) |

Số hồ sơ tối đa và thời hạn ghi trên license bên bán cấp cho bạn.

## 3. Gia hạn và khi hết hạn

- Gửi lại **mã cài đặt** cho bên bán trước ngày hết hạn; dán mã license mới
  bằng **Kích hoạt / gia hạn**. Gia hạn sớm được cộng tiếp vào hạn cũ.
- Hạn dùng tính theo **đồng hồ máy tính**. Đừng chỉnh lùi giờ hệ thống —
  ứng dụng phát hiện và cảnh báo.
- **Khi hết hạn:** không mở được phiên trình duyệt mới và không chạy tự
  động hóa, nhưng **dữ liệu vẫn còn**: bạn vẫn xem hồ sơ, sao lưu và xuất
  dữ liệu được. Phiên trình duyệt đang mở không bị đóng đột ngột.

## 4. Dữ liệu của bạn nằm ở đâu

- Dữ liệu ứng dụng (hồ sơ, proxy, quy trình): `%APPDATA%\power-browser`
  (dán vào thanh địa chỉ File Explorer).
- File tải về trong từng hồ sơ: thư mục `Tải xuống\LHM Ads Browser`.
- Mật khẩu proxy và API key được mã hóa bằng cơ chế của Windows, chỉ đọc
  được trên đúng tài khoản Windows đó.
- **Sao lưu:** mục **Sao lưu** tạo file `.lhmbak` mã hóa gồm cấu hình hồ sơ
  và quy trình. File này **không** chứa cookie hay phiên đăng nhập; muốn
  giữ phiên, dùng **Snapshot phiên** trước khi cài lại máy.
- Gỡ cài đặt **không xóa** thư mục dữ liệu trên. Muốn xóa hẳn, tự xóa thư
  mục đó sau khi gỡ. Vẫn nên sao lưu trước khi gỡ hoặc chuyển máy.

## 5. Cập nhật phiên bản

1. Mở menu **Công cụ → Thông tin phần mềm** → tab **Phiên bản & cập nhật**.
2. (Nên làm) bấm **Kiểm tra an toàn nâng cấp**.
3. Bấm **Kiểm tra phiên bản online**. Ứng dụng chỉ kết nối khi bạn bấm,
   không tự tải ngầm, không tự cài.
4. Nếu có bản mới, bấm **Tải bản cập nhật đã xác minh** — ứng dụng chỉ chấp
   nhận file có chữ ký của nhà phát hành và đúng mã SHA-256. Bấm **Mở thư
   mục bộ cài**, đóng ứng dụng rồi chạy bộ cài mới. Dữ liệu và license
   được giữ nguyên.

## 6. Quyền riêng tư

- Ứng dụng không gửi cookie, mật khẩu, lịch sử duyệt web hay dữ liệu hồ sơ
  về máy chủ của bên bán.
- **AI Advisor** chỉ hoạt động khi bạn tự nhập API key OpenRouter của mình;
  câu hỏi bạn gõ được gửi tới OpenRouter. Không dùng thì không gửi gì.
- Kiểm tra phiên bản online sẽ kết nối tới GitHub (lộ địa chỉ IP của bạn
  với GitHub) — chỉ khi bạn bấm.

## 7. Giới hạn cần biết

- Ứng dụng là công cụ quản lý hồ sơ và tự động hóa trên **website bạn có
  quyền**. Không tự động hóa đăng nhập Google, thanh toán hay CAPTCHA, và
  **không** cam kết giúp tài khoản quảng cáo tránh bị nền tảng xét duyệt,
  liên kết hay khóa. Bạn tự tuân thủ điều khoản của Google/Meta và các
  nền tảng khác.
- Kết quả **Kiểm tra hồ sơ** là kiểm tra cấu hình, không phải điểm đánh giá
  của Google Ads.

## 8. Hỗ trợ

Khi cần hỗ trợ, gửi bên bán:
- Phiên bản (Công cụ → Thông tin phần mềm) và mã cài đặt.
- Ảnh chụp màn hình lỗi.
- (Nếu được yêu cầu) **Kiểm tra hồ sơ → Hệ thống & engine → Xuất báo cáo
  hỗ trợ**. Báo cáo không chứa mật khẩu, cookie hay token.

**Không bao giờ** gửi mật khẩu tài khoản, mật khẩu proxy hay cookie cho bất
kỳ ai, kể cả người tự xưng là bên hỗ trợ.
