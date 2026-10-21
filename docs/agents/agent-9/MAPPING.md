# MAPPING — Agent 9 (UI và đóng gói) — Đợt A

Cơ sở: clone `ggminh-agents/a9`, branch `agent-9/ui-packaging`, nền commit
`8349f38` (Hiến pháp v1.3, file TIEU-CHI-SAN-PHAM.md 589 dòng, 23 mục — đã đọc
toàn bộ). Mọi nhận định dưới đây là *suy luận từ code đã đọc* tại commit này,
không phải phép đo runtime.

## 1. UI hiện có nằm ở đâu

Toàn bộ renderer nằm trong `src/ui/`: `index.html` (1541 dòng, mọi modal/màn
hình), `renderer.js` (danh sách hồ sơ + biểu mẫu + cảnh báo hành vi),
`dashboard.js` (Mission Control), `maintenance.js` (modal Kiểm tra cấu hình:
health/readiness/engine/isolation/drift), `controlTower.js`, `proxyCenter.js`,
`workflowStudio.js`, `engineSource.js`, `licenseCenter.js` và các module phụ.
Script nạp ở cuối `index.html` theo thứ tự cố định; module theo mẫu IIFE +
`window.LHM*` (ví dụ `window.LHMMaintenance`, `window.LHMMissionControl`).

## 2. Trạng thái hồ sơ / engine hiển thị thế nào

| Bề mặt | Hiển thị hiện tại | Đánh giá |
|---|---|---|
| Bảng hồ sơ (`renderer.js:565-566`) | Cột engine: họ engine + nhãn "Thông số trình duyệt gốc"/"Cấu hình tùy chỉnh"; cột trạng thái: pill "Đang chạy"/"Đã dừng" | Hiển thị *cấu hình đã khai báo* và trạng thái tiến trình — đúng mức, không suy ra chất lượng |
| Dashboard (`dashboard.js`, `index.html:232`) | Vòng % = (tổng − lỗi − cảnh báo)/tổng từ kiểm tra cấu hình; dòng trạng thái ghi rõ "Không đo khả năng Google nhận diện tài khoản" | % là tỉ lệ đếm có cơ sở (Mục 11.1 đạt) nhưng nhãn vòng bị lệch — xem V3 |
| Modal Kiểm tra cấu hình (`maintenance.js`) | Mỗi hồ sơ: "Cần xử lý"/"Cần xem lại"/"Có thể mở" + danh sách vấn đề cấu hình; footnote ghi "Đây chỉ là kiểm tra cấu hình... Không khẳng định vô danh hoặc tránh bị phát hiện" | Đúng kỷ luật; "Có thể mở" là nhãn vận hành, đứng cạnh footnote nên chấp nhận được — ghi nhận là điểm biên, không sửa ngữ nghĩa (thuộc module health của agent khác) |
| Readiness (`maintenance.js`) | "Sẵn sàng"/"Cần xử lý"/"Cần xem lại"/"Chưa triển khai" + `report.note` từ backend | Đúng ba trạng thái vận hành, có nguồn dữ liệu thật |
| Engine diagnostics (`maintenance.js`, `engineSource.js`) | "Đã tìm thấy"/"Chưa cài đặt"/"Cần kiểm tra"; trạng thái ghim SHA-256; trạng thái bản Camoufox ký số kèm giới hạn ("chỉ mở thủ công; không có Playwright hoặc proxy/GeoIP tự động") | Mẫu mực về giới hạn kết luận |
| Cách ly cục bộ (`maintenance.js`) | "Chỉ kiểm tra việc tách thư mục lưu trữ, không kiểm tra danh tính Google" + disclaimer từ backend | Đúng Mục 17.1 |
| Cảnh báo hành vi (`renderer.js`, `index.html:796-806`) | Disclaimer đúng phạm vi Mục 20 ("theo dõi thao tác trong LHM... không biết hệ thống Google đánh giá tài khoản thế nào"), footnote về ngưỡng nội bộ + lưu dữ liệu | Đạt — trừ nhãn mức mặc định, xem V2 |
| Health Drift (`maintenance.js`) | Tỉ lệ lỗi mẫu mới/cũ tính từ **lượt kiểm tra cấu hình của chính LHM**, kèm câu "không phản ánh thuật toán Google" | % có cơ sở đo nội bộ đã nêu — đạt Mục 11.1 |
| Fingerprint tab (`index.html:913-990`) | "Không có tùy chọn nào bảo đảm Google không liên kết các tài khoản"; chế độ tùy chỉnh ghi "thử nghiệm... không chứng minh tính tương thích hoặc ẩn danh"; WebRTC "(không bảo đảm chặn rò rỉ)" | Đạt — đây là các phủ định trung thực, không phải bảo chứng |

## 3. Câu chữ vi phạm / khiếm khuyết tìm thấy

Quét toàn bộ `src/ui` theo danh sách cấm của Mục 11 (bảo chứng an toàn tài
khoản, % không phép đo, tuyệt đối hóa, điểm số): **không tìm thấy** câu chữ
dạng "AN TOÀN để chạy Ads", "100%", "không bao giờ", điểm tin cậy/điểm rủi ro
hiển thị cho người dùng, hay hứa ẩn danh. Văn phong UI hiện tại nhìn chung đã
đúng kỷ luật. Ba khiếm khuyết thật, đã sửa ở Đợt B:

- **V1 — Lỗi trần `alert(error.message)` (7 chỗ):** `renderer.js:238`
  (sao chép API Key), `workflowStudio.js` (xóa quy trình, nạp danh sách hồ sơ
  khi tạo mới, nạp khi mở quy trình, mở Studio, dừng quy trình, duyệt bước),
  `profileTrash.js:61` (làm mới thùng rác). Người dùng chỉ thấy thông điệp
  lỗi thô, không biết thao tác nào thất bại và xử lý tiếp thế nào — trái
  tinh thần Mục 22 (cảnh báo phải có bước xử lý tiếp theo). Các alert lỗi
  còn lại trong UI đều đã có tiền tố "Không thể X:" nên chỉ thiếu bước xử
  lý; nhóm V1 là nhóm không có cả ngữ cảnh.
- **V2 — Nhãn "Bình thường" cho mức cảnh báo hành vi** (`renderer.js:162`,
  giá trị tĩnh `index.html:798`): khi không có cảnh báo vượt ngưỡng, UI kết
  luận "Bình thường". Theo Mục 16/20.2, điều đo được chỉ là "chưa phát hiện
  mẫu vượt ngưỡng trong thao tác LHM quan sát" — "Bình thường" là một kết
  luận toàn cục không có phép đo đứng sau. Đã đổi thành "Chưa vượt ngưỡng".
- **V3 — Nhãn vòng sức khỏe lệch so với số liệu** (`index.html:232`): số
  hiển thị là hồ sơ *không có cả lỗi lẫn cảnh báo* cấu hình, nhãn chỉ ghi
  "không báo lỗi". Đã sửa nhãn thành "không lỗi / cảnh báo cấu hình".

Ghi nhận không sửa: `maintenance.js` nhãn "Có thể mở" (xem mục 2);
`renderer.js` thông báo tạo nhanh "có phiên độc lập" là báo cáo thao tác vừa
thực hiện (mỗi hồ sơ vừa tạo có thư mục phiên riêng) — mô tả thao tác, không
phải bảo chứng nền tảng.

## 4. Lỗi hiển thị ra sao

Hai kênh: `alert()` (đa số thao tác) và vùng `role="status"`/textContent
trong các modal (health, backup, proxy test...). Nhóm thứ hai thường kèm
ngữ cảnh tốt hơn. Không có toast/hệ thống lỗi hợp nhất. Đề xuất hợp nhất
để ở INTEGRATION-NOTES.md (cần điều phối vì đụng nhiều module).

## 5. Bảng kiểm theo tiêu chí (Mục 6/16/22) — phần thiếu lớn nhất

Ứng dụng **chưa có bề mặt hiển thị nào** cho kết luận "sạch" dạng bảng kiểm:
từng tiêu chí của Mục 16 với ba trạng thái ĐẠT / KHÔNG ĐẠT / CHƯA ĐO, bằng
chứng theo sáu câu hỏi của Mục 22, và bước xử lý tiếp theo. Modal Kiểm tra
cấu hình hiện dừng ở kiểm tra cấu hình từng hồ sơ (issue list), không phải
bảng kiểm theo tiêu chí cho một hồ sơ.
→ Đợt B xây khung hiển thị `src/ui/criteriaChecklist.js` + mục mới trong
modal Kiểm tra cấu hình. **Đây là khung hiển thị chờ dữ liệu thật**: mặc
định mọi tiêu chí CHƯA ĐO; dữ liệu đo thật do Agent 8/điều phối nối sau
theo hợp đồng ở INTEGRATION-NOTES.md.

## 6. Đóng gói (chỉ đọc cấu hình — package.json thuộc điều phối)

- Build: script `build:win` = `npx --yes electron-builder@25.1.8 --win nsis
  --x64 --publish never`; Electron `^33.2.1` (devDependency). electron-builder
  **không** nằm trong devDependencies — được npx tải lúc build, nên máy build
  cần mạng hoặc cache npx sẵn.
- `appId`: `vn.lhm.adsbrowser`; `productName`: `LHM Ads Browser`;
  phiên bản `5.8.0`; `artifactName`: `LHM-Ads-Browser-${version}-Preview-Setup-${arch}.ext`
  → tên kỳ vọng: `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`.
- NSIS: `oneClick: false`, cho đổi thư mục cài, tạo shortcut desktop.
- `asar: true`; `asarUnpack`: `src/ops/windowControl.ps1`,
  `tools/extract-signed-engine.ps1`.
- `files`: `**/*` trừ `data/**`, `data_test/**`, `dist/**`, `test/**`,
  log, các tool license-admin/authority/registry/issue/dashboard,
  `tools/sign-bundled-engine.js`, `resources/bundled-engines/**`,
  `resources/camoufox-engine/**`, `stage0-measure/**`.
  Hệ quả cần đối chiếu khi build thật: `docs/`, `tools/` còn lại (gồm
  `tools/patches/`, các script `test-camoufox-*.mjs`,
  `generate-camoufox-identity.mjs`) và file tiêu chí **sẽ nằm trong gói cài**
  theo glob hiện tại — điều phối quyết định có giữ hay loại trừ (đề xuất ở
  INTEGRATION-NOTES.md).
- `extraResources`: `resources/bundled-engines` → `lhm-engines`,
  `resources/camoufox-engine` → `lhm-camoufox`. **Tại commit này cả hai thư
  mục chỉ chứa README.md** — gói cài build từ commit này sẽ không chứa engine
  đóng gói; engine được nạp theo luồng cài có ký số riêng (xem
  `engineSource.js`). Đây là trạng thái kỳ vọng để đối chiếu, không phải lỗi.
- Nội dung gói kỳ vọng khi build thật: `LHM Ads Browser.exe` (Electron
  shell), `resources/app.asar` (main.js, preload.js, src/**, package.json),
  `resources/app.asar.unpacked/` (2 file .ps1 trên), `resources/lhm-engines/`
  (README tại commit này), `resources/lhm-camoufox/` (README tại commit
  này), production node_modules (cors, express, playwright-core) trong asar,
  uninstaller NSIS.

## 7. Tiền kiểm đã chạy trên Linux (máy này)

| Tiền kiểm | Kết quả |
|---|---|
| `node --check` toàn bộ `src/ui/*.js` (baseline, trước sửa) | PASS (không lỗi cú pháp) |
| `node test/dashboard-ui.js` | PASS |
| `node test/workspace-ui.js` | PASS |
| `node test/app-identity.js` | PASS |
| Đọc/parse `package.json` + rà soát cấu hình `build` | PASS (JSON hợp lệ; kết quả ở mục 6) |
| Build NSIS EXE | **NOT_RUN** — máy Linux, không có node_modules; bản thân electron-builder NSIS cho Windows cần chạy trên Windows theo chuỗi cổng Mục 12 (CI Windows sau khi được phép push, hoặc máy Windows của chủ dự án). Không coi thiếu môi trường là đạt |
| Chạy thử EXE / nghiệm thu giao diện thật | **NOT_RUN** — cùng điều kiện trên; thuộc cổng 3 của Mục 12 |
