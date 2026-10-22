# HỢP ĐỒNG TÍCH HỢP GIỮA CÁC MODULE — LHM Ads Browser

Cơ sở: code tại commit nền `8349f38` + Hiến pháp v1.3 (`TIEU-CHI-SAN-PHAM.md`).
Mỗi hợp đồng ghi: bên cung cấp → bên tiêu thụ, đầu vào, đầu ra, lỗi fail-closed,
và trạng thái nối hiện tại (ĐÃ NỐI / NỐI MỘT PHẦN / CHƯA NỐI) kèm điểm tích hợp còn thiếu.
Tài liệu này là hợp đồng cho các agent 2–10 làm việc song song; thay đổi hợp đồng phải qua Agent 1 (điều phối).

## C1. EngineFactory ↔ Adapters / Controllers

- **Cung cấp:** `src/engine/EngineFactory.js` (`EngineFactory`, `resolveEngineType`, `SUPPORTED`).
- **Tiêu thụ:** `main.js`, `src/api/server.js`, `src/engine/browserLauncher.js`; `src/db/store.js` chỉ dùng `resolveEngineType`.
- **Đầu vào:** profile (engine family `chromium|gecko`, engine type), settings.
- **Đầu ra:** adapter theo hồ sơ: `src/engine/adapters/ChromiumAdapter.js` | `FirefoxAdapter.js` | `CamoufoxAdapter.js`.
- **Fail-closed:** hồ sơ Camoufox phải qua `NetworkSafetyCheck` trước khi tạo adapter; không an toàn → throw `NETWORK_BLOCKED`; provider không khớp → throw; **không tồn tại đường fallback sang engine khác** ở bất kỳ lớp nào (Mục 8).
- **Điểm cần ghi rõ (hai đường Camoufox song song):**
  - Đường A (Factory → `adapters/CamoufoxAdapter.js`): đường khởi chạy theo hồ sơ qua EngineFactory.
  - Đường B (native: `src/engine/camoufoxAdapter.js`, `main.js` require trực tiếp): spawn tiến trình Camoufox đã kiểm chứng bản cài (qua runtime gate), dùng cho chạy tay.
  - Đường C (automation: `src/engine/CamoufoxPlaywrightController.js` + `CamoufoxProfileManager.js`): Playwright persistent context, chỉ qua API lab khi controller enabled.
  - Cả ba đường đều phải áp cùng hợp đồng danh tính C2 và cùng cổng kiểm chứng engine C6. Agent 3 sở hữu việc làm rõ/chuẩn hóa ranh giới ba đường này; cấm thêm đường thứ tư.

## C2. Danh tính đã ghim (D1) ↔ Controller / Adapter

- **Cung cấp:** `src/engine/camoufoxIdentity.js` — hai hàm hợp đồng:
  - `identityEnvForProfile(profile)` → `null` (không có danh tính) hoặc `{ env, expectations }`, trong đó `env` là các biến `CAMOU_CONFIG_1..N` (blob cắt đoạn ≤ 2047 ký tự theo quy tắc Windows của thư viện chính thức) và `expectations` là các giá trị kỳ vọng suy ra **từ chính blob**.
  - `assertIdentityMatchesProfile(profile, expectations)` → throw nếu danh tính mâu thuẫn với trường đã khai của hồ sơ (ngôn ngữ kỳ vọng được hợp thành từ `language + region`).
- **Tiêu thụ:** `CamoufoxPlaywrightController` (gắn `options.env = {...process.env, ...identity.env}` khi và chỉ khi có danh tính) và `camoufoxAdapter.js` (native spawn, cùng mẫu). `stage0-measure/run-config.js` tiêu thụ expectations để so đo.
- **Fail-closed:** danh tính có-mặt-nhưng-không-hợp-lệ hoặc tự mâu thuẫn → throw, hồ sơ không mở. Danh tính vắng mặt → hành vi cũ (engine dùng giá trị mặc định của bản build), **không** được suy diễn là hồ sơ có danh tính riêng.
- **CHƯA NỐI — khâu sinh:** không thành phần nào trong ứng dụng tạo `profile.fingerprint.identity`. Nhà sản xuất duy nhất hiện tại là tool ngoài luồng `tools/generate-camoufox-identity.mjs` (dùng `launchOptions` của gói npm `camoufox`; gói này **không có trong dependencies** của repo). Hợp đồng khâu sinh (Agent 4 đề xuất, Agent 1 duyệt, điều phối thực thi ở `main.js`/store):
  - Sinh tại thời điểm tạo hồ sơ (provisioning), không sinh lúc mở hồ sơ.
  - Chỉ sinh qua cơ chế chính thức; lưu nguyên vẹn blob + expectations vào `profile.fingerprint.identity`; múi giờ đi qua `config:{timezone}` của cơ chế chính thức, không đặt tay từng khóa cấu hình (Mục 8).
  - Sinh thất bại → hồ sơ tạo ở trạng thái chưa có danh tính và phải hiển thị như vậy; cấm bịa blob.

## C3. Profile store ↔ API server ↔ UI

- **Cung cấp:** `src/db/store.js` (JSON store, profile dir riêng theo hồ sơ) — tạo/cập nhật hồ sơ, giữ nguyên `fingerprint` đã tùy chỉnh của hồ sơ cũ, mặc định `{mode:'native'}` và engine `chromium` tại commit nền.
- **Tiêu thụ:** `main.js` (IPC), `src/api/server.js` (Local API cổng 50325), UI qua preload.
- **Hợp đồng API fail-closed (đã có, phải giữ nguyên khi tích hợp):** HTTP 409 cho — profile gecko chạy automation (manual-only), Playwright lab chưa enabled, không có active context, sửa/xóa hồ sơ đang chạy, Camoufox automation không khả dụng/controller disabled (xem `test/camoufox-local-api-contract.js`, `test/camoufox-api-automation-guard.js`).
- **Bất biến:** hồ sơ cũ giữ nguyên engine và fingerprint đã ghim khi nâng cấp (Mục 8); API cũ giữ tương thích; đổi mặc định tạo hồ sơ mới là việc bị khóa sau cổng nghiệm thu + quyết định riêng của chủ dự án — không agent nào được chạm vào ở đợt này.

## C4. Nguồn sự kiện hành vi ↔ D2 (behaviorPatterns)

- **Cung cấp sự kiện:** `src/monitor/behaviorMonitor.js` — `record(type, profileId, source)` với các loại sự kiện do `main.js` và API phát (`profile_open`, `profile_close`, `profile_save`, `profile_delete`...); `getReport()` tổng hợp. Schema chỉ gồm loại sự kiện + profileId + nguồn + thời gian (đúng Mục 20.3: không nội dung phím/mật khẩu/clipboard/biểu mẫu).
- **Tiêu thụ (mục tiêu):** `src/monitor/behaviorPatterns.js` (D2) — hàm thuần nhận mảng sự kiện dạng BehaviorMonitor và trả cảnh báo cho 4 mẫu: mở đồng bộ ≥3 hồ sơ/60s; chuỗi hành động giống hệt giữa hai hồ sơ; mở+đóng hàng loạt ≥8+8/10 phút; khoảng sự kiện đều như máy (CV < 0.1).
- **Trạng thái: CHƯA NỐI** — D2 có 0 caller; `behaviorMonitor` không require D2; `getReport()` không chứa kết quả D2.
- **Hợp đồng nối (Agent 8):** điểm nối duy nhất là nơi `getReport()`/IPC `get-behavior-report` tổng hợp — D2 chạy trên cùng tập sự kiện đã ghi, không thu thập thêm dữ liệu mới; cảnh báo ra phải theo định dạng C7. Cấm D2 kết luận về nền tảng (Mục 20.2).

## C5. Quan sát IP thoát ↔ D3 (autoIpWarnings) ↔ GraphDefense

- **Hợp đồng dữ liệu quan sát (đầu vào D3, đã khóa trong code):** mảng tối đa 20.000 bản ghi `{ profileId, ip (IPv4 chuẩn), observedAt (epoch ms), sessionId? }`; dữ liệu sai định dạng → throw (fail-closed).
- **Cung cấp cảnh báo:** `src/health/autoIpWarnings.js` — IP thoát dùng chung (high); tập trung /24 và chồng lấn thời gian (ủy thác `src/health/GraphDefense.js`); IP đổi giữa một phiên ứng dụng (high); egress không ổn định (≥4 IP). Mỗi cảnh báo kèm `note` giới hạn diễn giải (không kết luận nền tảng liên kết hồ sơ).
- **Trạng thái: CHƯA NỐI ở cả hai đầu:**
  - Không có nhà sản xuất quan sát: không module nào ghi `{profileId, ip, observedAt, sessionId}`. Nguồn IP hiện có là `src/engine/proxyChecker.js#checkProxy` (đo qua proxy từ tiến trình quản lý; caller: `src/api/server.js`, `src/proxies/proxyCenter.js`, `main.js`, UI) — kết quả không được lưu thành quan sát.
  - Không có bên tiêu thụ: không caller nào gọi `automaticIpWarnings(...)`.
- **Hợp đồng nối (Agent 8 sở hữu vòng ghi+gọi; Agent 7 sở hữu nguồn đo):** nguồn đo hợp lệ cho cảnh báo runtime phải lấy **từ runtime của hồ sơ** (Mục 19.3); quan sát từ tiến trình quản lý chỉ được dùng cho kiểm tra proxy, phải gắn nhãn nguồn khác nhau và không trộn hai loại trong cùng một kết luận. `GraphDefense.checkSubnetRisk(ip, entries, {profileId})` đã nối qua IPC `main.js` cho IP nhập tay — giữ nguyên, không thay thế D3.

## C6. Nguồn engine ↔ Cổng kiểm chứng ↔ Runtime

- **Cung cấp:** `src/engine/camoufoxInstallService.js` (cài đặt opt-in: allowlist URL phát hành GitHub, kiểm tra kích thước + SHA-256 của archive), `src/engine/camoufoxPublisherTrust.js` (manifest ký Ed25519, khóa publisher riêng với khóa license), `src/engine/bundledEngineManager.js` (engine đóng gói kèm), `tools/sign-bundled-engine.js` (phía phát hành).
- **Cổng chạy:** `src/engine/camoufoxRuntimeGate.js` — engine chưa kiểm chứng → không chạy.
- **Tiêu thụ:** `main.js` (install service, runtime gate, publisher trust), native adapter (C1 đường B).
- **Fail-closed:** digest sai, chữ ký sai/thiếu, nguồn ngoài allowlist → chặn cài và chặn chạy; không tải ngầm, không tự cập nhật, không né AV/SmartScreen (Mục 7/8).
- **Thiếu điều kiện ngoài:** bản phát hành engine do publisher thật ký chưa tồn tại để nghiệm thu end-to-end; khóa riêng của publisher do chủ dự án giữ ngoài repo (Agent 2 ghi rõ trong bàn giao).

## C7. Cảnh báo ↔ Hiển thị (định dạng thống nhất, Mục 22)

Mọi cảnh báo từ GraphDefense/D2/D3/Health Drift/Signal Chain khi tới người dùng (UI hoặc API) phải mang đủ 6 trường:

1. `observed` — quan sát thấy gì (sự kiện + giá trị đo);
2. `scope` — hồ sơ/phiên nào;
3. `observedAt` + `method` — lúc nào, bằng cách nào (kèm độ trễ đo nếu là canh gác liên tục);
4. `baseline` — so với cấu hình đã khai báo/tiêu chí nào (Mục 18: chuẩn là khai báo của hồ sơ, không phải "sự thật địa lý");
5. `limits` — giới hạn của kết luận (câu note không-kết-luận-về-nền-tảng);
6. `nextAction` — người dùng kiểm tra/xử lý gì tiếp theo.

Trạng thái hiện tại: các module trả `level/code/profiles/message/note` — đủ một phần (thiếu `observedAt/method` và `nextAction` ở tầng hiển thị). Agent 8 chuẩn hóa ở tầng phát cảnh báo; Agent 9 hiển thị; cấm thay đổi ngưỡng cảnh báo trong lúc chuẩn hóa định dạng.

## C8. stage0-measure ↔ Controller (đo độc lập với ứng dụng)

- **Cung cấp:** `stage0-measure/run.js` (hai hồ sơ Camoufox thật qua `CamoufoxPlaywrightController`, loopback, 5 điều kiện × 4 loại lưu trữ = 20 kiểm tra; báo cáo ghi digest engine) và `stage0-measure/run-config.js` (cấp danh tính từ file cấu hình → so expectations bằng `core.identityExpectationResult`, 7 trường: userAgent, platform, language, timezone, hardwareConcurrency, screenWidth, screenHeight; đo trước và sau khởi động lại).
- **Hợp đồng đo (Mục 18/23):** `captureEnvironment` là điểm mở rộng probe duy nhất (Agent 5 sở hữu): trường mới phải ghi "không truy cập được" thay vì suy đoán (WebGL/fonts/voices/audio/Client Hints); báo cáo phải ghi số trường đã đo thật, cấm viết "khớp toàn bộ" khi còn trường thiếu; kết quả đo ở tầng này **không** dùng làm bằng chứng cho tầng EXE/UI (Mục 23).
- **Trạng thái:** `run.js` ĐÃ CHẠY trên runner Windows (20/20, hồ sơ Mục 10); `run-config.js` CHƯA CHẠY ở bất kỳ runner nào — chờ vá workflow (điều phối sở hữu, xem INTEGRATION-PLAN).

## C9. Health Drift ↔ Ứng dụng

- **Cung cấp:** `src/health/localDrift.js` (`LocalHealthDrift`, đã nối `main.js` dạng opt-in snapshot cục bộ).
- **Hợp đồng:** snapshot chỉ gồm giá trị băm/tóm tắt theo thiết kế hiện tại; việc biến drift thành cảnh báo liên tục thuộc Hộ vệ (3) — Agent 8 đề xuất điểm nối, điều phối duyệt; cấm mở rộng phạm vi thu thập dữ liệu sức khỏe máy ngoài thiết kế đã duyệt.

## C10. Signal Chain Preflight ↔ Launcher

- **Cung cấp:** `src/health/signalChain.js` (kiểm tra nhất quán cấu hình tĩnh trước chạy: OS/UA/GPU/màn hình/múi giờ/ngôn ngữ + cờ Chromium cho hồ sơ có proxy).
- **Tiêu thụ:** `src/engine/browserLauncher.js`, `src/health/profileHealth.js`.
- **Hợp đồng diễn giải (Mục 18):** preflight kiểm tra *tính mạch lạc của cấu hình đã khai*; kết quả "lệch địa lý" là cảnh báo để người dùng xem lại khai báo, không phải kết luận rò rỉ. Agent 4 rà soát nhãn/mức cảnh báo cho khớp hợp đồng này trước khi Agent 8 nối hiển thị.
