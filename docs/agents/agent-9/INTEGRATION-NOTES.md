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

---

# BỔ SUNG ĐỢT THƯƠNG MẠI HOÁ — Agent 9: cấp dữ liệu cho 4 tiêu chí còn lại

Nhánh `agent-9/checklist-data` (nền `f4d7329`). File đã sửa:
`src/ui/criteriaChecklistProvider.js` (viết lại), `src/ui/criteriaChecklist.js`
(sửa tối thiểu — xem mục 1), test mới `test/criteria-checklist-provider.js`
(16 nhóm, PASS; DOM stub thuần Node, không dependency mới).

## 1. Sửa khung: provider bất đồng bộ chưa từng hiển thị được (lỗi thật)

`showForProfile()` gọi provider **đồng bộ**, nhưng provider đã đăng ký từ
Đợt C là hàm `async` (trả Promise) → `Array.isArray(model.entries)` luôn
sai trên Promise → khung **luôn** rơi về mặc định toàn CHƯA ĐO, kể cả 2
tiêu chí đã có dữ liệu thật. Đã sửa tối thiểu trong `showForProfile()`:
nếu provider trả thenable thì vẽ mặc định trong lúc chờ, vẽ lại khi
Promise settle, bỏ kết quả cũ nếu người dùng đã chuyển hồ sơ, reject thì
giữ mặc định. Provider đồng bộ giữ nguyên hành vi cũ. Nhờ sửa này, ghi
chú trong `maintenance.js` ("hiện chưa có nguồn đo nối vào") đã hết đúng
— điều phối cân nhắc cập nhật câu chữ đó (file của điều phối).

## 2. Ánh xạ no-unexpected-drift (quyết định đã chốt trong code)

- Cảnh báo gắn được cho hồ sơ (trường `observed.profiles` chứa hồ sơ)
  thuộc nguồn `health-drift`, hoặc cảnh báo D3 `ip_changed_mid_session` /
  `egress_unstable` của hồ sơ → **fail** kèm đủ trường bằng chứng Mục 22.
- Nguồn Health Drift hiện phát cảnh báo **gộp toàn đội** (`profiles: []`,
  tỉ lệ lỗi/cảnh báo cấu hình) — không quy được cho từng hồ sơ. Khi nguồn
  `ok` và không có cảnh báo nào gắn được: provider xuất **unmeasured kèm
  lý do**, KHÔNG suy ra pass: Health Drift không đo trôi giá trị lộ ra
  của riêng hồ sơ, và Mục 16 đòi phép thử của chính tiêu chí đã chạy trên
  hồ sơ mới kết luận đạt. Khi có cảnh báo gộp, entry unmeasured trích
  nguyên tóm tắt của cảnh báo đó để người dùng vẫn thấy tín hiệu.
- Nguồn drift `not_measured`/`error` → unmeasured kèm lý do của nguồn;
  lỗi thu thập không bao giờ thành pass/fail (Mục 16).

## 3. Hợp đồng HỒ SƠ ĐO theo hồ sơ (điều phối nối nguồn)

Provider đọc hồ sơ đo qua seam tiêm `window.LHMCriteriaChecklistDataSource`
(test dùng seam này; khi chưa đăng ký, provider quay về `window.api`
hiện tại và 3 tiêu chí stage0 là unmeasured kèm lý do "chưa nối nguồn").

Định dạng bản ghi (một bản ghi cho MỘT hồ sơ):

```json
{ "format": "lhm-profile-measurement", "version": 1,
  "profileId": "<id hồ sơ thật trong ứng dụng>",
  "measuredAt": "<ISO 8601>",
  "appCommit": "<sha commit ứng dụng khi đo>",
  "engine": { "version": "156.0.1-beta.36", "sha256": "<sha256 binary>" },
  "os": "win32|linux|darwin", "environment": "<mô tả môi trường>",
  "tier": "real-engine | installed-exe",
  "method": "<cách đo>",
  "results": {
    "configured": { "status": "measured|error", "reason": "<khi error>",
      "identity":    { "compared": 7, "matched": 7,
                       "mismatches": [{ "field": "timezone", "expected": "...", "observed": "..." }] },
      "consistency": { "checked": 12, "inconsistent": [{ "point": "...", "summary": "..." }] } },
    "isolation": { "status": "measured|error", "reason": "<khi error>",
      "pairedProfileId": "<id hồ sơ còn lại của cặp đo>",
      "conditions": { "baselineClassic": "pass|fail|not_run",
                      "concurrentCrossWrite": "...", "crashRecovery": "...",
                      "crashRecoveryIdleFlush": "...", "httpCache": "...",
                      "faviconCache": "..." } }
  } }
```

Cổng hợp lệ của provider (mọi vi phạm → cả 3 tiêu chí unmeasured kèm lý
do cụ thể): đúng format/version; `profileId` khớp hồ sơ đang xem; tuổi
bản ghi ≤ 30 ngày (`RECORD_MAX_AGE_MS`, hằng số trong provider — chủ dự
án/điều phối có thể siết); `tier` phải là `real-engine` hoặc
`installed-exe` (Mục 23: tầng mô phỏng không làm bằng chứng nghiệm thu);
có `appCommit` và `engine.sha256`; nếu nguồn tiêm cung cấp
`currentContext {appCommit, engineSha256}` của bản đang chạy thì hai
giá trị phải khớp, lệch → unmeasured "đo trên commit/engine khác".

Quy tắc ánh xạ (provider đã cài, test đã khóa):
- `pinned-identity` ← `configured.identity`: pass khi matched == compared
  và compared > 0 và không có mismatches (bằng chứng ghi đúng tỉ lệ, vd
  7/7); lệch → fail liệt kê trường lệch; compared = 0 → unmeasured. Hồ sơ
  **không có** danh tính đã ghim → unmeasured "chưa có danh tính đã ghim"
  bất kể bản ghi (tiêu chí không áp dụng).
- `self-consistency` ← `configured.consistency`: pass khi checked > 0 và
  inconsistent rỗng; có điểm mâu thuẫn → fail; checked = 0 → unmeasured.
- `storage-isolation` ← `isolation.conditions`: bất kỳ điều kiện nào
  `fail` → fail; pass khi `baselineClassic` và `concurrentCrossWrite`
  cùng pass và không có fail — các điều kiện `not_run` được nêu tên trong
  trường Giới hạn (đạt chỉ phủ phần đã chạy, Mục 23); thiếu hai điều kiện
  nền → unmeasured.

**Trách nhiệm của phía ghi bản ghi (điều phối/người nhập):**
- Chỉ tạo bản ghi cho hồ sơ thật khi phép đo **thật sự đo hồ sơ đó**:
  run-config phải chạy với danh tính đã ghim CỦA hồ sơ đó, run-isolation
  phải chạy trên cặp thư mục dữ liệu CỦA hai hồ sơ đó. Cả hai runner
  hiện tại đo hồ sơ **tổng hợp tạm thời** (`stage0_cfg_a/b`) — kết quả
  của chúng KHÔNG được nhập dưới id hồ sơ thật. Muốn có bản ghi thật cần
  một bước đo theo hồ sơ (runner trỏ vào hồ sơ thật hoặc bước nhập có
  kiểm chứng tương đương) — việc này thuộc điều phối/đợt sau.
- Ánh xạ từ báo cáo runner thô: `identity` ← `report.identity.profileX.match`
  (+ `matchAfterRestart`, cộng dồn compared/matched, gộp mismatches từ
  `fields` có `match === false`); `consistency` ← `report.extended`
  (điểm MEASURED mâu thuẫn cấu hình đã khai + `webglMatchX` không đạt);
  `isolation.conditions` ← `report.conditions.*.status` (PASS/FAIL/NOT_RUN
  → pass/fail/not_run) của đúng cặp hồ sơ.
- Nơi lưu đề xuất: một file `measurement-records.json` (mảng bản ghi,
  mode 0o600) trong thư mục storage của ứng dụng, do tiến trình chính
  ghi sau khi phép đo theo hồ sơ hoàn tất; IPC đọc đề xuất
  `get-profile-measurement` (kèm `currentContext` = commit bản dựng +
  hash engine đang cài) qua preload; điều phối đăng ký
  `LHMCriteriaChecklistDataSource` ở tầng renderer **hoặc** mở rộng
  đường mặc định của provider — provider không tự đọc file/IPC ngoài
  hai đường đã có.

## 4. Đề xuất package.json (điều phối quyết)

Thêm `node test/criteria-checklist-provider.js` và
`node --check src/ui/criteriaChecklistProvider.js` vào chuỗi `test`
(cạnh các test UI hiện có). Test chạy không cần node_modules.
