# LHM Launch Readiness — Kiểm tra 4 lớp trước khi mở profile

**Phạm vi:** kiểm tra cục bộ, không xâm nhập, không thay đổi fingerprint,
cookie hay proxy. Không có kết quả nào bảo đảm vượt qua hệ thống kiểm tra
của Google/Meta, ẩn danh 100% hoặc được coi là một người dùng mới.

## Các lớp và mức bằng chứng

| Lớp | LHM kiểm tra trước khi mở | LHM chưa thể chứng minh ở cổng này |
| --- | --- | --- |
| Mạng | Loại proxy, cú pháp, tham chiếu Proxy Center và tình trạng vault | IP thoát thật, ISP/ASN/blacklist, DNS resolver, WebRTC/ICE, TCP/TLS/JA3/JA4 |
| Storage | Cổng cấu hình không sao chép dữ liệu phiên theo luồng hiện tại | Cookie, LocalStorage, IndexedDB, Cache API, Service Workers, HSTS sau khởi chạy hoặc dữ liệu server |
| Fingerprint | Signal Chain: OS/UA/platform/Client Hints, kích thước màn hình, ngôn ngữ, múi giờ, GPU khai báo | Fingerprint thật do website đọc, tính đồng nhất TLS/OS, kết luận antifraud |
| Hành vi | Không tự chạy các thao tác mô phỏng người dùng | Hệ thống định danh phía server, đồ thị tài khoản, đánh giá Google/Meta |

LHM hiển thị **CẦN SỬA**, **CHƯA XÁC MINH**, hoặc
**ĐÃ KIỂM TRA CẤU HÌNH** theo đúng phạm vi phép đo. Không chuyển
thành phần trăm khả năng vượt hệ thống.

## Luồng dùng

1. Trong danh sách profile, bấm Mở. LHM kiểm tra cục bộ và hiển thị
   bốn lớp bằng giao diện có thể kiểm toán; người dùng cần bấm xác nhận.
2. Lỗi cấu hình (proxy/vault/URL/fingerprint khai báo mâu thuẫn) phải
   sửa trước khi mở. Nút Mở bị khóa; engine cũng kiểm tra độc lập.
3. Các điều kiện chưa đo (DNS/WebRTC, mạng thực, tín hiệu phía server)
   luôn hiển thị cảnh báo, không ngầm tuyên bố đạt.
4. Mở nhiều profile qua Control Tower sẽ kiểm tra tất cả trước khi mở;
   nếu bất kỳ profile nào có lỗi bắt buộc sẽ chặn toàn bộ thao tác và
   yêu cầu sửa cấu hình. Cảnh báo phải được xác nhận.

## Quyền riêng tư và an toàn

- Offline preflight không gửi request tới Google/Meta hay các trang
  đo fingerprint. Không lưu raw fingerprint/secret trong bản báo cáo.
- Không tự khởi tạo danh tính, thay đổi người dùng, giả lập chuột/gõ phím,
  xóa lịch sử khách hàng hoặc vượt qua xác minh nền tảng.
- Mọi đường mở sử dụng `BrowserLauncher` đều chặn lỗi cấu hình trước
  khi tạo tiến trình. Các cửa sổ đang mở không bị khởi động lại.
- Đo DNS/WebRTC thực cần một phiên kiểm thử *sau* khi engine chạy,
  endpoint và quyền rõ ràng, không thể chứng minh chỉ từ metadata.
- Công cụ kiểm tra bên thứ ba (Pixelscan, BrowserLeaks, CreepJS) là
  tham chiếu tùy chọn, **không** quyết định trạng thái "an toàn tài khoản"
  hay phép đo thay cho LHM.

## Bảo toàn sản phẩm

Tính năng này là bổ sung cạnh Signal Chain, GraphDefense, Proxy Vault,
AI Advisor, RPA, license và quản lý profile, không xóa bất kỳ tính năng
độc quyền LHM. `test/launch-readiness.js` và
`test/lhm-feature-preservation.js` chạy cùng `npm test` trên CI Windows.
Kiểm thử đóng gói và Gate 3 trên máy khách vẫn là yêu cầu phát hành.
