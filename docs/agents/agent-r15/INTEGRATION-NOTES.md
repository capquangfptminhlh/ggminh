# INTEGRATION NOTES — Agent R15 (hồ sơ đo theo hồ sơ / measurement records)

Nhánh `agent-r15/measurement-records`, nền `f280296`, commit chính
`03a50d2`. Đây là phần việc Agent 9 đã đặc tả nhưng chưa kịp làm
(mục 3 của `docs/agents/agent-9/INTEGRATION-NOTES.md`): phía GHI hồ
sơ đo — store + IPC kèm currentContext + runner đo theo hồ sơ thật.
Phía ĐỌC (provider + cổng hợp lệ Mục 23) đã có từ Agent 9 và không
thay đổi logic; R15 chỉ nối đường dữ liệu mặc định vào IPC mới.

## 1. Đã làm

| Thành phần | File | Nội dung |
|---|---|---|
| Store | `src/measurement/measurementRecords.js` | `MeasurementRecordStore` cho `measurement-records.json` trong thư mục storage: ghi nguyên tử tmp+rename mode 0600; file hỏng → giữ bản `.corrupt-<timestamp>` và BÁO qua `status()` (kèm số entry bị loại vì sai dạng) — cùng chính sách với exit-IP store đã sửa; MỘT bản ghi mới nhất cho mỗi hồ sơ; KHÔNG cắt theo tuổi (bản ghi hết hạn phải tới được cổng hợp lệ để bảng kiểm nêu đúng lý do "quá hạn 30 ngày"). `validateMeasurementRecord()` kiểm DẠNG hợp đồng v1 (format/version, profileId, measuredAt, appCommit, engine.sha256 dạng hex, os/tier/method, hai khối results và các trường con); `assembleRecord()` cho phía ghi. Việc ép BUỘC RÀNG (tuổi ≤30 ngày, tier được chấp nhận, khớp commit/engine hiện tại) vẫn nằm ở cổng của provider — một điểm ép buộc duy nhất cho cả bản ghi từ store lẫn từ seam tiêm. |
| Current context | `src/measurement/currentContext.js` | `createCurrentContextResolver({appRoot, env, resolveEngineExecutable})` → `{appCommit, engineSha256}`: commit lấy theo thứ tự env `LHM_APP_COMMIT` → `build-info.json` cạnh app root → `git rev-parse HEAD` (chỉ dev/lab); hash engine = SHA-256 của executable mà resolver đã kiểm chứng trỏ tới, ghi nhớ theo (path, size, mtime). Mọi lỗi → `null`, không bao giờ ném (context không rõ thì cổng bỏ qua phép đối chiếu đó, không làm hỏng bảng kiểm). |
| IPC | `main.js`, `preload.js` | Handler `get-profile-measurement(profileId)` → `{record, currentContext, storeStatus}`; store khởi tạo trong `whenReady` cạnh `ipObservationStore` (load error/invalid-drop được `console.warn` như warning-history); resolver lười (chỉ tra cứu khi IPC gọi, sau khi `camoufoxExecutableResolver` đã gán). Preload thêm `getProfileMeasurement`. |
| Provider | `src/ui/criteriaChecklistProvider.js` | Đường mặc định (không có seam tiêm): sau `getProfiles`/`getWarningReport`, provider gọi `window.api.getProfileMeasurement(profileId)` khi method tồn tại → `measurementRecord` + `currentContext` + `recordSourceWired=true`; preload cũ không có method → giữ nguyên lý do "chưa nối nguồn". Đã cập nhật comment đầu file. |
| Runner | `tools/measure-profile.js` | Đo hồ sơ THẬT: nạp hồ sơ từ Store của ứng dụng trong `--storage-dir`, chạy qua chính `CamoufoxPlaywrightController` của ứng dụng trên thư mục dữ liệu thật (`camoufox-profiles/<id>`). `configured` = giá trị lộ ra đối chiếu kỳ vọng trong blob danh tính đã ghim của CHÍNH hồ sơ (2 phiên: mở mới + mở lại, cộng dồn compared/matched, gộp mismatches — đúng ánh xạ Agent 9) + 4–5 điểm nhất quán nội bộ (languages/Intl locale/platform↔UA/dạng timezone/WebGL khi so được). `isolation` = giao thức marker tổng hợp stage0 trên CẶP thư mục dữ liệu thật: `baselineClassic`, `concurrentCrossWrite`, `httpCache`, `faviconCache` chạy thật; `crashRecovery`/`crashRecoveryIdleFlush` = `not_run` (chưa port pha giết tiến trình). Pha lỗi → block `error` kèm lý do (không bao giờ thành pass — Mục 16); điều kiện chạy mà vi phạm → `fail`. Ghi bản ghi qua chính store trên. CLI: `--storage-dir --profile --pair --engine [--engine-sha256] [--app-commit] [--headless|--headful]`; exit 0 sạch / 1 có phát hiện hoặc lỗi đo / 2 NOT_RUN (thiếu điều kiện tiên quyết — không ghi bản ghi). Chạy khi ứng dụng desktop ĐÃ ĐÓNG. |

## 2. Bằng chứng đã chạy (Linux, máy lab này)

Môi trường: Linux x86_64, Node v24.20.0, engine Camoufox
156.0.1-beta.36 (`~/tmp-big/cfx-build/camoufox-bin`, SHA-256
`2a2cb03f6ca4cfa96cdb9d0991b52f4dc02d7f097d3253d355f6a6361ce28669`),
headless qua seam tiêm của controller. Phạm vi: CHỈ Linux/lab —
không phải nghiệm thu Windows/bản EXE đã cài (Gate 3).

- `test/measurement-records.js` — 9 nhóm PASS (validation từng vi
  phạm kèm lý do; mode 0600; thay bản ghi theo hồ sơ; không cắt
  theo tuổi; corrupt được giữ + báo; entry sai dạng bị đếm;
  helper gộp danh tính + nhất quán).
- `test/measurement-current-context.js` — 6 nhóm PASS.
- `test/measurement-checklist-flip.js` — 11 nhóm PASS: lật trạng
  thái qua provider với store thật (CHƯA ĐO → PASS ×3 kèm bằng
  chứng "12/12"-dạng tỉ lệ, giới hạn nêu tên điều kiện not_run),
  đường api mặc định có/không method, và ma trận từ chối đầy đủ
  của cổng (sai hồ sơ / quá 30 ngày / tier mô phỏng / thiếu commit
  / thiếu hash engine / sai format / lệch commit / lệch engine /
  bản ghi không phải object / block error) — mỗi trường hợp cả 3
  tiêu chí đều CHƯA ĐO kèm ĐÚNG lý do cụ thể.
- `test/measurement-records-e2e.js` — **PASS trọn** (17/17 kiểm):
  tạo 2 hồ sơ thật qua Store → cấp danh tính ghim bằng generator
  chính thức (cả hai `provisioned`) → trước đo: 3 tiêu chí CHƯA ĐO
  → `measureProfile()` chạy thật → bản ghi hợp lệ, gắn commit
  `03a50d2` + đúng hash engine, file 0600 → configured: identity
  **12/12** (6 trường có kỳ vọng × 2 phiên), consistency checked=4,
  inconsistent=0 → isolation: baseline/concurrent/httpCache/
  faviconCache **pass**, crash×2 `not_run` → sau đo: cả 3 tiêu chí
  của hồ sơ đích lật sang **PASS có bằng chứng**; hồ sơ cặp (không
  có bản ghi riêng) vẫn CHƯA ĐO.
- Test provider của Agent 9 (`test/criteria-checklist-provider.js`)
  vẫn PASS sau thay đổi đường mặc định. Chuỗi test đầy đủ: xem mục 4.

Hai lỗi gặp trên đường (đã xử lý, ghi lại để điều phối biết):
1. Controller tự điều hướng tới `profile.startUrl` khi launch và
   launch THẤT BẠI nếu điều hướng lỗi (hồ sơ thật mặc định trỏ
   `https://ads.google.com/` — không tới được từ sandbox này).
   Runner xử lý đúng bản chất phép đo: luôn truyền `url` = origin
   probe loopback khi launch (tham số `url` thắng `startUrl`),
   nên phép đo không phụ thuộc trang khởi động của hồ sơ hay mạng
   ngoài. Đây là hành vi fail-closed đúng của controller, không sửa.
2. `src/db/store.js` export trực tiếp class (`module.exports =
   Store`), không phải named export — bản nháp đầu của runner/e2e
   destructure `{Store}` nên undefined; đã sửa cả hai file.

## 3. Giới hạn còn lại (trung thực)

- `crashRecovery`/`crashRecoveryIdleFlush` chưa chạy trong runner
  này (cần port pha giết tiến trình engine từ
  `stage0-measure/run-isolation.js`); bản ghi ghi `not_run` và
  bảng kiểm nêu tên chúng trong trường Giới hạn, đúng Mục 23.
- Điểm nhất quán hiện là tập kiểm giới hạn (4–5 điểm nêu trên);
  mở rộng dần theo đầu đo, không suy diễn thêm.
- Bản ghi do runner bên ngoài ghi trong lúc ứng dụng ĐANG chạy sẽ
  chưa hiện cho tới lần khởi động sau (store của tiến trình chính
  nạp lúc `whenReady`). Chạy runner khi ứng dụng đã đóng là quy
  trình dự kiến; nếu sau này cần nóng, thêm `reload()` cho store
  và gọi trong handler IPC.
- `appCommit` của bản dựng đóng gói: hiện env `LHM_APP_COMMIT`
  hoặc `build-info.json` là hai đường nạp; quy trình phát hành
  nên ghi `build-info.json` (chỉ chứa `{"commit": "<sha>"}`) vào
  gói — chưa có bước build nào làm việc này (đề xuất, không tự ý
  sửa build).
- `src/ui/maintenance.js:121` còn comment cũ "(hiện chưa có nguồn
  đo nối vào nên mọi tiêu chí là CHƯA ĐO)" — nay đã hết đúng;
  file thuộc điều phối, R15 không tự sửa, đề xuất cập nhật câu chữ.

## 4. Đề xuất chuỗi test (điều phối quyết — R15 không sửa package.json)

Thêm ngay sau bước `node test/criteria-checklist-provider.js`:

```
node --check src/measurement/measurementRecords.js &&
node --check src/measurement/currentContext.js &&
node --check tools/measure-profile.js &&
node test/measurement-records.js &&
node test/measurement-current-context.js &&
node test/measurement-checklist-flip.js
```

`test/measurement-records-e2e.js` KHÔNG đưa vào chuỗi thường
(cùng lớp với `test/camoufox-provisioning-real.js`): cần engine
thật qua `LHM_CAMOUFOX_EXECUTABLE`, thiếu điều kiện thì NOT_RUN
exit 2. Chạy thủ công khi nghiệm thu tầng engine thật:

```
LHM_CAMOUFOX_EXECUTABLE=<đường dẫn engine> node test/measurement-records-e2e.js
```

Kết quả chuỗi đầy đủ trên cây đã tích hợp R15 (Linux): xem bản
chạy `node test/run-all.js` đính kèm trong báo cáo bàn giao —
kỳ vọng duy nhất là 2 fixture phụ thuộc Windows đã biết
(browser-diagnostics, runtime-registry), không hồi quy mới.
