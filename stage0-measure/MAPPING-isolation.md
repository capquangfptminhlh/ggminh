# MAPPING — Agent 6 (Cách ly dữ liệu) ↔ Hiến pháp v1.3, Mục 17 (+16)

- Nhánh: `agent-6/data-isolation`, commit nền: `8349f38` (Hiến pháp v1.3).
- Phạm vi: đối chiếu Mục 17 với bộ đo `stage0-measure` hiện có và với cơ
  chế thư mục hồ sơ / store / backup của ứng dụng. Mọi khẳng định dưới đây
  thuộc một trong ba mức của Mục 14: *quan sát đo được* (có lần chạy thật),
  *suy luận từ code* (đọc trực tiếp mã nguồn tại commit nền), *chưa đo*.

## 1. Cơ chế hiện có (suy luận từ code tại 8349f38)

| Cơ chế | Vị trí | Sự thật từ code |
|---|---|---|
| Thư mục hồ sơ Camoufox (Playwright) | `src/engine/CamoufoxPlaywrightController.js` | `<root>/camoufox-profiles/<id>`; `assertProfileId` (regex `^[a-zA-Z0-9_-]{1,64}$`), `assertIsolatedProfileDirectory` (bắt buộc nằm trong root), `ensureIsolatedDirectory` (chặn symlink/junction trỏ sang hồ sơ khác — `src/privacy/isolation.js`) |
| Thư mục hồ sơ Camoufox (native) | `src/engine/camoufoxAdapter.js` | Cùng quy ước `camoufox-profiles/<id>` dưới baseDir của ứng dụng |
| Thư mục Chromium / Gecko tay | `src/privacy/isolation.js` (`isolatedPaths`) | `profiles/<id>` (chromium), `gecko-profiles/<id>` (gecko), `extensions/<id>` |
| Store cấu hình | `src/db/store.js` | `db.json` trong baseDir (ghi tmp + rename); hồ sơ là *bản ghi cấu hình* — dữ liệu duyệt web nằm ở thư mục engine, không nằm trong store |
| Backup của ứng dụng | `src/backup/configBackup.js` | **Chỉ cấu hình hồ sơ + workflow**, AES-256-GCM (scrypt, AAD theo format). `excludesSessions: true` là bất biến theo thiết kế: không xuất cookie/session/mật khẩu proxy; `portableProfile` cắt credential reference (hồ sơ proxy có xác thực → `requiresProxySetup: true`, proxy thành `direct`); import tạo **id mới**, tên thêm hậu tố ` (nhập)`, workflow được remap sang id mới; có rollback giao dịch hai file (tự ghi chú: không phải giao dịch chống mất điện giữa hai lần rename) |
| Test backup hiện có | `test/backup-transaction.js` | Bao phủ: inspect, redaction (fill value + authProxyId không lọt vào payload), tiền kiểm tra, rollback khi ghi lỗi. **Chưa** kiểm chứng khía cạnh cách ly: marker cấu hình riêng của từng hồ sơ có lẫn nhau sau import hay không |
| Bộ đo Stage-0 | `stage0-measure/run.js`, `run-config.js`, `core.js`, `test.js` | Hai context Camoufox thật mở đồng thời qua controller của nhánh, origin loopback tự kiểm soát, marker tổng hợp (hex ngẫu nhiên). `run.js` chỉ chạy Windows (`win32` + `camoufox.exe` + digest bắt buộc). 5 điều kiện × 4 loại lưu trữ = 20 checks qua `stageStorageResult` |

## 2. Đối chiếu Mục 17.2 (giao thức thử) — có / thiếu

| Yêu cầu Mục 17.2 | Hiện trạng | Bằng chứng / ghi chú |
|---|---|---|
| Website kiểm thử + dữ liệu tổng hợp do nhóm kiểm soát | **CÓ** | HTTP server loopback trong `run.js`/`run-config.js`; marker là token hex ngẫu nhiên theo lần chạy |
| Ghi marker vào A → B không nhận được | **CÓ (một phần)** | `noAInFreshB`: đúng, nhưng chỉ khi B còn trống và ghi tuần tự A-trước-B-sau |
| Đóng và mở lại — tính bền vững | **CÓ** | `aPersistsAfterRestart`/`bPersistsAfterRestart` qua `controller.stop()` (đóng sạch) rồi launch lại; đã chạy trên CI Windows (20/20) |
| Chạy đồng thời | **MỘT PHẦN** | Hai context thật mở đồng thời, nhưng ghi *không xen kẽ*: A ghi xong mới tới B; không có ghi đồng thời (cùng một thời điểm) và không có vòng ghi chéo thứ hai → **thiếu (a)** |
| Sau khi tiến trình gặp sự cố | **THIẾU** | Mọi lần đóng đều là đóng sạch (`context.close()`); không có kịch bản giết tiến trình engine giữa phiên → **thiếu (b)** |
| Cookie | **CÓ** | Trong 4 trường `FIELDS` của `core.js` |
| localStorage | **CÓ** | nt |
| IndexedDB | **CÓ** | nt |
| Cache Storage | **CÓ** | nt |
| Service Worker | **THIẾU ĐẦU ĐO** | Mục 4.5 gộp hàng "Cache Storage + Service Worker — ĐẠT (20/20)", nhưng probe `readValues` không hề kiểm tra đăng ký Service Worker; 20 checks là 4 trường × 5 điều kiện, không có SW. Cần đầu đo riêng: đăng ký SW mang marker của A, B không có đăng ký đó → bổ sung ở (a)/(b)/(c) |
| HTTP cache | **THIẾU** | Mục 4.5 ghi CHƯA ĐO; server loopback hiện tại trả `Cache-Control: no-store` nên về nguyên tắc không đo được cache → cần endpoint có ETag/max-age và đếm hit phía server → **(d)** |
| Favicon cache (F-Cache) | **THIẾU** | Mục 4.5 ghi CHƯA ĐO; cần trang có `<link rel="icon">` + đếm request favicon phía server; trình duyệt headless có thể không hề fetch favicon → có điều kiện NOT_RUN hợp lệ → **(d)** |
| Backup → restore | **THIẾU ở cả hai tầng** | (i) Tầng cấu hình: ConfigBackup chưa có test cách ly sau restore (xem §1). (ii) Tầng dữ liệu duyệt web: ứng dụng *không có* tính năng backup dữ liệu duyệt web (theo thiết kế ở trên) → phép thử tương ứng ở tầng Stage-0 là chụp/thay thư mục hồ sơ rồi mở lại → **(c)** |
| Không thu thập cookie đăng nhập thật | **TUÂN THỦ** | Toàn bộ phép đo chỉ dùng marker tổng hợp trên origin loopback |

## 3. Mục 17.1 và 17.3 — trạng thái

- **17.1 (cách ly ≠ khác biệt fingerprint):** đã có bằng chứng thực nghiệm
  ủng hộ: trên CI Windows, hai hồ sơ Camoufox lộ giá trị môi trường *giống
  hệt nhau* (`equalAcrossProfiles: true` trong báo cáo run.js) nhưng cách
  ly lưu trữ vẫn PASS 20/20 — tức cách ly đạt được không nhờ fingerprint
  khác nhau. Các phép thử Đợt B tiếp tục không dùng fingerprint làm bằng
  chứng cách ly.
- **17.3 (giới hạn của xóa dữ liệu):** README của stage0-measure đã mang
  caveat tương ứng ("Isolation at a local origin does not prove websites
  cannot associate profiles"). Không có phép thử xóa trong đợt này (ngoài
  phạm vi được giao); không tuyên bố gì thêm về respawn qua cache — phép
  thử HTTP cache ở (d) chỉ kết luận về *phân vùng cache giữa hai hồ sơ
  trong điều kiện thử*, không kết luận về khôi phục định danh.

## 4. Mục 16 (định nghĩa "sạch") — phần liên quan Agent 6

Tiêu chí "dữ liệu giữa các hồ sơ được cách ly trong các phép thử đã thực
hiện" là tiêu chí duy nhất của Mục 16 thuộc phạm vi Agent 6. Trạng thái
sau Đợt B phải báo theo từng điều kiện thử (PASS / FAIL / NOT_RUN + lý do),
không gộp kết quả 20/20 cũ (điều kiện thường, đóng sạch, ghi tuần tự) làm
bằng chứng cho các điều kiện mới (đồng thời, kill, restore, cache).

## 5. Công việc Đợt B (từ bảng thiếu ở §2)

| # | Điều kiện thử mới | File |
|---|---|---|
| (a) | Hai hồ sơ mở đồng thời, ghi đồng thời + ghi chéo xen kẽ 2 vòng, 5 loại lưu trữ (thêm Service Worker) | `core.js` (builder mới), `run-isolation.js`, `test-isolation.js` |
| (b) | Giết tiến trình engine của A giữa phiên → mở lại: marker của A còn nguyên, B không đổi và không thấy dữ liệu A, hồ sơ A còn hoạt động (ghi/đọc tiếp được) | `core.js`, `run-isolation.js`, `test-isolation.js` |
| (c1) | ConfigBackup export → import (store trống và store gốc): bản sao của mỗi hồ sơ giữ đúng marker cấu hình của chính nó, id mới phân biệt, workflow remap đúng hồ sơ, payload không chứa trường phiên/cookie | `backup-restore-isolation.js` |
| (c2) | Chụp thư mục hồ sơ A → ghi tiếp ngoài snapshot → xóa thư mục → khôi phục từ snapshot → mở lại: dữ liệu = trạng thái snapshot, không có dữ liệu sau snapshot, không có marker của B; B nguyên vẹn | `core.js`, `run-isolation.js`, `test-isolation.js` |
| (d) | HTTP cache phân vùng (ETag + đếm hit server) và favicon cache (đếm request favicon) qua máy chủ kiểm soát | `core.js`, `run-isolation.js`, `test-isolation.js` |

## 6. Điều kiện môi trường của lần chạy Đợt B

- Máy này (Linux): engine thật Camoufox **156.0.1-beta.36** (bản Linux tại
  `~/tmp-big/cfx-build`) chạy qua đúng `CamoufoxPlaywrightController` của
  nhánh, dùng seam tiêm `launchPersistentContext` để headless + timeout dài
  hơn (bản headful dưới Xvfb vượt timeout 30 giây cứng trong controller
  trên máy này — quan sát đo được, ghi trong báo cáo chạy). Digest SHA-256
  của binary được ghi vào báo cáo theo Mục 23.
- Windows / EXE cài đặt: **NOT_RUN** — không có máy Windows trong đợt này;
  `run.js`/`run-config.js` chặn `win32` theo thiết kế và là đường nghiệm
  thu Windows riêng (cổng 2–3, Mục 12), không thay thế bằng kết quả Linux.
