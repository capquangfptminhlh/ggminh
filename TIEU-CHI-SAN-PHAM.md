# TIÊU CHÍ SẢN PHẨM — LHM Ads Browser

> File này là nguồn tiêu chí duy nhất và bắt buộc cho mọi người/agent làm việc
> trên dự án này. Mọi thiết kế, mã nguồn, phép đo và báo cáo phải đối chiếu
> với file này. Nếu một đề xuất mâu thuẫn với file này, đề xuất đó sai —
> không tự ý diễn giải lại tiêu chí của chủ dự án.
> Cập nhật gốc: 2026-10-21, theo các quyết định đã chốt của chủ dự án.

## 1. Mục đích sản phẩm

LHM Ads Browser giúp người vận hành nhiều tài khoản quảng cáo quản lý nhiều
hồ sơ trình duyệt trên một máy Windows, sao cho mỗi hồ sơ **sạch, nhất quán
với chính nó, và không liên đới tới các hồ sơ khác**.

Khách hàng trả tiền cho *sự an toàn khi vận hành nhiều hồ sơ*: hồ sơ tách
biệt thật, môi trường nhất quán, được cảnh báo trước khi thao tác hoặc mạng
làm các hồ sơ dính nhau, dữ liệu nằm trên máy của khách (local-first).
Engine (Chromium/Camoufox) là phương tiện có sẵn — không ai trong dự án
này tự viết nhân trình duyệt.

## 2. Triết lý: nhà phân tích, không phải sản xuất công nghiệp

Chủ dự án là nhà phân tích hiểu cách Google và Facebook nhận diện người
dùng. Sản phẩm đi từ phân tích điểm quét của nền tảng → tính năng → kiểm
chứng. Đối thủ làm kiểu công nghiệp: đổi vài giá trị bề mặt, không phân
biệt được kết quả có sạch hay không, để khách tự setup và tự chịu.
LHM làm ngược lại: phần mềm tự đo và trả lời được "sạch hay chưa sạch"
bằng căn cứ cụ thể, để khách hàng yên tâm ("sướng") vì được báo trước
khi mất tài khoản, không phải mò mẫm.

## 3. Tiêu chuẩn chấp nhận (bất biến)

1. **Không tự mâu thuẫn** — các giá trị một hồ sơ lộ ra phải khớp nhau
   (UA ↔ platform ↔ GPU ↔ fonts ↔ ngôn ngữ ↔ múi giờ).
2. **Không rò rỉ chéo** — dữ liệu và tín hiệu của hồ sơ A không xuất hiện
   ở hồ sơ B.
3. **Đo được và kiểm chứng được** — mọi khẳng định phải có phép đo đi kèm.
   Cấm chấm điểm (score) không có cơ sở đo. Cấm kết luận "nền tảng không
   thể liên kết hồ sơ" từ dấu vết trình duyệt.
4. Tiêu chuẩn thực tế của chủ dự án: tạo Gmail không bị yêu cầu xác minh
   điện thoại = lần thử đó đạt. Đây là *quan sát của một lần thử*, không
   phải bằng chứng cho các lần khác; tài khoản vẫn có thể bị kiểm tra sau.

## 4. Nền tảng quét gì — danh mục điểm quét (Google/Facebook)

Mọi tính năng phải truy được về một điểm trong danh mục này:

- **Mạng:** IP thoát, WebRTC candidates (host/srflx/relay/mDNS), DNS,
  TLS fingerprint, HTTP/2 fingerprint, thứ tự header, IPv6, ASN,
  khớp địa lý IP ↔ múi giờ/ngôn ngữ.
- **Navigator/thiết bị:** UA, Client Hints (kể cả độ phân giải cao),
  platform, oscpu, số nhân CPU, RAM khai báo, màn hình/cửa sổ/DPR/
  độ sâu màu, điểm chạm, ngôn ngữ + danh sách ngôn ngữ, múi giờ,
  locale, webdriver và dấu hiệu tự động hóa, plugins, doNotTrack/GPC.
- **Đồ họa/âm thanh:** canvas (mọi đường xuất phải giải mã về cùng dữ
  liệu pixel trước khi so), WebGL vendor/renderer/extensions/tham số/
  độ chính xác shader, AudioContext (sample rate, độ trễ, số kênh, hash).
- **Fonts/voices/media:** danh sách font dò được + font metrics,
  giọng đọc hệ thống, số lượng/nhãn camera-micro-loa.
- **Lưu trữ/định danh:** cookie (bên thứ nhất/thứ ba; Google: GAIA/NID;
  Facebook: datr/sb/fr/_fbp), localStorage, IndexedDB, Cache Storage,
  Service Worker, ETag/cache, favicon cache, lịch sử đăng nhập trên
  trình duyệt.
- **Hành vi/thời gian:** nhịp gõ phím, quỹ đạo chuột, tốc độ và độ đều
  của thao tác, chuỗi thao tác lặp lại giữa các hồ sơ/tài khoản, giờ
  hoạt động, mở đồng bộ nhiều hồ sơ.

Lưu ý kỹ thuật đã kiểm chứng: so UA phải theo Chrome UA Reduction
(so major + Client Hints; UA rút gọn dạng x.0.0.0 có thể là đúng);
múi giờ theo hồ sơ trên Chromium làm được qua CDP
`Emulation.setTimezoneOverride` cho phiên điều khiển — không khẳng
định "chỉ fork mới làm được"; cách ly lưu trữ không đòi hỏi dấu vết
phải khác nhau; phiên ephemeral / qua checker / `isTrusted=true`
không chứng minh được "người mới" với nền tảng.

## 5. Nguyên tắc làm sạch (cho từng điểm quét một quyết định)

1. **Sinh mới nhất quán ở tầng engine** — dùng cơ chế chính thức của
   engine (với Camoufox: danh tính do thư viện chính thức sinh bằng
   fpgen và ghim cho từng hồ sơ). CẤM tự chế/chắp vá từng thuộc tính
   rời rạc: giá trị mâu thuẫn nhau là tín hiệu lộ mạnh nhất.
2. **Giữ nguyên giá trị engine/máy thật** — với các điểm thuộc về
   engine (TLS/HTTP2 fingerprint...): đổi bằng JavaScript là tự tạo
   mâu thuẫn.
3. **Chặn bề mặt hoặc cảnh báo** — với các điểm không sinh mới được.
4. **Đo lại sau khi chạy** — khai báo khác với giá trị lộ ra = chưa sạch.
5. Ngoài tầm trình duyệt (không hứa, không nhận làm): số điện thoại/
   email khôi phục dùng chung, phương thức thanh toán dùng chung,
   quan hệ bạn bè/Business Manager, uy tín IP.

## 6. Tính năng độc quyền (ẩn): Hộ vệ Liên đới

Tính năng riêng của LHM, chạy ngầm, không phô trương cơ chế ra ngoài:

1. Đo giá trị lộ ra thật của từng hồ sơ đang chạy, đối chiếu với danh
   tính đã ghim của chính nó (khai ≠ lộ → cảnh báo).
2. So chéo toàn bộ đội hồ sơ theo từng cặp: tín hiệu quan sát được nào
   đang trùng nhau (IP thoát//24, bộ giá trị lộ ra, lệch địa lý...).
3. Canh gác liên tục khi vận hành: trôi IP giữa phiên, trôi giá trị
   lộ ra, hành vi đồng bộ — cảnh báo trước khi nền tảng dùng chúng.

Kết luận "sạch" là một **bảng kiểm theo tiêu chí** (tự nhất quán / khớp
danh tính đã ghim / cách ly lưu trữ / không trùng tín hiệu tránh được /
đường mạng đúng khai báo), mỗi tiêu chí: ĐẠT / KHÔNG ĐẠT / CHƯA ĐO kèm
số đo. Không chấm điểm số. Không kết luận về khả năng liên kết của
nền tảng.

Các khối đã có và thuộc tính năng này: Signal Chain Preflight,
danh tính ghim theo hồ sơ (CAMOU_CONFIG), GraphDefense, cảnh báo IP
tự động từ quan sát IP thoát của ứng dụng, cảnh báo mẫu hành vi liên
hồ sơ, Health Drift, bộ đo Stage-0.

## 7. Phạm vi — làm và không làm

**Làm:** quản lý hồ sơ + proxy theo hồ sơ; làm mới môi trường theo
danh mục mục 4; cảnh báo hành vi; cảnh báo IP (từ quan sát của ứng
dụng); kiểm chứng bằng phép đo.

**Không làm:**
- Không vượt qua mọi kiểm tra của nền tảng; không hứa "luôn là người
  mới" hay "100% anti-detect".
- Không đánh giá chất lượng IP — chủ dự án có hệ thống kiểm IP riêng;
  chỉ IP đạt mọi kiểm tra ("xanh") mới được dùng.
- Không cloud sync / team / đồng bộ điều hướng giữa các hồ sơ (hồ sơ
  phải độc lập). Không SQLite migration trong phạm vi hiện tại.
- Không tự viết nhân trình duyệt; không né antivirus/SmartScreen;
  không tải/chạy engine chưa kiểm chứng (digest + chữ ký publisher).

## 8. Kiến trúc đã chốt

- Electron (Chromium) là nền tảng ứng dụng; engine theo từng hồ sơ
  qua EngineFactory: Chromium mặc định, Firefox, Camoufox là adapter
  tùy chọn qua cơ chế launcher chính thức, profile dir riêng.
- Fail-closed ở mọi đường chạy: engine chưa kiểm chứng → chặn;
  mạng không an toàn → `NETWORK_BLOCKED`; API cục bộ trả HTTP 409
  khi engine/controller không khả dụng; **không fallback ngầm** sang
  engine khác.
- Cài đặt engine: chỉ khi người dùng chủ động, từ nguồn phát hành
  chính thức, kiểm tra kích thước + SHA-256 + manifest ký Ed25519
  bằng khóa publisher riêng (không dùng khóa license).

## 9. Kỷ luật làm việc cho mọi agent

1. Đo trước, khẳng định sau. Báo cáo phải tách rõ: *quan sát đo được* /
   *suy luận từ code* / *chưa đo*.
2. Kiểm chứng độc lập mọi báo cáo của agent khác bằng code/dữ liệu
   thật trước khi tin hoặc làm theo.
3. Không lấy CI xanh hay test đơn vị làm căn cứ phát hành. Nghiệm thu
   sản phẩm = EXE cài đặt trên máy Windows thật của chủ dự án.
4. PR giữ Draft cho tới khi chủ dự án quyết định. Không tự gắn tag,
   không tự gộp vào `main`, không xóa nhánh cũ khi chưa được lệnh.
5. Làm đúng phạm vi được giao; việc ngoài phạm vi phải hỏi. Thay đổi
   nhỏ, đúng spec giữ/bỏ đã thống nhất (xem lịch sử quyết định trong
   bộ nhớ dự án); không tự thêm module trùng chức năng đã có.
6. Mâu thuẫn với file này thì dừng và hỏi chủ dự án — không tự sửa
   tiêu chí.

## 10. Mốc kỹ thuật hiện tại (2026-10-21)

- Nhánh tích hợp chọn lọc `integration/v5.8-core-selective`: 7 khối lõi
  đã tích hợp, CI Windows + bộ cài EXE đạt; cách ly lưu trữ hai hồ sơ
  Camoufox 20/20 trên GitHub runner.
- PR #17 (Draft): danh tính ghim theo hồ sơ (D1) + cảnh báo IP tự động
  (D3) + mẫu hành vi liên hồ sơ (D2) ở mức module/engine; đã có kiểm
  chứng engine thật cục bộ; chưa nối luồng tạo hồ sơ trong ứng dụng,
  chưa chạy phép đo cấu hình trên CI Windows (chờ áp file vá workflow),
  chưa nghiệm thu máy Windows thật, chưa gộp `main`, chưa gắn tag.
