# Import hồ sơ AdsPower JSON vào LHM (chỉ metadata)

## Mục đích

Hỗ trợ chuyển **mô tả hồ sơ** do người dùng sở hữu từ danh sách JSON
(AdsPower profile-list export/API response) sang hồ sơ LHM hoàn toàn mới,
không sao chép mã nguồn, browser engine, extension hay dữ liệu phiên của AdsPower.

Định dạng đầu vào: mảng JSON các hồ sơ hoặc `{"data":{"list":[...]}}`.
Tên trường hỗ trợ là tập con tên trường do AdsPower công bố tại tài liệu Local API.

Ví dụ **dữ liệu giả lập, không có thông tin đăng nhập**:

```json
{
  "data": {
    "list": [
      {
        "name": "Agency A",
        "group_name": "Khách A",
        "open_urls": ["https://example.com/"],
        "profile_tag_names": ["Marketing"]
      }
    ]
  }
}
```

Mở **Hồ sơ trình duyệt → Nhập CSV → chọn JSON**; bấm **Kiểm tra & xem trước**,
sau đó xác nhận nhập. Tối đa 200 hồ sơ, 256 KB. CSV hiện có không thay đổi.

## Chính sách chuyển dữ liệu

Chỉ lấy: `name`, `group_name`, `open_urls` (hoặc `tabs`) và
`profile_tag_names` (hoặc `tags` khi chứa chuỗi).

Không chuyển: ID AdsPower, cookies, tài khoản nền tảng, mật khẩu, token,
ghi chú, thông số fingerprint, proxy host/port, proxy credentials, browser
session hoặc extension. Hồ sơ mới dùng Chromium và fingerprint gốc,
không phải bản sao của môi trường AdsPower.

**Mọi hồ sơ nhập từ AdsPower JSON được đặt `requiresProxySetup=true`:**
không thể mở trước khi người dùng thiết lập lại proxy có chủ đích.
Điều này tránh việc một cấu hình proxy không được chuyển khiến hồ sơ
vô tình hoạt động với IP mạng trực tiếp. Chỉ cần gán lại proxy an toàn
trong Proxy Center (hoặc chỉnh hồ sơ theo luồng có xác nhận).

Tệp JSON nhạy cảm chỉ được xử lý trên máy qua Electron IPC,
không được gửi tới máy chủ. Người dùng nên tránh nhập tệp chứa
thông tin đăng nhập dù trình nhập chủ động bỏ qua các trường đó.

## Phạm vi kiểm thử

`node test/adspower-json-import.js`

Bao gồm: xem trước không ghi dữ liệu, trường bí mật không rò vào DB,
không chuyển phiên/fingerprint, chặn mở khi chưa cấu hình proxy,
kiểm tra URL và kích thước, atomic rollback nếu ghi thất bại và
không hồi quy luồng CSV cũ.

Đây là **khả năng chuyển metadata**, không phải sao lưu/khôi phục
profile AdsPower hay chứng nhận tương thích đầy đủ mọi phiên bản
và biến thể xuất tệp của AdsPower.
