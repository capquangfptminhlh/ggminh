# LHM — Cổng tự động hoá (CDP) tắt mặc định

## Vấn đề

Khi bật Local API, mọi hồ sơ Chromium mở ra đều kèm `--remote-debugging-port` trên `127.0.0.1`. Cổng DevTools của Chrome/Edge không có xác thực: bất kỳ tiến trình nào trên máy, kể cả của tài khoản Windows khác trên cùng máy RDP/VPS, đều kết nối được và đọc toàn bộ cookie, phiên đăng nhập của hồ sơ đang mở. Chrome không có cách giới hạn ai được kết nối.

## Thay đổi

- Tuỳ chọn mới `cdpEnabled` (mặc định tắt), nút **Tự động hoá (CDP)** trong menu Công cụ, chỉ hiện khi Local API bật. Bật phải xác nhận qua hộp thoại cảnh báo rủi ro.
- Cổng CDP chỉ mở khi **cả** Local API **và** Tự động hoá (CDP) đều bật (`src/security/cdpPolicy.js`). Chỉ bật Local API, hoặc duyệt web thủ công, không còn mở cổng.
- `GET /api/v1/browser/start`: khi CDP tắt trả HTTP 409 (`data.cdp = "disabled"`) và **không** mở trình duyệt; hồ sơ đã mở từ trước khi bật CDP trả 409 (`data.cdp = "unavailable"`).
- "Mở URL trong hồ sơ đang chạy" (dùng `/json/new`) báo rõ lý do khi CDP tắt.
- Tắt CDP chỉ áp dụng cho hồ sơ mở sau đó; hồ sơ đang mở giữ cổng tới khi đóng.

## Ảnh hưởng tới khách đang dùng

Khách đã bật Local API và dùng Puppeteer/Selenium/Playwright cần bật thêm **Tự động hoá (CDP)** một lần sau khi cập nhật. API trả 409 kèm hướng dẫn thay vì trả `ws` rỗng.

## Bằng chứng

- `node test/cdp-default-off.js`: chính sách, launcher (không có `--remote-debugging-*` khi chưa opt-in), Local API (409, không khởi chạy), mở URL hàng loạt.
- `npm test`: 297/297 PASS.
- Chrome 156 thật qua `BrowserLauncher`, Local API bật: CDP tắt → cây tiến trình Chrome không có socket LISTENING nào; CDP bật → `127.0.0.1:<port>` LISTENING, `/json/version` trả 200.

## Giới hạn

Khi đã bật Tự động hoá (CDP), cổng vẫn không có xác thực như trước. Thay đổi này chỉ thu hẹp phạm vi lộ (mặc định tắt, có cảnh báo), không thêm xác thực cho cổng.
