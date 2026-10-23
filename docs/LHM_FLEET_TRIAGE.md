# LHM Fleet Triage — actionable 1,000-profile configuration health

**Mục tiêu:** phân loại ưu tiên xử lý cả đội profile trong **LHM Control Tower**, hỗ trợ đơn vị vận hành quảng cáo mà không giả nhận biết trạng thái chống gian lận Google/Meta.

## Trải nghiệm thực
Mở **LHM Control Tower → Ưu tiên xử lý toàn bộ hồ sơ → Phân tích lại**.

- Tận dụng kết quả `checkProfile` hiện có, không tự gọi web hay đọc trạng thái nền tảng quảng cáo.
- Phân nhóm **browser engine**, **proxy/kho mật khẩu**, **Signal Chain**, **URL mở mặc định**, **UA/native**, **cấu hình hồ sơ** và **lỗi khác**.
- Mỗi nguyên nhân đếm số profile độc lập, số lỗi/cảnh báo và số đang chạy bị ảnh hưởng.
- Ưu tiên các nguyên nhân **có lỗi bắt buộc** trước, tiếp đến số profile ảnh hưởng. Không đặt giả lập điểm "an toàn quảng cáo".
- Nút **Mở Proxy Center / Kiểm tra engine / Xem Health Check** chuyển người dùng sang đúng công cụ đã tồn tại. Không tự động xóa/chỉnh sửa profile, proxy, fingerprint, cookie, session hay license.
- Bấm **Phân tích lại** để lấy snapshot mới khi chỉnh sửa cấu hình; số liệu không tự lưu hoặc gửi ra bên ngoài.

## Privacy & safety
`buildFleetTriage` chỉ xuất **mã nhóm lỗi cố định**, số đếm và mô tả nhà phát triển.
Không gửi `profileId`, tên/nhóm profile, IP proxy, host/port, URL, token, tên user, ghi chú hay các message lỗi chưa được kiểm soát. Lỗi không nhận diện được gom về danh mục **other**.

`node test/fleet-triage.js` kiểm tra 1.000 profile dữ liệu giả, bảo toàn metadata, ngăn lộ dữ liệu nhạy cảm và kết nối UI, chạy trong Windows `npm test`.

## Bằng chứng Windows
GitHub Actions chụp **màn hình Electron thứ 10** với Fleet Triage đã nạp dữ liệu qua IPC thật (cả app từ nguồn và bản EXE đóng gói).
Quy trình SHA-256 và Draft Release được cập nhật để ràng buộc 10 màn hình, không hạ chuẩn các bài test hiện có.

## Vẫn cần làm để cạnh tranh đầy đủ với AdsPower
Team roles/tenant isolation, đồng bộ đa thiết bị, Synchronizer tương tác thật, benchmark cạnh tranh 100/500/1000 cửa sổ, hỗ trợ khách hàng và nghiệm thu Windows Gate 3/4 **chưa được chứng minh** bởi tính năng này.

Đây là lợi thế **quy trình sửa lỗi theo mức ảnh hưởng**, không phải tuyên bố LHM vượt AdsPower hoặc hoàn thiện thương mại.
