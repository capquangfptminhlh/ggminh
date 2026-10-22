# INTEGRATION NOTES — Agent 4 (Kiểm chứng cấu hình D1)

Nhánh: `agent-4/config-verification` từ `8349f38`. Tất cả thay đổi của
Agent 4 nằm trong 3 file: `MAPPING.md`, `INTEGRATION-NOTES.md`,
`test/camoufox-env-delivery.js`. Không sửa file chung nào.

## 1. Việc điều phối viên cần làm (file chung)

1. **package.json — thêm test mới vào chuỗi `test`:** chèn
   `node test/camoufox-env-delivery.js && ` ngay sau đoạn
   `node test/camoufox-identity.js && node --check src/engine/camoufoxIdentity.js && `.
   Không thêm vào `stage0:test` (test này không thuộc Stage-0).
2. **Workflow smoke đã cấu hình:** không thay đổi bởi đợt này. File vá
   `tools/patches/camoufox-smoke-configured-steps.patch` vẫn cần người có
   quyền ghi `.github/workflows` áp và đẩy; phép đo run-config trên CI
   Windows vẫn NOT_RUN cho tới lúc đó.

## 2. Kết quả test (máy này: Linux, Node v24.20.0, commit nền 8349f38)

| Test | Tầng | Kết quả |
|---|---|---|
| `test/camoufox-env-delivery.js` (MỚI) | mô phỏng (stub ghi tham số) | PASS — 21 nhóm khẳng định, 10 kịch bản (controller 7, adapter 3) |
| `test/camoufox-identity.js` | unit | PASS |
| `test/camoufox-adapter.js` | unit/mô phỏng | PASS |
| `test/integration/camoufox-playwright.test.js` | mô phỏng | PASS |
| `test/per-profile-engine-factory.js` | unit | PASS |
| `test/camoufox-proxy-plan.js` | unit | PASS |
| `test/selective-core-gate.js` | unit | PASS |
| `stage0-measure/test.js` | hợp đồng | PASS (tự ghi: real Windows measurements NOT_RUN) |

Nội dung test mới chứng minh được (và chỉ chừng đó — tầng mô phỏng):
- Controller: có identity → `options.env` của `launchPersistentContext`
  chứa đúng các chunk CAMOU_CONFIG đã rechunk (liên tục từ 1, mỗi chunk
  ≤2047, nối lại bằng đúng blob đã lưu), giữ nguyên env của tiến trình cha
  (biến sentinel), `info.identityApplied=true`, expectations khớp.
- Controller: không identity → `options` **không có khóa `env`**,
  `identityApplied=false`.
- Controller: 5 dạng identity sai (chunk đứt đoạn, expectations bị sửa,
  mâu thuẫn timezone khai báo, khóa lạ trong env, blob chắp vá chỉ có
  userAgent) → launch bị reject **trước** khi launcher được gọi (số lần
  gọi giữ nguyên).
- Adapter: có identity → `options.env` của spawn chứa cùng bộ chunk đã
  rechunk; không identity → spawn options không có khóa `env`; chunk đứt
  đoạn → reject trước khi spawn.

## 3. Generator end-to-end — PASS (có giới hạn phạm vi)

Hồ sơ nghiệm thu theo Mục 23:

- **Lệnh chạy:** `node tools/generate-camoufox-identity.mjs
  --executable-path /home/hatch/tmp-big/cfx-build/camoufox
  --os linux --locale <vi-VN|en-US> --timezone <Asia/Ho_Chi_Minh|America/New_York>
  --out <file>` — chạy 2 lần, cả hai exit 0.
- **Điều kiện chạy:** ESM chỉ resolve được package `camoufox` khi
  node_modules kề bên file công cụ. Để không đụng vào cây repo, công cụ
  được chạy từ **bản sao byte-for-byte** đặt trong bố cục thư mục tạm
  `/tmp/cfx-gen` (SHA-256 của bản sao và của file trong repo đều là
  `4245d944d5e5932cd33ac72d500c871301cb0ee07f0dee9a1d59e1f3bb61fc8d`;
  kèm theo bản sao của `src/engine/camoufoxIdentity.js`,
  `src/health/signalChain.js`, `src/health/proxyValidation.js` — các
  dependency require của công cụ). `camoufox@0.5.8` +
  `playwright-core@1.62.0` cài trong `/tmp/cfx-gen` (ngoài repo).
- **Engine dùng để sinh:** bản build Camoufox Linux chính thức
  v156.0.1-beta.36 tại `~/tmp-big/cfx-build/camoufox` (đã có sẵn trên
  máy từ đợt kiểm chứng trước; digest của bản build này đã được đối
  chiếu với digest GitHub ghi nhận trong hồ sơ dự án).
- **Đầu ra kiểm chứng bằng chính validator của repo** (bản trong clone
  này, không phải bản sao tạm): cả hai identity đều qua
  `validateStoredIdentity`, phát lại rechunk 1 chunk lưu trữ → 15 chunk
  ≤2047 nối lại **bằng đúng blob gốc**, và qua cổng
  `assertIdentityMatchesProfile` với trường khai báo tương ứng.
- **Trường kỳ vọng: 9/9 được điền** ở cả hai identity (userAgent,
  platform, language, timezone, screenWidth, screenHeight,
  hardwareConcurrency, webglVendor, webglRenderer). Hai identity khác
  nhau ở language, timezone, screen, WebGL vendor/renderer — do fpgen
  bốc, không ai đặt tay.
- **Giới hạn phải ghi rõ:** (a) đây là đường `--os linux` + binary Linux
  trên máy Linux — đường Windows (`--os windows` + `camoufox.exe` +
  workflow CI) vẫn **NOT_RUN**; (b) trạng thái đo của các trường không
  đổi bởi đợt này: 7/9 trường có đầu đo trong `stage0-measure/core.js`,
  **webglVendor/webglRenderer vẫn CHƯA ĐO** (không có đầu đo WebGL — thuộc
  phạm vi Agent 5); (c) đầu ra thô nằm ở `/tmp/cfx-gen/identity-vi.json`
  và `identity-en.json` (thư mục tạm, không commit vào repo).

## 4. Lỗi và quan sát tìm thấy

- **Không phát hiện lỗi chức năng** trên đường truyền env: cả hai
  launcher đều truyền env đúng hợp đồng và fail-closed đúng tại cả hai
  điểm nối đã kiểm.
- Quan sát 1 (không phải lỗi): trong `CamoufoxPlaywrightController`,
  identity được validate **sau** `prepareProxy` — proxy plan có thể đã
  được tạo trước khi lỗi identity bị ném; nhánh `catch` có đóng proxy
  plan nên không rò rỉ tài nguyên. Adapter validate identity trước mọi
  bước tạo tài nguyên (thứ tự sạch hơn). Điều phối viên cân nhắc nếu
  muốn đồng nhất thứ tự — Agent 4 không tự sửa vì nằm ngoài phạm vi
  bàn giao tối thiểu.
- Quan sát 2: expectations chứa webglVendor/webglRenderer nhưng không
  đầu đo nào đọc chúng (chi tiết ở MAPPING.md mục 2). Mọi khẳng định
  "khớp danh tính" trước nay chỉ đúng cho 7/9 trường.

## 5. NOT_RUN (ghi rõ, không tính là đạt)

- `stage0-measure/run-config.js` trên Windows với exe đã duyệt digest:
  NOT_RUN (máy Linux; hàm `run()` tự dừng trên non-win32).
- Phép đo hồ sơ có cấu hình trên CI Windows: NOT_RUN (chờ áp file vá
  workflow bởi người có quyền).
- Nghiệm thu EXE Windows (cổng 3–4, Mục 12): NOT_RUN, ngoài phạm vi
  Agent 4.
