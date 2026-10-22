# INTEGRATION NOTES — Agent 6 (Cách ly dữ liệu)

Các mục dưới đây nằm ngoài quyền sửa của Agent 6 (file chung do điều phối
sở hữu; Hiến pháp chỉ đổi theo quyết định chủ dự án — Mục 13.3). Đây là
đề xuất để điều phối/chủ dự án áp dụng, không phải thay đổi đã thực hiện.

## 1. package.json (điều phối áp dụng)

- Mở rộng script `stage0:test` thêm:
  `&& node stage0-measure/test-isolation.js && node --check stage0-measure/run-isolation.js && node --check stage0-measure/test-isolation.js && node --check stage0-measure/backup-restore-isolation.js`
- Thêm script mới:
  - `"stage0:isolation": "node stage0-measure/run-isolation.js"`
  - `"stage0:backup-isolation": "node stage0-measure/backup-restore-isolation.js"`
- Chuỗi `test` chính: cân nhắc thêm `node stage0-measure/test-isolation.js`
  và `node stage0-measure/backup-restore-isolation.js` (cả hai đều thuần
  Node, không cần engine, chạy nhanh) để hồi quy cách ly được giữ ở mọi CI.

## 2. CI Windows (điều phối áp dụng cùng cơ chế vá workflow của PR #17)

- Thêm bước chạy `node stage0-measure/run-isolation.js` vào workflow smoke
  Camoufox trên runner Windows (cùng biến môi trường `LHM_CAMOUFOX_*` như
  run.js). Điều kiện crash dùng đường `browser.process()`/taskkill trên
  Windows — cần lần chạy CI đầu tiên để xác nhận; nếu không tìm được tiến
  trình, điều kiện tự báo NOT_RUN kèm lý do thay vì FAIL oan.
- Kết quả Linux của Agent 6 không thay thế lần chạy này (cổng 2, Mục 12).

## 3. Đề xuất cập nhật Hiến pháp (chủ dự án quyết — Agent 6 không tự sửa)

- **Mục 4.5, hàng "Cache Storage + Service Worker":** nên tách hai hàng.
  Service Worker trước v1.3 chưa từng có đầu đo (20 checks cũ chỉ gồm 4
  trường); nay đã có đo cục bộ (Linux, Camoufox 156.0.1-beta.36, qua
  run-isolation: đăng ký SW mang marker riêng từng hồ sơ, đạt ở các điều
  kiện đồng thời/kill/restore). Trạng thái Windows giữ nguyên CHƯA ĐO.
- **Mục 4.5, hàng ETag/cache HTTP:** đề xuất ghi "ĐÃ ĐO cục bộ (Linux):
  phân vùng cache đạt trong điều kiện thử stage0-isolation — Windows
  CHƯA ĐO". Favicon cache tương tự.
- **Mục 17.2:** đề xuất thêm câu về độ bền ghi khi tiến trình bị giết:
  "Phép thử sau sự cố phải ghi rõ cửa sổ flush (thời gian từ lần ghi cuối
  tới khi giết tiến trình). Đo được tại engine Camoufox 156.0.1-beta.36:
  localStorage chỉ bền sau khi engine commit (ghi + reload + giết sau
  1,5 giây → quay về trạng thái commit gần nhất; cùng phép thử với 10
  giây chờ → bền). Cookie, IndexedDB, Cache Storage, đăng ký Service
  Worker bền ở cả hai cửa sổ." Đây là tính chất độ bền ghi của engine,
  không phải rò rỉ chéo: trong mọi lần đo, không dữ liệu nào của hồ sơ
  này xuất hiện ở hồ sơ kia.

## 4. Phát hiện chuyển cho agent khác

- **Cho A3 (vòng đời hồ sơ) / A5 (đo runtime):** Service Worker "biến mất"
  khỏi cả ba slot installing/waiting/active sau khi bị engine cho ngủ vì
  rảnh, trong khi đăng ký vẫn còn trong thư mục hồ sơ — đầu đo nào dựa
  vào worker object sẽ đọc thiếu; nên đo bằng hiệu ứng (fetch do SW trả
  lời) hoặc điều hướng mới. run-isolation.js đã áp dụng cả hai cách.
- **Cho A9/A10:** trên Linux + Xvfb, launch headful mặc định của
  CamoufoxPlaywrightController vượt timeout cứng 30 giây của chính nó
  (máy này); đường headless qua seam tiêm `launchPersistentContext` chạy
  ổn định (~11 giây). Đây là quan sát môi trường Linux, không phải kết
  luận về đường Windows.
- **Cho A2/A3:** controller chỉ nhận executable có basename
  `camoufox.exe`; trên Linux cần shim symlink cùng tên trỏ tới binary
  thật (run-isolation.js tự tạo shim trong thư mục tạm và ghi digest của
  binary thật vào báo cáo).

## 5. NOT_RUN của phạm vi Agent 6 (giữ nguyên trạng, không ai được gộp vào PASS)

- Toàn bộ điều kiện trên Windows/EXE cài đặt: NOT_RUN (chưa có máy
  Windows; cổng 2–3 Mục 12).
- Cách ly của đường Chromium (controller/API của ứng dụng): ngoài phạm
  vi runner này — hiện được giữ bởi test đơn vị `test/isolation.js`,
  `test/launcher-isolation.js` và cơ chế thư mục; chưa có phép đo
  engine-thật tương đương cho Chromium trong stage0-measure.
- HSTS / Alt-Svc cache (Mục 4.5): không thử trong đợt này.
- sessionStorage: không nằm trong danh sách Mục 17.2; không đo.
- Xóa dữ liệu và giới hạn của nó (Mục 17.3): không có phép thử xóa
  trong đợt này.
