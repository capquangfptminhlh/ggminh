# QA BASELINE — Rà soát độc lập commit nền (Agent 10)

## Hồ sơ nghiệm thu (theo Mục 23 Hiến pháp v1.3)

- **Commit ứng dụng:** `8349f38b829a133ab53bc4b0a874c3f7b4ff8b22` (nhánh nền:
  feature/d1-camoufox-per-profile-identity; bản rà soát trên nhánh
  `agent-10/qa-review` từ đúng commit này)
- **Engine:** không chạy engine thật trong đợt rà soát này (xem NOT_RUN)
- **Hệ điều hành / môi trường:** Linux 7.0.0-39-generic x86_64, Node v24.20.0,
  máy ảo của hệ thống Muse — KHÔNG phải máy Windows của chủ dự án
- **Thời gian:** 2026-10-21 (Asia/Bangkok)
- **Phương pháp:** đọc code trực tiếp tại commit nền; quét chuỗi toàn repo;
  chạy toàn bộ 173 bước của `npm test` TỪNG BƯỚC RIÊNG (vì chuỗi `&&` dừng ở
  lỗi đầu tiên); tái hiện hai test fail trên main gốc `77075f3` để đối chiếu
- **Phạm vi:** 5 trục theo phân công. Không sửa code tính năng.

Mức bằng chứng dùng trong tài liệu này (Mục 14): *quan sát đo được* =
test/lệnh đã chạy có kết quả kèm theo; *suy luận từ code* = đọc code tại
commit nền; *chưa xác minh* = ghi rõ NOT_RUN.

---

## Trục 1 — Fail-closed: **PASS ở tầng code + test (mock/integration)**

Mọi đường chặn đã liệt kê và kiểm chứng bằng đọc code:

| # | Đường chặn | Vị trí | Bằng chứng |
|---|---|---|---|
| 1 | Provider không khớp / engine_type không hỗ trợ / xung đột engine ↔ engine_type → throw | `src/engine/EngineFactory.js` `resolveEngineType` | đọc code + test `per-profile-engine-factory` PASS |
| 2 | Camoufox: NetworkSafetyCheck `safeToLaunch=false` → throw `NETWORK_BLOCKED` | `EngineFactory.launchProfile` | đọc code + `test/integration/network-safety.test.js` PASS (mocked lab) |
| 3 | Kết quả adapter có `engineType` khác loại đã chọn → throw "Engine provider response mismatch" | `EngineFactory.launchProfile` | đọc code |
| 4 | Camoufox native: profile không phải gecko / fingerprint không phải native / GeoIP bật / danh tính ghim không khớp khai báo → throw TRƯỚC khi tạo tiến trình | `camoufoxAdapter.validateCamoufoxProfile` | đọc code + test `camoufox-adapter`, `camoufox-identity` PASS |
| 5 | Camoufox native: proxy có xác thực khi chưa có lab được duyệt → throw "no direct fallback" | `camoufoxAdapter.start` | đọc code |
| 6 | Camoufox proxy plan: thiếu credential reference / thiếu vault / vault thiếu credentials → throw "no direct fallback" (3 điểm) | `camoufoxProxyPlan.js` | đọc code + test `camoufox-proxy-plan`, `camoufox-proxy-lifecycle` PASS |
| 7 | Playwright runtime được ghim không có → throw "no fallback" | `CamoufoxPlaywrightController.js:74` | đọc code |
| 8 | Engine đóng gói: manifest sai chữ ký/thiếu chữ ký/đường dẫn thoát thư mục/symlink/file quá cỡ → throw (hàng loạt điểm) | `bundledEngineManager.js` | đọc code + test `camoufox-bundle-integrity` PASS |
| 9 | API 409: Camoufox automation không khả dụng; Gecko manual-only; controller tắt; không có context; sửa hồ sơ đang chạy; xóa hồ sơ đang chạy | `src/api/server.js` (6 điểm: dòng 54, 59, 76, 78, 112, 129) | đọc code + test `camoufox-local-api-contract`, `camoufox-api-automation-guard` PASS |
| 10 | Signal Chain preflight `blocked` → throw trước khi mở | `browserLauncher.start` | đọc code + test `signal-chain` PASS |
| 11 | Hồ sơ nhập từ backup chưa gán lại proxy (`requiresProxySetup`) → throw | `browserLauncher.start` | đọc code |
| 12 | Mọi lệnh mở đều qua `EngineFactory.launchProfile` (điểm vào duy nhất) | `browserLauncher.js:119` | đọc code |

**Fallback ngầm: KHÔNG phát hiện.** Quét toàn bộ `src/engine` cho mẫu
fallback: mọi kết quả khớp đều là câu chữ "no fallback / never fallback"
hoặc tham số mặc định của hàm tiện ích nội bộ (extensionGenerator), không
có đường nào tự đổi engine/đường mạng khi gặp lỗi. Controller Camoufox
lỗi thì throw, không retry bằng native spawn (comment + code tại
`adapters/CamoufoxAdapter.js`).

**Quan sát (ghi vào OPEN-ISSUES QA-001):** `NetworkSafetyCheck.evaluate`
cho hồ sơ Camoufox **kết nối trực tiếp (direct)** trả `safeToLaunch:true`
với mã `PREFLIGHT_ONLY` và lý do ghi rõ "network-leak safety not
certified". Đây là quyết định thiết kế đã ghi trong code (phân biệt
preflight ≠ chứng nhận rò rỉ), không phải fallback ngầm; nhưng nếu diễn
giải Mục 19.4 nghiêm ngặt ("phép kiểm bắt buộc không hoàn thành → chặn")
thì cần quyết định của chủ dự án. Agent 10 không tự phán quyết thay.

## Trục 2 — Bí mật: **PASS, kèm 1 khuyến nghị LOW**

- `git ls-files`: **không có** file `.pem/.key/.env`/private/secret nào
  được theo dõi trong repo. Quét chuỗi `BEGIN PRIVATE KEY` toàn repo:
  kết quả duy nhất là một assertion trong `test/license-center.js` kiểm
  tra khóa riêng **không** bị lộ.
- Công cụ ký/phát hành đọc khóa từ đường dẫn người dùng chỉ định +
  passphrase từ biến môi trường `LHM_ISSUER_PASSPHRASE` (tối thiểu 12
  ký tự), không nhận qua tham số dòng lệnh: `tools/sign-bundled-engine.js`,
  `tools/issue-license.js`. Tool phát hành ghi rõ "Issuer is not part of
  the shipped Electron app. Never commit the private key."
- Không phát hiện log/console in khóa/mật khẩu/token trong `src/` và
  `tools/` (quét theo mẫu key|secret|password|token trên các dòng log).
- API key cục bộ: sinh ngẫu nhiên 32 byte mỗi lần chạy app
  (`main.js:83`), so khớp hằng-time (`crypto.timingSafeEqual`).
- Credential proxy: bị **cấm lưu trong hồ sơ** ở tầng ghi
  (`store.saveProfile` từ chối các khóa user/pass/password/token/secret…)
  và bị xóa ở tầng đọc (`store.publicProfile`); credentials thật chỉ nằm
  trong Proxy Credential Vault (`src/security/proxyCredentialVault.js`).
- Backup cấu hình: AES-256-GCM + scrypt (N=16384) — `src/backup/configBackup.js`,
  khớp tuyên bố trong tài liệu.
- Support report tự khai chỉ chứa số đếm và trạng thái, không chứa
  cookie/session/secret (`src/ops/supportReport.js:25`).
- **Khuyến nghị LOW (QA-002):** `.gitignore` hiện chưa có mẫu `*.pem`,
  `*.key`, `*.p12` — nên thêm để phòng thủ nhiều lớp (hiện tại sạch nhờ
  kỷ luật, chưa có rào chắn kỹ thuật).

## Trục 3 — API cục bộ: **PASS, kèm 1 ghi nhận LOW**

Bề mặt endpoint (`src/api/server.js`, 140 dòng, toàn bộ đã đọc):

| Endpoint | Ghi chú |
|---|---|
| `GET /status` | chỉ trả status + tên app + version |
| `GET /api/v1/browser/start` | 409 cho Camoufox-không-controller và Gecko; không bịa WebSocket (trả `debug_port:null, ws.playwright:null` kèm giải thích) |
| `POST /api/v1/browser/navigate` | chỉ qua context nội bộ; URL qua `safeWebUrl`; 409 khi controller tắt/không có context |
| `GET /api/v1/browser/stop`, `GET /api/v1/browser/active` | — |
| `GET /api/v1/user/list` | bản rút gọn: id, tên, nhóm, loại proxy + host/port (không credentials), thời gian tạo |
| `GET /api/profiles` | trả **toàn bộ** publicProfile — xem QA-003 |
| `POST /api/profiles` | 409 khi hồ sơ đang chạy; đổi engine chỉ khi request có trường engine tường minh |
| `DELETE /api/profiles/:id` | 409 khi đang chạy; xóa mềm vào trash |
| `POST /api/proxy/check` | kiểm tra proxy theo body (đúng chức năng Proxy Center) |

Lớp bảo vệ chung (middleware): chặn mọi request có header `Origin`
(403 "Web origins denied"), bắt buộc Host loopback `127.0.0.1|localhost`,
bắt buộc API key (401, so khớp hằng-time), cổng license
(`licensePolicy.require('api')` → 403), giới hạn body JSON 64 KB,
`Cache-Control: no-store`, tắt `x-powered-by`.

**Ghi nhận LOW (QA-003):** `GET /api/profiles` trả toàn bộ đối tượng hồ
sơ (gồm ghi chú người dùng và blob danh tính đã ghim `fingerprint.identity`)
trong khi endpoint danh sách kia đã rút gọn. Credentials proxy vẫn được
bảo vệ (cấm lưu + xóa khi đọc), và toàn bộ API nằm sau API key + loopback,
nên mức rủi ro thấp — nhưng tính tối thiểu dữ liệu trả về không nhất
quán giữa hai endpoint.

## Trục 4 — Tuyên bố trong README/tài liệu so với code: **PASS**

- README mở đầu bằng tuyên bố giới hạn: không phải công cụ bảo đảm vượt
  phát hiện/né đình chỉ; không cam kết tương thích 100%.
- Quét từ ngữ tuyệt đối/bảo chứng trong README + `docs/*.md`: các kết quả
  khớp đều là câu **phủ định** bảo chứng ("not a production-ready SaaS
  billing system", "No guarantees of anonymity", "does not provide ...
  anti-detection guarantees", "Activation is not guaranteed"...).
- `docs/RELEASE_v5_8_CORE_SELECTIVE.md` ghi trạng thái **PREVIEW / NOT
  PRODUCTION READY** và liệt kê release blockers (thiếu engine ký lại để
  phân phối, thiếu kiểm chứng proxy/DNS/WebRTC trực tiếp, thiếu nghiệm
  thu máy Windows sạch) — khớp trạng thái thật tại commit nền.
- Tuyên bố kỹ thuật kiểm chứng được trong repo đều khớp code đã đọc:
  AES-256-GCM backup, gateway proxy chỉ nghe 127.0.0.1 cổng tạm, không
  MCP (README:431 — và không có code MCP nào trong `src/`), statistics
  sharing mặc định tắt.
- **Ghi nhận LOW (QA-004):** câu marketing "miễn phí vĩnh viễn" (README
  dòng 5) là cam kết kinh doanh không kiểm chứng được từ repo — ngoài
  phạm vi phán quyết kỹ thuật, ghi lại để chủ dự án biết.

## Trục 5 — Toàn bộ `npm test` trên Linux: **171 PASS / 2 FAIL (đều do nền tảng, đã tái hiện trên main gốc)**

Chuỗi `npm test` gồm **173 bước** (`node test/*.js` và `node --check`).
Vì script nối bằng `&&`, một lần chạy `npm test` nguyên trạng trên Linux
dừng ở bước 31 và **che khuất 142 bước còn lại** (ghi nhận QA-005). Agent
10 đã chạy từng bước độc lập:

| Phân loại | Số bước | Chi tiết |
|---|---|---|
| PASS | 171 | gồm toàn bộ test Camoufox/D1/D2/D3, integration (mock), stage0 contract |
| FAIL — nền tảng (đã xác minh) | 2 | xem dưới |
| FAIL — lỗi thật | 0 | — |
| NOT_RUN | 0 | mọi bước đều chạy được trên Linux |

**FAIL 1 — bước 31 `test/browser-diagnostics.js`:** assert
`engines[0].status === 'ready'`, thực tế `'missing'`. Nguyên nhân đọc
từ code: test stub `existsSync` cho đường dẫn kiểu Windows
`C:\LHMTest\chrome.exe`, nhưng `diagnoseBrowsers` lọc ứng viên bằng
`path.isAbsolute(p)` — trên Linux (POSIX) đường dẫn backslash không
được coi là tuyệt đối nên ứng viên bị loại trước khi stub kịp tác
dụng. **Tái hiện trên main gốc `77075f3`: fail giống hệt, cùng dòng
assert.** Kết luận: fixture test phụ thuộc ngữ nghĩa đường dẫn
Windows; không phải hồi quy của nhánh nền.

**FAIL 2 — bước 116 `test/runtime-registry.js`:** test kỳ vọng
`register('gecko', chrome)` ném lỗi khớp `/Firefox/` (kiểm tra tên
file theo engine), nhưng `validatePath` với `platform:'win32'` kiểm
tra đường dẫn phải có ký tự ổ đĩa `^[a-zA-Z]:[\\/]` **trước** kiểm tra
tên file; thư mục tạm trên Linux (`/tmp/...`) không có ký tự ổ đĩa nên
lỗi thực tế là "Only local Windows drive paths are permitted". Bản
thân thứ tự kiểm tra này là fail-closed đúng ý đồ. **Tái hiện trên
main gốc `77075f3`: fail giống hệt.** Kết luận: nền tảng, như FAIL 1.

Lưu ý tầng bằng chứng (Mục 23): các test integration Camoufox tự khai
là **mock** ("mocked lab", "mock test") — PASS của chúng là bằng chứng
tầng mô phỏng/integration, KHÔNG phải engine thật hay EXE thật.

## NOT_RUN của đợt rà soát này (không được tính là đạt)

- CI Windows trên commit `8349f38` — không chạy trong đợt này (Mục 12 cổng 2).
- Chạy engine Camoufox thật (kể cả bản Linux) qua controller của nhánh nền.
- Đo proxy/DNS/WebRTC/IPv6 trên đường chạy thật (lab mạng).
- Build và nghiệm thu EXE Windows (Mục 12 cổng 3) — điều kiện thuộc chủ dự án.
- Nghiệm thu hai instance EXE thật cho thay đổi chặn-mở-trùng (không thuộc
  commit nền này; ghi nhận từ hồ sơ dự án, ngoài phạm vi rà soát code).

## Kết luận đợt A

Tại commit nền `8349f38`, trên bằng chứng tầng code + test (Linux):
fail-closed **đạt** ở mọi đường đã liệt kê, không fallback ngầm; vệ sinh
bí mật **đạt**; bề mặt API **đạt** với 2 ghi nhận LOW; tài liệu **trung
thực** với code; bộ test **171/173**, hai fail còn lại đều là fixture lệ
thuộc Windows và tồn tại giống hệt ở main gốc. Kết luận này **không**
thay thế cổng 2–4 của Mục 12 và không phải căn cứ phát hành (Mục 9.3).
