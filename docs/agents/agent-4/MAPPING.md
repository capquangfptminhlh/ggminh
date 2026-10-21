# MAPPING — Agent 4: Kiểm chứng cấu hình D1 (danh tính Camoufox ghim theo hồ sơ)

- Nhánh: `agent-4/config-verification`, nền: commit `8349f38` (Hiến pháp v1.3).
- Phạm vi đối chiếu: Mục 5.1 (danh tính chỉ sinh qua cơ chế chính thức),
  Mục 8 (Camoufox: danh tính chỉ qua `CAMOU_CONFIG`, cấm đặt tay từng khóa,
  fail-closed), Mục 16 (trạng thái ĐẠT/KHÔNG ĐẠT/CHƯA ĐO), Mục 23 (hồ sơ
  nghiệm thu — ghi đúng số trường đã đo, cấm "khớp toàn bộ").

## 1. Luồng dữ liệu D1 (đối chiếu từ code)

| Bậc | Thành phần | Vai trò | Kiểm chứng hiện có |
|---|---|---|---|
| Sinh (provisioning) | `tools/generate-camoufox-identity.mjs` | Gọi `launchOptions()` của thư viện chính thức `camoufox` (fpgen bốc cả bộ danh tính); chỉ trích các khóa `CAMOU_CONFIG_*` từ `launch.env`; timezone đi qua `config:{timezone}` (đường raw-config có tài liệu); loại addon UBO để không tải mạng. Đầu ra: JSON `{format, version, generator, env, expectations}` lưu vào `profile.fingerprint.identity`. | Chưa từng chạy end-to-end ở dạng file hoàn chỉnh trước đợt này (xem INTEGRATION-NOTES.md, mục Generator). |
| Lưu trữ + xác thực | `src/engine/camoufoxIdentity.js` | `validateStoredIdentity`: format/version/generator phải khớp mẫu `camoufox@x.y.z`; `parseCamouConfigEnv`: chunk phải là `CAMOU_CONFIG_1..N` liên tục, string, ≤32767 ký tự/chunk, ≤512 chunk, blob ≤262144 ký tự và parse thành JSON object; `summarizeIdentity` suy kỳ vọng từ blob và bắt buộc `expectations` lưu trữ **bằng đúng** kỳ vọng suy ra (blob bị sửa tay không qua được); blob thiếu userAgent/platform bị loại. | `test/camoufox-identity.js` — PASS (validator, replay, cổng nhất quán). |
| Phát lại | `identityEnvForProfile(profile)` trong cùng module | Không có identity → `null` (hành vi cũ). Có identity → validate, rồi `rechunkCamouConfigEnv` cắt lại blob byte-for-byte thành chunk ≤2047 (giới hạn biến môi trường Windows) và trả `{env, expectations}`. | `test/camoufox-identity.js` — PASS ở mức hàm. |
| Cổng nhất quán | `assertIdentityMatchesProfile(profile, expectations)` | Đối chiếu kỳ vọng với trường khai báo của chính hồ sơ (os/UA/platform/timezone/languages/screen); lệch → ném `CAMOUFOX_IDENTITY_MISMATCH` trước khi tạo tiến trình. | `test/camoufox-identity.js` — PASS ở mức hàm. |
| Truyền env — controller | `src/engine/CamoufoxPlaywrightController.js` dòng 57–64 | `identity=identityEnvForProfile(profile)`; có identity thì `options.env={...process.env,...identity.env}` truyền vào `launchPersistentContext(profileDir, options)`; không có thì `options` **không có khóa `env`**. `info.identityApplied` và `info.identityExpectations` ghi lại. | **Trước đợt này: KHÔNG có test nào khẳng định `options.env`.** Test tích hợp hiện có (`test/integration/camoufox-playwright.test.js`) không nhắc env/identity. → Đã bổ sung: `test/camoufox-env-delivery.js` (Đợt B). |
| Truyền env — adapter native | `src/engine/camoufoxAdapter.js` dòng 32–34, 139, 184 | `validateCamoufoxProfile` validate + trả identity; `_startVerified` truyền `...(identity?{env:{...process.env,...identity.env}}:{})` vào options của `spawnProcess(executable, args, options)`. Không identity → options spawn **không có khóa `env`**. | Test adapter hiện có (`test/camoufox-adapter.js`) chạy hồ sơ không identity và không khẳng định env. → Đã bổ sung trong `test/camoufox-env-delivery.js`. |
| Đo runtime | `stage0-measure/run-config.js` + `stage0-measure/core.js` | Chỉ chạy trên Windows (`process.platform!=='win32'` → dừng), cần exe Camoufox đã duyệt digest + 2 file identity qua biến môi trường. `identityExpectationResult` so giá trị lộ ra với kỳ vọng trên **7 trường**: userAgent, platform, language, timezone, hardwareConcurrency, screenWidth, screenHeight. | NOT_RUN trong đợt này (máy Linux, không có `camoufox.exe` đã duyệt). |

## 2. Trường kỳ vọng: 9 khai báo, 7 có đầu đo

`EXPECTATION_KEYS` trong `camoufoxIdentity.js` gồm 9 trường: userAgent,
platform, language, timezone, screenWidth, screenHeight,
hardwareConcurrency, webglVendor, webglRenderer.

- 7 trường đầu có đầu đo ở `stage0-measure/core.js` (`IDENTITY_FIELD_MAP`
  + screen width/height).
- **webglVendor và webglRenderer: có trong blob và trong expectations,
  nhưng KHÔNG có đầu đo nào** (cả `captureEnvironment` của run-config.js
  lẫn chứng minh cục bộ trước đây đều không đọc WebGL). Theo Mục 3.5 và
  Mục 23 của Hiến pháp, hai trường này ở trạng thái **CHƯA ĐO** — không
  được tính vào bất kỳ khẳng định "khớp danh tính" nào. Việc mở rộng đầu
  đo WebGL thuộc phạm vi Agent 5 (đo runtime).

## 3. Bảng đối chiếu tiêu chí

| Tiêu chí (Hiến pháp) | Code hiện có | Phần thiếu trước đợt này | Phép thử đợt này | Trạng thái sau đợt này |
|---|---|---|---|---|
| Mục 8: danh tính chỉ qua CAMOU_CONFIG chính thức | generator tool + validator khóa format/generator/blob | — | test validator đã có; generator chạy end-to-end (INTEGRATION-NOTES) | ĐẠT ở mức công cụ (generator) + validator; xem ghi chú NOT_RUN của generator nếu có |
| Mục 8: cấm đặt tay từng khóa | runtime không có đường sửa blob; expectations phải bằng blob | test cho blob chắp vá từng phần | `camoufox-env-delivery.js`: blob chỉ có userAgent (thiếu platform) → fail-closed ở cả controller và adapter | ĐẠT ở mức unit test (mô phỏng) |
| Mục 8: fail-closed khi identity sai lệch | validate ném lỗi trước launch/spawn | test ở đường controller/adapter (không chỉ ở hàm) | chunk đứt đoạn → reject, launcher/spawn không được gọi; expectations bị sửa → reject; mâu thuẫn trường khai báo → reject `CAMOUFOX_IDENTITY_MISMATCH` | ĐẠT ở mức unit test (mô phỏng) |
| Env thực sự tới lệnh khởi chạy (điểm mù PR #17) | controller dòng 64; adapter dòng 184 | **không có test khẳng định env** | stub ghi lại options: env chứa đúng chunk đã rechunk (≤2047, liên tục từ 1, nối lại bằng blob gốc), giữ nguyên biến môi trường của tiến trình cha (sentinel), `identityApplied=true` | ĐẠT ở mức unit test (mô phỏng — stub launcher/spawn, KHÔNG phải engine thật) |
| Không identity → hành vi như cũ | controller: không đặt `options.env`; adapter: không đặt khóa `env` trong spawn options | test khẳng định tính "không có mặt" của env | cả hai đường đều khẳng định `env` vắng mặt và `identityApplied=false` | ĐẠT ở mức unit test (mô phỏng) |
| Mục 23: đo trên engine thật / EXE thật | run-config.js (Windows) | chưa chạy CI Windows; máy này là Linux | — | NOT_RUN (ghi ở INTEGRATION-NOTES) |

## 4. Phân tầng bằng chứng (Mục 23)

- Unit test mới trong đợt này thuộc tầng **test mô phỏng** (stub ghi tham
  số): chứng minh hợp đồng truyền env trong code, không chứng minh engine
  thật đã đọc env.
- Bằng chứng engine thật đọc env và lộ đúng kỳ vọng vẫn là
  `stage0-measure/run-config.js` trên Windows/CI — **NOT_RUN** tới nay.
- Không kết luận nào trong tài liệu này nói về khả năng nền tảng liên kết
  hay không liên kết các hồ sơ.
