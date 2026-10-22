# INTEGRATION NOTES — Agent 12: kiểm tra cập nhật có ký (nguyên mẫu)

Sản phẩm của agent này (đều là file mới, không sửa file chung):

- `docs/agents/agent-12/UPDATE-DESIGN.md` — thiết kế manifest +
  kỷ luật fail-closed.
- `src/update/updateCheck.js` — module kiểm tra thuần
  (`checkForUpdate`) + bản từ xa chỉ-đọc-manifest
  (`checkForUpdateRemote`). Không tải artifact, không ghi đĩa,
  không tự áp dụng cập nhật.
- `test/update-check.js` — 16 nhóm test, khóa Ed25519 THỬ sinh
  trong tiến trình khi chạy test (không file khóa nào trên đĩa).

## Điểm nối đề xuất cho điều phối (main.js / preload.js / UI)

1. **Nguồn public key**: nạp public key publisher từ file neo tin
   cậy trong resources — cùng cơ chế `loadCamoufoxPublisherKey`
   (`src/engine/camoufoxPublisherTrust.js`) nhưng là neo riêng cho
   ứng dụng, vd `update-publisher-ed25519.pub`; truyền vào
   `checkForUpdate({publicKey, licenseKey: LICENSE_PUBLIC_KEY})` để
   module tự từ chối nếu khóa publisher trùng khóa license (Mục 8).
2. **Phiên bản hiện tại**: `app.getVersion()` (đọc từ package.json —
   nguồn phiên bản duy nhất đã xác minh ở đợt này).
3. **IPC** (mẫu lazy-pull như `get-warning-report` đợt trước):
   `ipcMain.handle('check-for-update', () => checkForUpdateRemote({url: UPDATE_MANIFEST_URL, currentVersion: app.getVersion(), publicKey: updatePublisherKey, channel: UPDATE_CHANNEL}))`,
   preload thêm `checkForUpdate: () => ipcRenderer.invoke('check-for-update')`.
   `UPDATE_MANIFEST_URL`/`UPDATE_CHANNEL` là hằng số đóng gói —
   đặt ở nơi điều phối chọn, không để người dùng sửa qua settings
   (một URL manifest do người dùng đổi được sẽ phá gốc tin cậy về
   kênh, dù chữ ký vẫn bảo vệ nội dung).
4. **Hiển thị**: một dòng trạng thái trung tính trong màn hình
   Giới thiệu/Cài đặt: "Bản hiện tại x.y.z — đã kiểm tra lúc …:
   đang là bản mới nhất / có bản a.b.c (dung lượng …, SHA-256 …)".
   Trạng thái `invalid`/`unreachable` hiển thị cùng một câu trung
   tính "chưa kiểm tra được cập nhật" kèm chi tiết `reason` chỉ vào
   log hỗ trợ — không hiển thị cảnh báo đỏ cho người dùng (xem mục
   6 của UPDATE-DESIGN).
5. **Chuỗi test**: thêm `node test/update-check.js` +
   `node --check src/update/updateCheck.js` vào chuỗi `npm test`
   trong package.json (file chung — điều phối thực hiện).

## Quyết định còn chờ chủ dự án

- **D1 — Khi nào kiểm tra**: khuyến nghị của Agent 12 là *thủ công*
  (người dùng bấm trong Cài đặt/Giới thiệu) cho bản thương mại đầu
  tiên: khớp kỷ luật "không tải ngầm" của sản phẩm và không phát
  sinh lưu lượng mạng ngoài ý muốn của người dùng. Kiểm tra tự
  động lúc khởi động (hoặc định kỳ) là lựa chọn khác, cần chủ dự
  án duyệt riêng kèm quyết định về tần suất.
- **D2 — Kênh phân phối manifest**: GitHub Releases (mặc định của
  nguyên mẫu, cùng chính sách allowlist với engine) hay CDN/tĩnh
  của chủ dự án (khi đó bổ sung host vào `allowedHosts` lúc tích
  hợp).
- **D3 — Khóa ký cập nhật**: dùng chung khóa publisher với engine
  (miền ký đã tách: `LHM_APP_UPDATE_V1` vs
  `LHM_BROWSER_ENGINE_BUNDLE_V1`, chữ ký không dùng chéo được) hay
  một khóa publisher thứ hai chỉ cho cập nhật ứng dụng. Liên hệ
  QD-02 (khóa publisher cho engine): nếu QD-02 chốt một khóa
  publisher độc lập cho cả hai engine, phương án tiết kiệm nhất là
  khóa đó ký luôn manifest cập nhật; tách khóa thứ hai giảm bán
  kính khi lộ khóa nhưng tăng một buổi lễ khóa nữa vào quy trình
  phát hành (runbook Agent 13).
- **D4 — Luồng áp dụng** (ngoài phạm vi nguyên mẫu): khi có
  `update-available`, ứng dụng chỉ *thông báo* hay có nút tải bộ
  cài (qua `downloadPinned` ghim hash/kích thước) để người dùng tự
  chạy? Tự tải + tự cài âm thầm bị loại theo kỷ luật sản phẩm;
  quyết định còn lại là "thông báo + liên kết" hay "tải khi người
  dùng bấm".

## NOT_RUN / giới hạn

- Chưa có công cụ ký phía phát hành (`tools/sign-app-update.js`) —
  chủ ý để lại bước sau cùng thiết kế này; phía kiểm chứng đã xuất
  `signedUpdatePayload`/`canonicalUpdateManifest` để công cụ đó
  dùng chung, tránh hai nơi định nghĩa payload.
- Chưa kiểm chứng trên EXE đóng gói/Windows (cổng 3) — module là
  Node thuần, không phụ thuộc Electron; test chạy trên Linux/Node
  24 tại commit nền `f4d7329`.
- Chưa có khóa publisher production cho cập nhật (chờ D3 + buổi lễ
  khóa của chủ dự án); mọi test dùng khóa thử tự sinh.
