# CHANGELOG — LHM Ads Browser

## v5.8.0 (Preview) — so với v5.7.0 công khai (commit `77075f3`)

- **Trạng thái:** bản Preview tích hợp, **chưa phát hành chính thức**.
  Cây tích hợp local `f280296` (nhánh `integration/v5.8-phase-c`),
  bản chụp trên GitHub `f549a63`; Windows CI run `39641363889` SUCCESS
  (xem `RELEASE-CHECKLIST.md` để biết cổng nào đã đạt, cổng nào chưa).
- **Phạm vi thay đổi:** 207 file so với `main` v5.7.0
  (183 file mới, 24 file sửa), 90 commit tích hợp.
- Mọi khẳng định dưới đây truy được về commit/file trong repo. Những gì
  chưa đo được ghi ở mục "Giới hạn đã biết" — không suy diễn thêm.

### Tính năng mới

- **Engine Camoufox thành đường chạy chính thức, có kiểm soát:**
  provider Camoufox + vòng đời hồ sơ (tạo/mở/đóng) qua controller
  Playwright (`src/engine/CamoufoxPlaywrightController.js`,
  `CamoufoxProfileManager.js`); `EngineFactory` định tuyến fail-closed —
  provider không khớp thì từ chối, **không tự ý đổi engine dự phòng**.
- **Danh tính ghim theo hồ sơ (D1):** danh tính được sinh bằng generator
  chính thức `camoufox@0.5.8` (`launchOptions()` → `CAMOU_CONFIG`) tại
  thời điểm tạo hồ sơ (`src/engine/camoufoxProvisioning.js`,
  `tools/generate-camoufox-identity.mjs`). Ứng dụng chỉ kiểm tra và phát
  lại blob đã ghim (`src/engine/camoufoxIdentity.js`), không tự đặt
  thuộc tính trình duyệt bằng tay.
- **Kiểm tra an toàn mạng trước khi chạy:** `NetworkSafetyCheck` +
  preflight chuỗi tín hiệu (`src/health/signalChain.js`); hồ sơ Camoufox
  không đạt điều kiện mạng bắt buộc thì bị chặn bằng `NETWORK_BLOCKED`
  kèm lý do, thay vì chạy trong im lặng.
- **Cảnh báo IP tự động (D3)** (`src/health/autoIpWarnings.js`) trên
  kho quan sát IP thoát (`src/health/exitIpObservations.js`): mỗi quan
  sát ghi rõ nguồn đo (`manager-process` — tiến trình quản lý đo, hay
  `browser-runtime` — đo từ trong phiên trình duyệt khi chủ dự án cấu
  hình endpoint echo của LHM; mặc định tắt).
- **Cảnh báo mẫu hành vi (D2)** (`src/monitor/behaviorPatterns.js`) và
  **Health Drift cục bộ** (`src/health/localDrift.js`) +
  `GraphDefense` (`src/health/GraphDefense.js`).
- **Dịch vụ cảnh báo hợp nhất:** mọi cảnh báo D2/D3/Health Drift được
  chuẩn hoá theo định dạng bằng chứng sáu câu hỏi (Hiến pháp Mục 22)
  qua `src/monitor/warningService.js`; nguồn dữ liệu thiếu thì ghi
  `not_measured`, không bao giờ hiển thị thành "đạt".
- **Lịch sử cảnh báo bền vững** (`src/monitor/warningHistory.js`):
  cảnh báo được lưu xuống đĩa (giữ tối đa 1.000 cảnh báo phân biệt,
  90 ngày kể từ lần phát hiện cuối), có IPC cho người dùng xoá. File
  chỉ chứa đúng hình dạng cảnh báo đã chuẩn hoá (danh sách trắng) —
  không lưu nội dung gõ phím, mật khẩu hay nội dung biểu mẫu.
- **Bảng kiểm tiêu chí theo hồ sơ** (`src/ui/criteriaChecklist.js`):
  6 tiêu chí, mỗi tiêu chí một trạng thái ĐẠT / KHÔNG ĐẠT / CHƯA ĐO kèm
  bằng chứng; mặc định toàn bộ là CHƯA ĐO cho tới khi có dữ liệu đo
  thật của chính hồ sơ đó.
- **Trải nghiệm lần đầu:** kết quả cấp danh tính được thông báo ngay
  sau khi tạo hồ sơ (đã cấp / không cấp được kèm lý do / blob không
  hợp lệ); nút "Cấp danh tính" cho hồ sơ đã tồn tại; nhãn hàng hồ sơ
  nói đúng trạng thái; hộp thoại engine hiển thị lý do bằng tiếng Việt
  kèm bước khắc phục.
- **Thu gọn dữ liệu qua Local API:** payload hồ sơ qua HTTP không còn
  chứa trường ghi chú (`notes`) và blob danh tính — thay bằng siêu dữ
  liệu nguồn gốc (định dạng, phiên bản, generator, thời điểm sinh).
  Đường dữ liệu đầy đủ qua kho nội bộ/IPC không đổi.
- **Bộ tài liệu khách hàng** (7 phần, `docs/customer-guide/`) và **sổ
  tay người bán** (`docs/seller-runbook/`) — giao kèm ngoài gói cài
  (xem `WHATS-IN-THE-BOX.md`).
- **Hạ tầng kiểm thử:** chuỗi `npm test` 201 bước; thêm
  `npm run test:all` — runner chạy hết mọi bước kể cả khi có bước
  fail và in bảng tổng kết đầy đủ (`test/run-all.js`).
- **Đóng gói:** `electron-builder` ghim đúng bản `25.1.8` trong
  `devDependencies` + lockfile (trước đây chỉ ghim ở lệnh build,
  lockfile không có mục nào — cây phụ thuộc phân giải lại mỗi lần
  build); glob payload của gói cài đã thu hẹp (xem mục Sửa lỗi).

### Sửa lỗi (lỗi thật, có test hồi quy)

1. **Cấp danh tính mất locale** (`camoufoxProvisioning.js`, commit
   `e82e601`): mã cấp danh tính đọc trường `fingerprint.language`
   (số ít) — trường không tồn tại trong chuẩn dữ liệu của repo (mảng
   `languages`) — nên hồ sơ khai vi-VN nhận danh tính mà kỳ vọng
   ngôn ngữ rỗng. Nay locale lấy từ `languages[0]`, và danh tính
   sinh ra được đối chiếu với hồ sơ ngay tại lúc cấp
   (`assertIdentityMatchesProfile`): mâu thuẫn thì trạng thái
   `invalid`, blob không bao giờ được gắn.
2. **Bảng kiểm tiêu chí không bao giờ hiện dữ liệu thật**
   (`criteriaChecklist.js`, commit `c897f14`): khung hiển thị gọi
   provider dữ liệu như hàm đồng bộ trong khi provider là bất đồng
   bộ → luôn rơi về mặc định toàn CHƯA ĐO. Đã sửa: hiện mặc định
   trong lúc chờ, vẽ lại khi dữ liệu về, bỏ kết quả cũ khi đổi hồ
   sơ, provider lỗi thì về mặc định.
3. **Xoá hẳn hồ sơ để sót dữ liệu phiên** (`src/db/store.js`,
   commit `e3a6558`): ứng dụng ghi dữ liệu hồ sơ dưới **bốn** gốc
   (`profiles/`, `gecko-profiles/`, `camoufox-profiles/`,
   `extensions/`) nhưng đường xoá chỉ dọn **hai** gốc đầu — hồ sơ
   Camoufox đã "xoá hẳn" vẫn còn nguyên cookie/localStorage trên
   đĩa vô thời hạn. Nay một hằng dùng chung `PROFILE_DATA_ROOTS`
   điều khiển cả ba đường xoá; kiểm chứng quét toàn cây sau xoá =
   0 dấu vết, hồ sơ đối chứng không bị đụng.
4. **Mất toàn bộ lịch sử quan sát IP khi file ghi dở**
   (`exitIpObservations.js`, commit `ec15fa5`): kho này ghi thẳng
   vào file đích và nuốt lỗi parse — một lần ghi dở (torn write)
   khiến toàn bộ lịch sử bị xoá lặng lẽ ở lần lưu kế tiếp. Nay ghi
   nguyên tử (file tạm + rename); file không đọc được được giữ lại
   thành bản `.corrupt-<timestamp>` thay vì bị ghi đè.
5. **File license hỏng làm ứng dụng sập ngay khi khởi động**
   (`src/licensing/`, commit `c2a5977`): `license-activation.json`
   hỏng khiến bộ quản lý license ném `SyntaxError` thô ngay trong
   hàm khởi tạo. Nay file kích hoạt hỏng → trạng thái `invalid`,
   chặn dùng (fail-closed, **không** lùi về dùng thử), và kích hoạt
   lại bằng token hợp lệ tự khôi phục; file dùng thử hỏng → lỗi có
   kiểm soát kèm hướng dẫn liên hệ hỗ trợ.
6. **Đóng cổng proxy hai lần khi Camoufox khởi chạy thất bại**
   (`CamoufoxPlaywrightController.js`, commit `fb341a7`): trên
   đường lỗi khởi chạy, gateway proxy bị đóng hai lần. Đã sửa.
7. **Công cụ ký engine có thể bị ép dùng khóa license**
   (`tools/sign-bundled-engine.js`, commit `e72991b`): công cụ ký
   trước đây lấy khóa license làm khóa ký, và gói engine không bị
   kiểm tra nhựa khóa riêng. Nay công cụ từ chối khóa license, bắt
   buộc khóa publisher riêng, và từ chối ký cây engine chứa bất kỳ
   vật liệu khóa riêng nào.
8. **Gói cài từng nuốt tài liệu nội bộ** (`package.json` build
   files): glob cũ đóng gói toàn bộ tài liệu nội bộ (kể cả Hiến
   pháp và hồ sơ QA) vào máy khách, và chỉ loại thư mục tên đúng
   `dist`. Glob nay loại rõ `docs/`, `agents/`, `test/`, `tools/`
   (trừ một script PowerShell cần lúc chạy), `stage0-measure/` và
   các tài liệu nội bộ ở gốc; đã kiểm chứng bằng bản dựng chẩn
   đoán: 0 file cấm lọt, đủ file chạy.
9. **Test license-center chập chờn ~6,2%** (lỗi của test, không
   phải của sản phẩm): phép "làm giả" cũ thay hai ký tự cuối của
   chữ ký Ed25519 — hai ký tự đó mang ít bit có nghĩa nên ~6,2%
   số lần token "bị sửa" vẫn giải mã ra đúng byte gốc và xác thực
   thành công. Đã đổi sang sửa ký tự giữa chữ ký; 40 lần chạy liên
   tiếp + QA độc lập 35 lần: 0 fail.

### Thay đổi hành vi cần biết khi nâng cấp

- Hồ sơ Camoufox chạy trực tiếp (không proxy) vẫn được phép chạy,
  nhưng preflight trả mã trung thực `PREFLIGHT_ONLY` thay vì im
  lặng như trước (chính sách hiển thị cảnh báo cho người dùng nằm
  ở quyết định QD-01, chủ dự án chốt khi đóng băng phát hành).
- Xoá hẳn hồ sơ nay xoá đủ bốn gốc dữ liệu (mục Sửa lỗi 3) — hành
  vi đúng với điều giao diện đã hứa.
- Người dùng API cục bộ không còn nhận `notes` và blob danh tính
  qua HTTP (mục Tính năng mới).

### Giới hạn đã biết (trung thực — đọc trước khi dùng)

- **Chưa nghiệm thu trên máy Windows thật.** CI Windows xanh là
  bằng chứng build + hồi quy trên runner của GitHub, **không** phải
  bằng chứng cài đặt và sử dụng trên máy độc lập (Gate 3 chưa làm).
- **Gói cài không ký Authenticode** (quyết định của chủ dự án,
  2026-10-22): khi cài, Windows SmartScreen hiện cảnh báo "nhà
  phát hành không xác định"; hướng dẫn bấm qua có trong tài liệu
  khách hàng phần 01. Mỗi bản EXE mới là một file mới với
  SmartScreen nên cảnh báo có thể lặp lại theo bản phát hành.
- **Không có engine nào nằm trong gói cài.** Hồ sơ Chromium chạy
  trên Chrome/Edge cài sẵn trên máy khách (hoặc gói engine đóng
  kèm đã ký, giao riêng). Đường cài engine Camoufox trong ứng
  dụng giữ fail-closed cho tới khi có khóa publisher production
  và cây Camoufox Windows chính thức đã ký — bản Preview **không**
  kèm tài sản Camoufox thương mại.
- **Chưa có icon sản phẩm:** ứng dụng dùng icon mặc định của
  Electron.
- **Chưa đo được** (theo sổ đăng ký Mục 4 của Hiến pháp): DNS qua
  tuyến proxy và hành vi DoH; egress qua proxy công cộng thật;
  IPv6/QUIC/TLS echo; STUN/srflx trên mạng có UDP (phòng lab dùng
  để đo không chuyển được UDP — đã kiểm chứng bằng đối chứng nội
  bộ, đây là tính chất của môi trường đo, không phải kết luận về
  trình duyệt); WebGL trên Windows/GPU thật; phân biệt IP
  runtime ≠ manager qua proxy thật; phép đo hồ sơ-có-cấu-hình
  trên CI (chờ áp workflow — Gate 2 phần đo).
- **Kiểm tra cập nhật mới là thư viện nguyên mẫu**
  (`src/update/updateCheck.js`): chưa nối vào ứng dụng, ứng dụng
  **không** tự kiểm tra, tải hay cài bản cập nhật trong bản này;
  công cụ ký manifest cập nhật phía phát hành chưa tồn tại.
- **Ba tiêu chí stage-0 của bảng kiểm vẫn CHƯA ĐO** cho tới khi có
  hồ sơ đo thật theo từng hồ sơ (hợp đồng bản ghi đo đã có, chưa
  có dữ liệu thật).
- **Tính chất engine đã đo được:** sau crash SIGKILL ngay sau khi
  ghi, localStorage có thể lùi về lần commit gần nhất (cửa sổ bền
  vững của cơ chế commit bất đồng bộ trong engine); chờ 10 giây
  nhàn rỗi thì ghi bền vững đạt 15/15. Không quan sát thấy rò rỉ
  chéo giữa các hồ sơ trong cùng điều kiện.
- **Gói license Pro và Business hiện cho cùng một tập tính năng**
  trong code; khác biệt nằm ở tên gói và giới hạn (số hồ sơ tối
  đa) do người bán đặt.
- Hai file `session-snapshots/` do người dùng tự tạo và workflow
  tự động còn tham chiếu hồ sơ đã xoá: đường xoá hiện **không**
  dọn hai nơi này và giao diện chưa công bố điều đó (hạng mục
  F3/F4 — chủ dự án quyết trước khi đóng băng phát hành).
