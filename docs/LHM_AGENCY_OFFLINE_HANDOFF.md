# LHM Agency Templates — bàn giao mẫu hồ sơ ngoại tuyến có mã hóa

## Sử dụng thật trong LHM Control Tower
### Người giao
1. Trên danh sách hồ sơ, chọn **1–50 profile**.
2. Vào **Control Tower → Bàn giao mẫu hồ sơ cho nhân viên**, nhập mật khẩu mạnh (12–512 ký tự).
3. Bấm **Xuất hồ sơ đã chọn**, chọn nơi lưu gói `.lhmshare`.
4. Chuyển tệp cho người nhận và gửi mật khẩu **qua kênh khác**.

### Người nhận
1. Mở LHM Control Tower ở máy nhận.
2. Nhập mật khẩu, chọn **Chọn tệp và xem trước**.
3. Phần mềm đọc tệp offline, xác thực GCM rồi chỉ hiển thị số hồ sơ Chromium/Gecko và số hồ sơ cần gán lại proxy.
4. Nhập **lại** mật khẩu, bấm **Xác nhận nhập hồ sơ mới**, xác nhận bằng cửa sổ riêng.
5. Hồ sơ mới có **ID mới, phiên trống, fingerprint native, proxy direct**. Những hồ sơ dùng proxy sẽ bị đánh dấu cần gán lại trước khi mở.

## Kiến trúc & bảo mật
- Gói dùng **AES-256-GCM + scrypt N=16384**, IV và salt tạo ngẫu nhiên, AAD theo định dạng `LHM-AGENCY-TEMPLATES-1` nhằm tách biệt với định dạng backup/khôi phục.
- Chỉ gồm **tên/nhóm/nhãn, engine family và HTTPS origin** (không gồm path, query, fragment, mật khẩu nhúng trong URL), cờ cần gán lại proxy.
- Không chuyển **mật khẩu, proxy host/port, authProxyId, cookie, session, fingerprint blob, Camoufox identity, account tokens, ghi chú, Local API key, license, workflows hoặc profile ID gốc**.
- Gói chỉ được xuất ra file sau thao tác chủ động. Import phải xem trước và xác nhận; tệp mã hóa đã chọn chỉ giữ **trong RAM tối đa 10 phút**; commit one-shot.
- Chặn tệp quá 256 KB, giới hạn 50 profile, xác minh danh sách trường cố định; nhập transactionally vào metadata store bằng clone và **một lần ghi bền vững**. Lỗi validate, license limit hoặc đĩa thất bại không tạo bản nhập dở.
- Không sử dụng mạng. Không gửi thông tin hồ sơ cho server/cloud của LHM.

## Bằng chứng kiểm thử
`test/agency-handoff.js` kiểm thử độ toàn vẹn mã hóa và chống sửa tệp, mật khẩu sai, giới hạn file, bộ lọc danh tính/dữ liệu nhạy cảm, nhập máy khác, ID mới, license limit và rollback. GitHub Actions chụp **11 màn hình Electron thật** gồm Agency Handoff trên bản chạy từ mã nguồn và EXE đóng gói. Release evidence gắn đúng SHA-256 và số lượng ảnh.

## Không đánh đồng với tính năng AdsPower đã có
Đây là **bàn giao mẫu profile offline giữa những người tự trao đổi tệp**. Không phải team cloud sync, không phải phân quyền người dùng hay SSO, không đồng bộ đăng nhập/cookie; người nhận phải tạo phiên mới. Không có bằng chứng từ tính năng này để tuyên bố vượt AdsPower toàn diện hoặc ẩn danh tuyệt đối.

## Phát hành
GitHub CI thành công chỉ chứng minh các kiểm thử tự động. Gate 3 Windows khách thực, Gate 4 owner approval và hạ tầng license/update/commercial vẫn cần xác nhận trước khi phát hành công khai.
