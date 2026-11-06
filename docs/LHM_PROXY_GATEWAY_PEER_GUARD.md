# LHM — Proxy gateway chỉ phục vụ trình duyệt của chính hồ sơ

## Vấn đề đã sửa

1. **Chương trình bất kỳ trên máy dùng được proxy có mật khẩu của hồ sơ.** Gateway nội bộ (`authenticatedHttpGateway`, `authenticatedSocksGateway`) nghe trên `127.0.0.1` không mật khẩu, vì Chromium/Firefox không gửi được mật khẩu proxy từ tham số khởi động, rồi chuyển tiếp lên upstream bằng tài khoản proxy của khách. Bất kỳ tiến trình nào kết nối vào cổng đó đều đi ra ngoài bằng proxy của khách, kể cả của người dùng Windows khác trên cùng máy RDP/VPS.
2. **Trình duyệt reset tunnel làm sập app (có từ trước).** Sau sự kiện `connect`, HTTP server của Node bỏ hàm xử lý lỗi của socket. Một `ECONNRESET` từ trình duyệt thành uncaught exception trong tiến trình chính.

## Cơ chế mới

- `src/security/loopbackPeerGuard.js`: với mỗi kết nối vào gateway, tra PID sở hữu socket phía client (`GetExtendedTcpTable`) và chuỗi tiến trình cha (Toolhelp snapshot). Chỉ chấp nhận khi PID gốc của trình duyệt mà app vừa mở nằm trong chuỗi đó (network service của Chromium là con của tiến trình trình duyệt). PID đã xác minh được nhớ lại cho các kết nối sau.
- Một helper PowerShell chạy lâu dài, dùng chung cho cả app: khởi động khoảng 0,8 giây ở lần đầu, mỗi lần tra khoảng 8 ms. Mỗi lần tra có timeout 3 giây.
- **Fail closed trên Windows:** nếu helper không chạy được (ví dụ PowerShell Constrained Language Mode chặn `Add-Type`), app từ chối mở hồ sơ dùng proxy có mật khẩu và báo rõ lý do, thay vì mở proxy cho mọi tiến trình. Lỗi khi tra cứu hoặc không tìm thấy chủ socket thì ngắt kết nối đó.
- Áp dụng cho `BrowserLauncher` (Chromium/Firefox) và Camoufox native. Chỉ bật với tiến trình app spawn thật; test dùng spawner giả thì phải tự truyền `peerGuardFactory`.
- Gateway gắn hàm xử lý lỗi cho socket client, và socket upstream dùng `on('error')` thay cho `once`.
- Cần PR #84 (cờ `--edge-skip-compat-layer-relaunch`): khi Edge tự khởi động lại, trình duyệt thật không còn là con của PID mà app biết, nên guard sẽ chặn đúng trình duyệt của hồ sơ.

## Bằng chứng

- `node test/proxy-peer-guard.js`: mock cho guard, cho cả hai gateway (chặn, cho phép, guard lỗi thì chặn, reset tunnel không crash), launcher, Camoufox proxy plan; thêm một lần tra thật bằng helper trên Windows.
- `npm test`: 300/300 PASS.
- Trình duyệt thật qua `BrowserLauncher`, Windows 11, Chrome 156 và Edge 156, upstream proxy có mật khẩu chạy cục bộ: trang `https://example.com/` tải được qua proxy; một `node.exe` khác kết nối vào cổng gateway bị ngắt và upstream không nhận kết nối nào từ nó.
- Đối chứng code cũ: tiến trình lạ nhận `200 Connection Established` và upstream nhận đúng tài khoản của khách; reset tunnel làm tiến trình thoát với `ECONNRESET`.

## Giới hạn

- Ngoài Windows guard tắt (hành vi giữ nguyên).
- Không bảo vệ trước phần mềm độc hại đã chạy *bên trong* tiến trình trình duyệt, hoặc có quyền đọc bộ nhớ app.
- Cổng CDP (`--remote-debugging-port`, khi bật Local API) vẫn mở cho mọi tiến trình cục bộ và cho đọc được cookie: đây là vấn đề riêng, chưa sửa ở đây.
- `CamoufoxPlaywrightController` (thử nghiệm, đang khóa) chưa gắn guard.
