# Thiết kế chiến lược engine và cô lập danh tính trình duyệt

**Ngày:** 2026-11-07

**Phạm vi:** Chromium, Firefox và Camoufox trong LHM Ads Browser

**Trạng thái:** Đã được chủ dự án duyệt; đối chiếu lại với `main` tại
`82b6cd8` ngày 2026-11-09

## 1. Mục tiêu

Sản phẩm phải tạo các hồ sơ trình duyệt có dữ liệu tách biệt, trạng thái kỹ
thuật trung thực và cách phát hành engine an toàn. Một hồ sơ mới không được
đọc cookie, cache, localStorage, IndexedDB, Service Worker, lịch sử tải xuống,
extension hoặc dữ liệu phiên của hồ sơ khác.

Fingerprint phải nhất quán với khả năng thật của từng engine:

- Chromium và Firefox mặc định dùng tín hiệu native của engine.
- Camoufox có thể dùng danh tính do generator chính thức tạo, lưu cố định theo
  hồ sơ và kiểm tra lại trước mỗi lần mở.
- UI không gọi một tập cấu hình là "đầy đủ", "an toàn" hoặc "không thể liên
  kết" khi chưa có phép đo runtime tương ứng.

## 2. Hiện trạng đã đối chiếu

### Chromium

`src/engine/fingerprint.js` vẫn có đường cấu hình thử nghiệm cho hồ sơ cũ, nhưng
hồ sơ mới mặc định dùng native. `src/privacy/fingerprintAudit.js` và UI hiện đã
ghi rõ đây là kiểm tra cấu hình, không phải điểm chống nhận diện. Bộ đo runtime
đã có đầu đo WebGL, Canvas, Audio, fonts, voices và Client Hints trong
`stage0-measure/core.js`; bằng chứng chỉ có giá trị khi được chạy trên engine
thật và gắn đúng commit, engine hash và profile.

### Firefox

UI bắt buộc Gecko dùng `fingerprint.mode = native`. Đường launch Firefox không
áp extension fingerprint Chromium. Cô lập cookie, HttpOnly cookie,
localStorage, IndexedDB, Cache Storage và HTTP cache đã đo đạt trên Firefox thật;
Firefox vẫn dùng tín hiệu native, không giả vờ có danh tính tùy chỉnh riêng.

### Camoufox

Repo đã có:

- profile directory riêng trong `camoufox-profiles/{profile-id}`;
- danh tính `CAMOU_CONFIG` do generator chính thức tạo và ghim theo hồ sơ;
- kiểm tra blob, expectation và mâu thuẫn OS/UA/platform/timezone/screen;
- kiểm tra chữ ký publisher, manifest và SHA-256 cho engine;
- bài đo cách ly dữ liệu và bài đo WebRTC/DNS trên Windows CI;
- native adapter cho cửa sổ Camoufox thủ công.
- chuỗi cung ứng hoàn chỉnh ở mức code/test: trust anchor riêng, ký manifest,
  descriptor tải HTTPS ghim nguồn/hash/dung lượng, staging, kiểm toàn bộ cây và
  rollback khi lỗi;
- đầu đo mở rộng và kho bản ghi phép đo theo hồ sơ.

Các chặn production còn lại là **artifact thật** của publisher chưa tồn tại
trong repo (`resources/camoufox-engine` mới có README), chưa có archive/release
descriptor thật để phân phối, proxy native vẫn phụ thuộc cờ lab trong dev, và
chưa có nghiệm thu tài nguyên/Windows sạch cho bản đóng gói. Playwright
controller tiếp tục bị khóa trong packaged app theo quyết định thiết kế.

## 3. Quyết định thiết kế

### 3.1 Vai trò từng engine

| Engine | Vai trò production | Fingerprint | Phân phối |
|---|---|---|---|
| Chromium | Mặc định, nhẹ, tương thích rộng | Native | Dùng Chrome/Edge đã cài hoặc engine đã được phê duyệt |
| Firefox | Lựa chọn Gecko nhẹ hơn | Native | Dùng Firefox đã cài |
| Camoufox | Module nâng cao tùy chọn | Danh tính chính thức ghim theo hồ sơ | Tải riêng, ký publisher, kiểm hash |

Chế độ fingerprint Chromium bằng extension cũ không được chọn mặc định cho hồ
sơ mới. Hồ sơ cũ vẫn đọc được nhưng UI gắn nhãn "Thử nghiệm — chưa kiểm chứng"
và cung cấp thao tác chuyển về native; không tự sửa hồ sơ của người dùng.

### 3.2 Camoufox production đợt đầu

Chỉ mở đường `CamoufoxAdapter` chạy cửa sổ thủ công. Giữ
`CamoufoxPlaywrightController` và các endpoint automation ở trạng thái lab-only.
Như vậy người dùng có thể tạo, mở, dừng và lưu hồ sơ Camoufox mà không đưa thêm
automation vào bề mặt phát hành.

Camoufox chỉ được đánh dấu "Sẵn sàng" khi đồng thời thỏa:

1. Windows x64 tương thích.
2. Public key publisher engine hợp lệ có trong app.
3. Gói engine cài đặt có manifest ký hợp lệ.
4. Mọi file, kích thước và SHA-256 khớp manifest.
5. Danh tính hồ sơ được cấp hợp lệ và không mâu thuẫn cấu hình.
6. Cấu hình mạng thuộc tập đã nghiệm thu.

Thiếu bất kỳ điều kiện nào phải fail closed với mã lỗi và hướng xử lý rõ ràng.

### 3.3 Khóa và phân phối engine

Tạo một cặp Ed25519 dành riêng cho **engine publisher**, dùng cho các engine LHM
phát hành. Khóa này tách khỏi khóa license và khóa cập nhật ứng dụng. Private key
được mã hóa, lưu ngoài repo và ngoài máy build thường ngày. Code ký, xác minh,
tải và cài đã có; việc còn lại là nghi thức tạo khóa thật, đưa public key vào
trust anchor, ghim fingerprint SPKI bằng test và phát hành artifact thật.

Camoufox được phát hành dưới dạng archive tải theo yêu cầu:

1. App tải descriptor nhỏ qua HTTPS từ kênh cố định.
2. App xác minh chữ ký descriptor trước khi tin URL, kích thước hoặc hash.
3. Người dùng xác nhận tải gói lớn.
4. App tải vào file tạm, giới hạn kích thước, không theo redirect ngoài allowlist.
5. App kiểm archive SHA-256 rồi giải nén bằng script đã đóng gói.
6. App kiểm lại manifest và toàn bộ cây file sau giải nén.
7. Chỉ sau đó mới chuyển thư mục staging thành engine đang dùng.

Không ghi đè engine hợp lệ bằng bản lỗi. Khi cập nhật thất bại, giữ nguyên bản cũ
và dọn staging có kiểm soát.

### 3.4 Danh tính và dữ liệu hồ sơ

Mỗi hồ sơ có các vùng riêng:

- browser profile directory;
- cookie, cache, localStorage, IndexedDB và Service Worker;
- extension directory nếu engine hỗ trợ;
- thư mục download;
- snapshot/backup;
- Camoufox identity blob và expectation;
- bản ghi phép đo gắn profile ID và engine version.

Camoufox identity được sinh đúng một lần khi provisioning. App không tự tạo lại
mỗi lần mở. Regenerate là thao tác có xác nhận, chỉ thực hiện khi hồ sơ đang đóng
và phải làm mất hiệu lực các phép đo cũ của hồ sơ đó.

### 3.5 Chính sách mạng

Đường proxy Camoufox production thay cờ môi trường lab bằng capability policy
được đóng gói và kiểm thử. Chỉ HTTP CONNECT và SOCKS5 qua gateway loopback đã
được hỗ trợ mới được mở; credential vẫn nằm trong vault.

Với hồ sơ proxied, các preference chống rò đã đo phải luôn được áp lại trước khi
mở: WebRTC chỉ qua proxy, không host candidate, tắt DNS prefetch, predictor,
HTTP/3, connectivity checks và DoH bootstrap cục bộ. Nếu gateway, vault hoặc
peer guard không sẵn sàng thì chặn mở; không fallback sang direct.

Direct vẫn là một lựa chọn riêng nhưng UI phải báo rằng IP và DNS thật của máy
sẽ được dùng. Kết quả đo hiện tại cho thấy direct xuất hiện `srflx`; vì vậy direct
không được mô tả là cô lập mạng.

### 3.6 Kiểm soát tài nguyên

Engine chỉ cài một lần, nhưng mỗi hồ sơ mở đồng thời có process và working set
riêng. Sản phẩm phải có Resource Guard:

- quan sát RAM hệ thống, RAM theo cây process, CPU và số tab/process;
- hiển thị tài nguyên của từng hồ sơ đang chạy;
- cảnh báo trước khi mở thêm nếu không còn headroom;
- cho phép đóng hàng loạt hồ sơ không hoạt động;
- không đặt giới hạn thương mại cố định trước khi có benchmark.

Trước General Availability phải benchmark máy Windows 8 GB, 16 GB và 32 GB với
trang nhẹ và trang nặng. Bảng giới hạn phát hành phải giữ tối thiểu 20% RAM hệ
thống chưa sử dụng ở P95; nếu không đạt thì giảm số phiên khuyến nghị. Giới hạn
được công bố là khuyến nghị vận hành, không phải lời hứa mọi website dùng cùng
mức tài nguyên.

### 3.7 Runtime measurement và UI trung thực

Mỗi engine hiển thị ba loại trạng thái tách biệt:

- **Cấu hình:** native, pinned hoặc experimental.
- **Đã quan sát:** giá trị runtime thực sự đo trong phiên cụ thể.
- **Chưa đo/ngoài trình duyệt:** TLS/JA4, tài khoản, thanh toán và các tín hiệu
  chưa có đầu đo.

Các trường runtime tối thiểu cho Camoufox GA: UA, platform, language(s), timezone,
screen, DPR, hardwareConcurrency, WebGL vendor/renderer, Canvas hash, Audio hash,
WebRTC candidates, DNS observation và IP egress. Đầu đo trình duyệt đã có phần
thiết bị/rendering; DNS/IP/WebRTC vẫn phải lấy từ phép đo mạng thật. Một giá trị
ghim không được tự động coi là giá trị đã quan sát.

## 4. Luồng chính

### Cài Camoufox

`Người dùng bấm Cài` → kiểm license/quyền tính năng → tải descriptor → xác minh
publisher → xác nhận dung lượng → tải archive → kiểm hash → giải nén staging →
kiểm toàn bộ cây → chuyển thành active engine → hiển thị version và bằng chứng.

### Tạo hồ sơ Camoufox

`Tạo hồ sơ` → tạo profile ID → tạo thư mục riêng → chạy generator chính thức →
validate và lưu identity → lưu expectation → trạng thái "Đã ghim, chưa đo".

### Mở hồ sơ Camoufox

`Mở` → kiểm engine/signature → kiểm identity → kiểm profile directory → kiểm
network policy/vault/gateway → áp prefs/download directory → kiểm Resource Guard
→ spawn native window → xác nhận window thuộc process tree → ghi session.

### Đóng hồ sơ Camoufox

`Đóng` → yêu cầu đóng cửa sổ mềm → chờ engine flush dữ liệu → timeout mới kill →
đóng gateway → ghi kết quả phiên. Không xóa profile hay regenerate identity.

## 5. Xử lý lỗi

- **ENGINE_TRUST_MISSING:** thiếu public key hoặc descriptor; hướng dẫn cài engine
  chính thức, không cho chọn file EXE tùy ý.
- **ENGINE_SIGNATURE_INVALID:** dừng, giữ engine cũ và báo kênh phát hành không
  hợp lệ.
- **IDENTITY_INVALID / IDENTITY_MISMATCH:** chặn mở và cho phép reprovision qua
  thao tác có xác nhận.
- **NETWORK_BLOCKED:** chỉ rõ thiếu vault, gateway, proxy mismatch hay policy chưa
  hỗ trợ; tuyệt đối không fallback direct.
- **RESOURCE_LIMIT:** không mở thêm; đề nghị đóng hồ sơ khác.
- **STARTUP_TIMEOUT:** dừng process tree vừa tạo, đóng gateway và giữ dữ liệu hồ
  sơ để thử lại.

Thông báo không dùng từ "ẩn danh", "không thể liên kết" hoặc "100% an toàn".

## 6. Kiểm thử và tiêu chí nghiệm thu

### Test tự động

- Trust anchor: đúng key, sai key, key trùng license/update, symlink, file quá lớn.
- Descriptor/archive: sửa một byte, sai size/hash, redirect ngoài allowlist,
  archive traversal, file thừa/thiếu.
- Identity: chunk hỏng, expectation lệch, OS/UA/timezone/screen mâu thuẫn,
  regenerate làm mất hiệu lực measurement cũ.
- Isolation: hai hồ sơ đồng thời không đọc chéo cookie, localStorage, IndexedDB,
  Cache Storage, Service Worker, HTTP cache, favicon cache và download.
- Network: proxy bắt buộc gateway, thiếu credential bị chặn, không direct fallback,
  WebRTC/DNS/QUIC preferences được áp đúng.
- Lifecycle: mở/đóng/restart/crash/kill, process tree sạch, profile vẫn bền.
- Packaged policy: native adapter bật khi trust đầy đủ; Playwright và API automation
  vẫn tắt trong packaged app.
- Resource Guard: tính đúng process tree, cảnh báo/block theo policy phát hành.

### Nghiệm thu Windows thật

- Cài mới trên Windows sạch và nâng cấp từ bản trước.
- Cài Camoufox qua mạng và bằng gói offline chính thức.
- Hai hồ sơ chạy đồng thời, restart và crash recovery.
- Đo runtime fingerprint so với expectation ở hai hồ sơ.
- Đo proxy thật ở xa: IP egress, DNS, IPv4/IPv6, WebRTC và QUIC.
- Benchmark 8/16/32 GB; ghi P50/P95 RAM, CPU, thời gian mở và số phiên khuyến nghị.
- Gỡ cài đặt app không làm mất profile nếu người dùng chưa chọn xóa dữ liệu.

Camoufox chỉ ra khỏi Beta khi mọi mục bắt buộc có bằng chứng gắn đúng commit,
artifact EXE, engine version và môi trường đo.

## 7. Triển khai theo giai đoạn

### Giai đoạn A — Trung thực hóa engine hiện có (đã có trong `main`)

- Chromium/Firefox mặc định native.
- Hạ cấp nhãn custom Chromium thành experimental; giữ tương thích hồ sơ cũ.
- UI tách cấu hình khỏi phép đo và không dùng điểm "anti-detection".

### Giai đoạn B — Chuỗi cung ứng Camoufox (code/test xong, thiếu artifact thật)

- Chủ dự án tạo engine publisher key thật ngoài repo.
- Đưa public trust anchor vào repo và ghim fingerprint SPKI.
- Dựng, ký và phát hành descriptor/archive thật qua luồng tải đã có.

### Giai đoạn C — Mở native Camoufox production (còn phải làm)

- Thay lab proxy flag bằng capability policy đã nghiệm thu.
- Mở native adapter trong packaged app khi trust và policy đạt.
- Giữ Playwright/automation lab-only.
- Hoàn thiện provisioning, lỗi và UI trạng thái.

### Giai đoạn D — Đo và kiểm soát tài nguyên (đầu đo có, Resource Guard còn thiếu)

- Thêm Resource Guard và telemetry cục bộ không gửi server.
- Chạy benchmark 8/16/32 GB.
- Đặt bảng khuyến nghị đồng thời và hoàn thiện tài liệu khách hàng.

### Giai đoạn E — Beta rồi GA

- Phát hành Beta có opt-in cho nhóm nhỏ.
- Thu bằng chứng crash, update, tài nguyên và network.
- Sửa lỗi theo bằng chứng; chỉ GA khi toàn bộ cổng nghiệm thu đạt.

## 8. Hệ quả của thiết kế

Ưu điểm:

- installer chính vẫn nhẹ;
- Camoufox có giá trị riêng mà không trở thành phụ thuộc bắt buộc;
- giảm bề mặt production vì chưa mở automation;
- khóa và gói engine có chuỗi tin cậy rõ;
- trạng thái fingerprint đúng với bằng chứng thực tế;
- có đường mở rộng sau này mà không phá dữ liệu hồ sơ.

Đổi lại:

- khách dùng Camoufox phải tải thêm một gói lớn;
- chủ dự án phải vận hành nghi thức ký engine và kênh phân phối;
- cần nghiệm thu Windows thật và benchmark trước GA;
- Chromium/Firefox không được quảng bá như có fingerprint tùy chỉnh hoàn chỉnh.
