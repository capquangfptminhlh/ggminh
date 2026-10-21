# INTEGRATION NOTES — Agent 9 (UI và đóng gói)

Dành cho agent điều phối. Mọi thay đổi vào file do điều phối sở hữu
(`package.json`, `main.js`, `preload.js`, workflow) chỉ được *đề xuất* ở đây;
Agent 9 không tự sửa các file đó.

## 1. Hợp đồng nối dữ liệu thật vào Bảng kiểm theo tiêu chí (cho Agent 8 / điều phối)

Khung hiển thị đã có tại `src/ui/criteriaChecklist.js`, mount sẵn trong modal
Kiểm tra cấu hình (`index.html`, mục "Bảng kiểm theo tiêu chí của hồ sơ") và
được `maintenance.js` làm mới mỗi lần mở modal qua
`window.LHMCriteriaChecklist.showForProfile(profileId|null)`.

Để hiển thị trạng thái thật, điều phối/Agent 8 chỉ cần đăng ký **một** provider
trước khi modal mở (ví dụ trong module cảnh báo của Agent 8):

```js
window.LHMCriteriaChecklistProvider = (profileId) => ({
  profileName: '<tên hồ sơ>',
  sample: false,
  entries: [
    { id: 'storage-isolation',        status: 'pass'|'fail'|'unmeasured',
      evidence: '<quan sát thấy gì>', observedAt: '<thời điểm>',
      method: '<cách đo>',           limit: '<giới hạn của kết luận>',
      nextStep: '<bước kiểm tra/xử lý tiếp theo cho người dùng>' },
    // ... các id còn lại; thiếu id nào khung tự hiển thị CHƯA ĐO cho id đó
  ]
});
```

Quy tắc bắt buộc khi cung cấp dữ liệu (theo Mục 16/22 của Hiến pháp):

- `status` chỉ được là `pass` khi phép thử tương ứng **đã chạy** trên đúng
  hồ sơ/phiên đó và có bằng chứng trong `evidence`; lỗi thu thập (timeout,
  thiếu quyền, API không hỗ trợ) phải là `unmeasured` kèm lý do trong
  `evidence`, không được thành `pass`.
- Sáu `id` hợp lệ: `storage-isolation`, `self-consistency`,
  `pinned-identity`, `cross-profile-coincidence`, `network-route`,
  `no-unexpected-drift` (định nghĩa + phạm vi: `LHMCriteriaChecklist.CRITERIA`).
- Provider ném lỗi hoặc trả model sai dạng → khung tự quay về mặc định toàn
  CHƯA ĐO (đã có test). Không có kết luận tổng hợp ở bất kỳ tầng nào.
- Nguồn dữ liệu gợi ý theo tiêu chí: cách ly ← phép thử cách ly của Agent 6;
  nhất quán + khớp danh tính ← kết quả đo runtime của Agent 5 đối chiếu D1
  (Agent 4); trùng tín hiệu + đường mạng ← cảnh báo D3/GraphDefense đã chuẩn
  hóa của Agent 8; trôi ← Health Drift.

Trạng thái hiện tại: **chưa có provider nào được đăng ký** — khung đang hiển
thị toàn CHƯA ĐO, đúng sự thật đo hiện tại của bề mặt UI này. Nút "Xem ví dụ
hiển thị (dữ liệu mẫu)" chỉ trình diễn bố cục ba trạng thái với banner
"DỮ LIỆU MẪU" bắt buộc.

## 2. Đề xuất cho package.json (điều phối quyết)

1. Thêm vào chuỗi `test`: `node --check src/ui/criteriaChecklist.js` (và cân
   nhắc một test UI cho khung, mẫu ở báo cáo của Agent 9 — DOM stub thuần
   Node, không cần dependency mới).
2. Ghim `electron-builder` vào devDependencies thay vì `npx --yes
   electron-builder@25.1.8` trong `build:win`: bản build hiện phụ thuộc mạng/
   cache npx tại thời điểm build, khó tái hiện đúng hồ sơ nghiệm thu (Mục 23).
3. Rà soát glob `files` của electron-builder: tại commit nền, `docs/`,
   phần còn lại của `tools/` (gồm `tools/patches/`, script
   `test-camoufox-*.mjs`, `generate-camoufox-identity.mjs`) và
   `TIEU-CHI-SAN-PHAM.md` **sẽ vào gói cài**. Nếu không có lý do sản phẩm,
   đề xuất loại trừ `tools/**` (trừ `tools/extract-signed-engine.ps1` đã ở
   asarUnpack) và cân nhắc `docs/**`. Quyết định thuộc điều phối/chủ dự án;
   Agent 9 chỉ ghi nhận.

## 3. Đề xuất UI hợp nhất (chưa làm, cần điều phối)

- UI hiện có hai kênh báo lỗi: `alert()` và vùng `role="status"`. Về dài hạn
  nên có một bề mặt lỗi hợp nhất (vùng trạng thái cố định + chi tiết kỹ thuật
  thu gọn) để mọi lỗi đều kèm bước xử lý như Mục 22. Agent 9 đã chuẩn hóa
  nhóm lỗi trần tệ nhất ở Đợt B; việc hợp nhất đụng nhiều module nên để điều
  phối xếp đợt riêng.
- Nhãn "Có thể mở" trong `maintenance.js` (trạng thái health không có issue):
  là nhãn vận hành từ module health (Agent khác sở hữu nguồn dữ liệu). Nếu
  muốn chặt hơn nữa theo Mục 16, đề xuất đổi thành "Chưa phát hiện lỗi cấu
  hình" cho khớp với dòng issue đi kèm. Agent 9 không tự đổi để tránh lệch
  hợp đồng với test của module health.

## 4. Đối chiếu khi build Windows thật (cho Agent 10 / điều phối)

Kỳ vọng từ cấu hình đã đọc (chi tiết: MAPPING.md mục 6):

- Artifact: `dist/LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`; ghi SHA-256
  của artifact vào hồ sơ nghiệm thu (Mục 23).
- Trong gói: `resources/app.asar` (main.js, preload.js, `src/**` — gồm
  `src/ui/criteriaChecklist.js`), `resources/app.asar.unpacked/` chứa
  `src/ops/windowControl.ps1` và `tools/extract-signed-engine.ps1`,
  `resources/lhm-engines/` và `resources/lhm-camoufox/` — tại commit nền cả
  hai chỉ có README.md (engine không đóng gói sẵn; cài qua luồng ký số).
- Kiểm tra sau cài trên máy Windows thật: mở modal Kiểm tra cấu hình → mục
  Bảng kiểm hiển thị đủ 6 tiêu chí CHƯA ĐO; nút dữ liệu mẫu hiện banner mẫu;
  nhãn mức hành vi hiển thị "Chưa vượt ngưỡng"; vòng dashboard ghi "không
  lỗi / cảnh báo cấu hình".
- Điều kiện chạy: CI Windows sau khi được phép push, hoặc máy Windows của
  chủ dự án (cổng 2–3, Mục 12). Tại máy Linux của Agent 9: **NOT_RUN**.
