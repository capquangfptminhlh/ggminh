# INTEGRATION NOTES — Agent 10 (đợt thương mại hoá): tối thiểu hoá API + rào bí mật

Nhánh: `agent-10/api-minimization` từ `f4d7329`. Không sửa file chung
(package.json, main.js, preload.js, src/ui/index.html). Không push/merge/tag.

## 1. QA-002 — rào khóa trong `.gitignore` (đã làm, đã kiểm chứng)

Thêm khối mẫu chặn vật liệu khóa riêng: `*.pem`, `*.key`, `*.p12`,
`*.pfx`, `*.keystore`, `*.jks`, `id_rsa*`, `id_ed25519*`, `*private*key*`.

Kiểm chứng trước/sau:
- Toàn bộ 292 file đang tracked: **không file nào khớp bất kỳ mẫu nào**
  (kiểm tra cả hậu tố lẫn chuỗi con, có phân biệt hoa/thường). Không cần
  ngoại lệ (negation) nào.
- Thăm dò bằng `git check-ignore`: 11/11 tên file khóa mẫu (test.pem,
  license.key, bundle.p12, cert.pfx, android.keystore, app.jks, id_rsa,
  id_ed25519, id_ed25519.pub, issuer-private-key.txt, myprivatekey.pem)
  đều bị chặn.
- File hợp lệ KHÔNG bị nuốt: `publisher-ed25519.pub` (khóa công khai của
  sản phẩm — phải theo dõi được), `src/security/proxyCredentialVault.js`,
  `src/engine/camoufoxPublisherTrust.js`, `tools/sign-bundled-engine.js`.
- Mẫu cố ý KHÔNG thêm: `*secret*` / `*credential*` (quá rộng —
  `proxyCredentialVault.js` là mã nguồn hợp lệ, và thông tin xác thực
  trong sản phẩm là giá trị trong vault/DB chứ không phải file);
  `*.der` / `*.crt` / `*.cer` (định dạng chứng chỉ công khai, ngoài
  phạm vi QA-002).

## 2. QA-003 — tối thiểu hoá `GET /api/profiles` (đã làm, có kiểm toán trước)

### Bảng kiểm toán người tiêu thụ (bằng chứng file:dòng tại commit nền)

| Người tiêu thụ | Đường đi | Cần notes/blob? |
|---|---|---|
| Renderer desktop | IPC `get-profiles` — main.js:198 → `store.getProfiles()` (không qua HTTP) | Có (luồng nội bộ đã xác minh) — KHÔNG đụng |
| RPA/automation trong tiến trình (batch, ops, extensions, backup) | `store.getProfiles()` trực tiếp: src/automation/batch.js:16, src/ops/operations.js:137, src/extensions/manager.js:79, src/backup/configBackup.js:65 | Trong tiến trình — KHÔNG qua HTTP |
| CLI `bin/lhm-cli.js` | routes: list → `/api/v1/user/list` (bin/lhm-cli.js:16-17) | Không gọi /api/profiles |
| Tài liệu (README, docs/) | GET /api/profiles không được tài liệu hoá; chỉ POST (README:355) + DELETE (README:384); bề mặt list được tài liệu hoá là /api/v1/* | — |
| Test trong repo | test/security.js:37-45 (auth 401/403/200 + trường `name`); các test còn lại chỉ POST/DELETE | Không |
| Script RPA ngoài (giả định) | Sau API key + loopback + chặn Origin/Host (server.js middleware) | Không có bằng chứng cần notes/blob |

Kết luận kiểm toán: **không người tiêu thụ HTTP nào cần ghi chú hay blob
danh tính** → áp dụng tối thiểu hoá tại biên HTTP, không cần dừng ở đề xuất.

### Thay đổi (chỉ `src/api/server.js`)

- Helper `apiProfile(profile)` (đầu file): xoá `notes`; thay
  `fingerprint.identity` bằng siêu dữ liệu nguồn gốc
  `{redacted:true, format, version, generator, generatedAt}` — mất hẳn
  `env` (các chunk CAMOU_CONFIG) và `expectations`. Mọi trường còn lại
  giữ nguyên; không đột biến đối tượng của store (sao chép nông đúng
  chỗ cần thay).
- Áp cho `GET /api/profiles` và response của `POST /api/profiles`
  (cùng một chính sách dữ liệu như QA-003 yêu cầu; test POST hiện có
  chỉ khẳng định `engine` + mã trạng thái — không vỡ).
- KHÔNG đổi: `publicProfile` trong store (dùng chung cho IPC), dữ liệu
  lưu trữ, endpoint `/api/v1/user/list` (đã rút gọn từ trước).

### Kiểm chứng

- Test mới `test/api-profile-minimization.js`: endpoint còn chặn 401;
  GET không còn notes/blob ở bất kỳ đâu trong payload (quét cả chuỗi
  JSON), siêu dữ liệu danh tính còn đó, `identityProvisioning` còn đó;
  hồ sơ không danh tính không bị bịa trường; đường nội bộ
  `store.getProfile()` vẫn trả đủ notes + blob; POST response cùng
  chính sách và dữ liệu lưu vẫn đủ; shape /api/v1/user/list không đổi.
  → PASS.
- Toàn chuỗi `npm test` chạy từng bước trên nhánh này: **188 bước,
  186 PASS / 2 FAIL** — đúng hai fixture lệ thuộc Windows đã biết
  (browser-diagnostics bước 31, runtime-registry bước 116, đã tái hiện
  trên main gốc ở đợt QA trước). **Không hồi quy.**

## 3. Việc cần điều phối làm

1. Thêm vào chuỗi `test` trong package.json (file chung — agent không
   tự sửa): `node test/api-profile-minimization.js` — vị trí gợi ý:
   ngay sau `node test/api-profile-updates.js`.
2. Ghi chú phát hành cho khách: từ bản này, Local API không còn trả
   ghi chú hồ sơ và blob danh tính qua HTTP; ứng dụng desktop không
   thay đổi gì (vẫn đọc đủ qua IPC).

## 4. Tồn dư / NOT_RUN

- Không có NOT_RUN trong phạm vi được giao. QA-002/QA-003 đều đã làm +
  kiểm chứng ở tầng code/test trên Linux; nghiệm thu trên EXE Windows
  (cổng 3) vẫn thuộc chủ dự án như toàn bộ đợt.
