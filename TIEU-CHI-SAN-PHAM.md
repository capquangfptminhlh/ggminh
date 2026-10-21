# TIÊU CHÍ SẢN PHẨM — LHM Ads Browser

> File này là nguồn tiêu chí duy nhất và bắt buộc cho mọi người/agent làm việc
> trên dự án này. Mọi thiết kế, mã nguồn, phép đo và báo cáo phải đối chiếu
> với file này. Nếu một đề xuất mâu thuẫn với file này, đề xuất đó sai —
> không tự ý diễn giải lại tiêu chí của chủ dự án.
> Cập nhật gốc: 2026-10-21, theo các quyết định đã chốt của chủ dự án.
> Bản v1.1 (2026-10-21): bổ sung 6 mục do chủ dự án duyệt — học thuyết độ
> mạnh tín hiệu (Mục 5), quy tắc theo engine (Mục 8), phạm vi kết luận =
> phạm vi đã đo (Mục 3.5, Mục 6), kỷ luật phát ngôn (Mục 11), chuỗi cổng
> nghiệm thu (Mục 12), một nguồn sự thật cho code (Mục 13).
> Bản v1.2 (2026-10-21): Mục 4 mở rộng thành bản đăng ký chi tiết từng
> điểm quét (cách quan sát — xử lý bắt buộc — trạng thái đo), theo yêu cầu
> của chủ dự án: danh mục điểm quét là phần quan trọng nhất của Hiến pháp.

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
5. **Phạm vi kết luận = phạm vi đã đo** — một kết luận "sạch" chỉ có giá
   trị trên đúng những điểm đã có phép đo. Điểm chưa có đầu đo phải ghi
   CHƯA ĐO, không bao giờ được im lặng bỏ qua như thể đã đạt.

## 4. Nền tảng quét gì — danh mục điểm quét (Google/Facebook)

**Đây là phần quan trọng nhất của Hiến pháp — là "đề bài" cho mọi tính
năng và mọi phép đo.** Mục tiêu bao phủ: *mọi* điểm quét đã biết đều có
(a) một quyết định xử lý theo Mục 5 và (b) một phép đo xác nhận. Không
điểm nào được bỏ trống hoặc im lặng cho qua. Đây là bao phủ 100% danh
mục — không phải hứa hẹn vượt qua 100% kiểm tra của nền tảng (Mục 7,
Mục 11): kết quả mỗi lần thử do nền tảng quyết định và còn phụ thuộc
tín hiệu ngoài trình duyệt.

Danh mục là tài liệu sống: phát hiện điểm quét mới thì bổ sung vào đây
trước, rồi mới làm tính năng. Cột *Trạng thái* là sổ đo sống — mọi PR
chạm vào một điểm phải cập nhật trạng thái của điểm đó (ĐẠT = đã có
phép đo xác nhận trên đường chạy thật; CHƯA ĐO = chưa có phép đo).

Quy ước xử lý viết tắt: **E** = sinh mới nhất quán ở tầng engine
(Mục 5.1); **G** = giữ giá trị engine/máy thật (Mục 5.2); **C** = chặn
bề mặt hoặc cảnh báo (Mục 5.3); **Đ** = đo lại sau khi chạy (Mục 5.4,
áp dụng cho mọi điểm).

### 4.1 Mạng (nền tảng quan sát ở phía kết nối/máy chủ)

| Điểm quét | Cách quan sát | Xử lý | Trạng thái |
|---|---|---|---|
| IP thoát (địa chỉ, ASN, loại mạng) | máy chủ thấy trực tiếp | proxy theo hồ sơ; chất lượng IP ngoài phạm vi | ĐÃ CÓ đầu đo trong ứng dụng (quan sát IP thoát) |
| Chung IP / chung /24 giữa các hồ sơ | đối chiếu nhiều tài khoản | cảnh báo qua GraphDefense + cảnh báo IP tự động | ĐÃ CÓ module, chưa nối ứng dụng |
| WebRTC ICE candidates (host/srflx) | RTCPeerConnection phía trang | C: cấu hình không lộ IP thật; srflx phải khớp IP thoát | CHƯA ĐO |
| DNS — máy chủ phân giải thật | tên miền kiểm soát + nhật ký phân giải | phân giải qua tuyến proxy | CHƯA ĐO |
| TLS fingerprint (JA3/JA4) | bản tin bắt tay TLS | G | CHƯA ĐO |
| HTTP/2 fingerprint (SETTINGS, thứ tự pseudo-header) | khung kết nối | G | CHƯA ĐO |
| Thứ tự/giá trị HTTP header | máy chủ ghi lại | G (mặc định engine) | CHƯA ĐO trong sản phẩm (đã có công cụ đo ngoài) |
| IPv6 lộ song song IPv4 | kết nối địa chỉ kép | C: tuyến v6 khớp tuyến v4 hoặc tắt | CHƯA ĐO |
| Khớp địa lý IP ↔ múi giờ/ngôn ngữ | đối chiếu IP geo với giá trị hồ sơ | E cho múi giờ/ngôn ngữ + cảnh báo khi lệch | ĐÃ kiểm tra ở mức cấu hình (preflight); CHƯA ĐO trên đường chạy |
| QUIC/UDP rò tuyến | kết nối HTTP/3 | C: ép qua proxy hoặc tắt khi có proxy | CHƯA ĐO |

### 4.2 Navigator và thiết bị (đọc bằng JavaScript phía trang)

| Điểm quét | Cách quan sát | Xử lý | Trạng thái |
|---|---|---|---|
| userAgent + appVersion | navigator | E (cả bộ danh tính) / Chromium: tham số khởi chạy khớp phiên bản engine thật | ĐÃ ĐO (snapshot Stage-0 + chứng minh D1) |
| Client Hints: brands, mobile, platform | navigator.userAgentData | E/G theo engine; phải khớp UA | CHƯA ĐO |
| Client Hints độ phân giải cao: platformVersion, architecture, bitness, model, fullVersionList, formFactor | getHighEntropyValues | phải khớp UA + platform đã khai | CHƯA ĐO |
| platform / oscpu | navigator | E | ĐÃ ĐO (snapshot + D1) |
| hardwareConcurrency, deviceMemory | navigator | E | ĐÃ ĐO (snapshot + D1) |
| Màn hình: width/height/availWidth/availHeight/colorDepth/pixelDepth | screen | E | ĐÃ ĐO (snapshot + D1) |
| Cửa sổ: inner/outer, devicePixelRatio | window | E/G; không được mâu thuẫn với screen | CHƯA ĐO |
| language + languages | navigator | E (bốc cùng bộ danh tính; khớp IP geo — cảnh báo khi lệch) | ĐÃ ĐO (snapshot + D1) |
| Múi giờ | Intl.DateTimeFormat().resolvedOptions() | E (Camoufox: qua danh tính; Chromium điều khiển: CDP) | ĐÃ ĐO (snapshot + D1) |
| Định dạng locale (ngày/giờ/số) | Intl.DateTimeFormat/NumberFormat | E, khớp language | CHƯA ĐO |
| webdriver + dấu hiệu tự động hóa | navigator.webdriver, thuộc tính lạ trên window/document | C/G: không để lộ dấu hiệu của tầng điều khiển khi hồ sơ chạy thường | CHƯA ĐO |
| plugins, mimeTypes, pdfViewerEnabled | navigator | G (theo engine) | CHƯA ĐO |
| maxTouchPoints | navigator | E/G khớp loại thiết bị đã khai | CHƯA ĐO |
| cookieEnabled, doNotTrack, globalPrivacyControl | navigator | G | CHƯA ĐO |
| Tín hiệu hiển thị: color scheme, reduced motion, contrast, forced colors | matchMedia | G | CHƯA ĐO |
| networkInformation (effectiveType, downlink, rtt, saveData) | navigator.connection | G | CHƯA ĐO |
| Ước lượng lưu trữ, trạng thái bền lưu trữ | navigator.storage | G; dung lượng không được trùng bất thường giữa hồ sơ | CHƯA ĐO |
| Bố cục bàn phím | navigator.keyboard.getLayoutMap | G | CHƯA ĐO |
| Pin (chỉ Chromium) | navigator.getBattery | G | CHƯA ĐO |

### 4.3 Đồ họa và âm thanh (dấu vết suy ra từ kết xuất)

| Điểm quét | Cách quan sát | Xử lý | Trạng thái |
|---|---|---|---|
| Canvas 2D (hash ảnh kết xuất) | toDataURL/getImageData sau khi vẽ chữ+hình | E; mọi đường xuất phải cho cùng dữ liệu pixel của cùng một bộ danh tính | CHƯA ĐO |
| Số đo chữ (font metrics qua canvas/ DOM) | đo kích thước text | E/G theo bộ danh tính | CHƯA ĐO |
| WebGL vendor + renderer (kể cả bản không che) | getParameter + WEBGL_debug_renderer_info | E | Có trong danh tính D1; CHƯA có đầu đo |
| WebGL: danh sách extensions | getSupportedExtensions | E | CHƯA ĐO |
| WebGL: các tham số (kích thước texture, số đơn vị texture, số thuộc tính đỉnh, dải điểm/đường...) | getParameter (hàng chục tham số) | E — phải thuộc cùng một GPU khả tín với vendor/renderer | CHƯA ĐO |
| WebGL: độ chính xác shader | getShaderPrecisionFormat | E | CHƯA ĐO |
| WebGL: hash ảnh kết xuất 3D | readPixels/toDataURL trên ngữ cảnh WebGL | E | CHƯA ĐO |
| OffscreenCanvas | kết xuất ngoài luồng chính | E như canvas thường | CHƯA ĐO |
| AudioContext: sampleRate, baseLatency, outputLatency, maxChannelCount | ngữ cảnh âm thanh | E | CHƯA ĐO |
| AudioContext: hash tín hiệu (oscillator + analyser/compressor) | kết xuất âm thanh ngoại tuyến | E | CHƯA ĐO |

### 4.4 Fonts, giọng đọc, thiết bị ngoại vi

| Điểm quét | Cách quan sát | Xử lý | Trạng thái |
|---|---|---|---|
| Danh sách font dò được | đo độ rộng chữ với font ứng viên / Font Loading API | E (bộ font của thiết bị trong danh tính) | CHƯA ĐO |
| Giọng đọc hệ thống | speechSynthesis.getVoices | E | CHƯA ĐO |
| Camera/micro/loa: số lượng, nhãn, id nhóm | enumerateDevices | G/E; số lượng không mâu thuẫn loại thiết bị | CHƯA ĐO |
| Trạng thái quyền (thông báo, vị trí, clipboard...) | Permissions API | G | CHƯA ĐO |

### 4.5 Lưu trữ và định danh trên trình duyệt

| Điểm quét | Cách quan sát | Xử lý | Trạng thái |
|---|---|---|---|
| Cookie bên thứ nhất/thứ ba — Google: GAIA/NID/SID; Facebook: datr/sb/fr/c_user/_fbp | máy chủ + document.cookie | mỗi hồ sơ một vùng chứa riêng, bắt đầu từ rỗng | ĐẠT (đo cách ly 20/20 trên runner Windows) |
| localStorage / sessionStorage | JavaScript | tách theo hồ sơ | ĐẠT (20/20) |
| IndexedDB | JavaScript | tách theo hồ sơ | ĐẠT (20/20) |
| Cache Storage + Service Worker | JavaScript | tách theo hồ sơ | ĐẠT (20/20) |
| ETag / cache HTTP dùng làm định danh | máy chủ gán + đọc lại | cache thuộc vùng chứa của hồ sơ | CHƯA ĐO |
| Favicon cache (F-Cache) | máy chủ quan sát yêu cầu favicon | thuộc vùng chứa của hồ sơ | CHƯA ĐO |
| HSTS / Alt-Svc cache | hành vi kết nối | thuộc vùng chứa của hồ sơ | CHƯA ĐO |
| Lịch sử đăng nhập chéo trong cùng trình duyệt | trang đăng nhập nền tảng gợi ý tài khoản đã từng đăng nhập | vùng chứa tách bạch từ rỗng; C: cảnh báo khi đăng nhập nhiều tài khoản vào cùng một hồ sơ | CHƯA ĐO |

### 4.6 Hành vi và thời gian

| Điểm quét | Cách quan sát | Xử lý | Trạng thái |
|---|---|---|---|
| Mở/đóng đồng bộ nhiều hồ sơ | máy chủ quan sát phiên | C: cảnh báo mẫu hành vi liên hồ sơ (D2) | ĐÃ CÓ module, chưa nối ứng dụng |
| Chuỗi thao tác giống hệt nhau giữa các hồ sơ | đối chiếu chuỗi sự kiện | C: cảnh báo D2 | ĐÃ CÓ module, chưa nối ứng dụng |
| Nhịp thao tác đều như máy (khoảng cách sự kiện quá đều) | thống kê phía nền tảng | C: cảnh báo D2 | ĐÃ CÓ module, chưa nối ứng dụng |
| Tốc độ tạo tài khoản/thao tác dồn dập | thống kê phía nền tảng | C: cảnh báo vận hành | CHƯA CÓ |
| Độ phân giải đồng hồ + jitter thời gian | performance.now, timestamp sự kiện | G (theo engine; cấm can thiệp làm lệch) | CHƯA ĐO |

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

### Độ mạnh của tín hiệu liên kết (thứ tự ưu tiên xử lý)

1. Mạnh nhất: **lưu trữ dùng chung** (cookie/định danh đăng nhập) và
   **IP thoát dùng chung** — xử lý hai lớp này trước mọi thứ khác.
2. Tiếp theo: **cả bộ dấu vết là một thiết bị khả tín, nhất quán** —
   giá trị nằm ở tính nhất quán của cả bộ, không ở từng giá trị riêng.
3. Yếu tự nó: **dấu vết trùng nhau giữa các hồ sơ** — hàng triệu người
   dùng thật dùng chung mẫu máy/phiên bản trình duyệt; trùng dấu vết
   không tự nó kết luận được "cùng một người", và khác dấu vết cũng
   không tách được hồ sơ dùng chung lưu trữ/IP/thanh toán.
4. Hệ quả bắt buộc: **cấm tính năng cho cảm giác an toàn giả** — không
   làm nút/công tắc đổi một giá trị đơn độc (ví dụ đổi riêng User
   Agent) khiến người dùng tưởng hồ sơ đã thành người khác. Muốn khác
   thì sinh lại cả bộ danh tính theo Mục 5.1.

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
nền tảng. Bảng kiểm chỉ phủ đúng các điểm đã có đầu đo (Mục 3.5);
điểm nào trong danh mục Mục 4 chưa đo được thì tiêu chí tương ứng bắt
buộc là CHƯA ĐO.

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

### Áp dụng nguyên tắc theo từng engine

- **Chromium, chế độ native:** không can thiệp giá trị nào; hồ sơ dùng
  môi trường thật của trình duyệt đã cài.
- **Chromium, chế độ tùy chỉnh:** UA chỉ đặt qua tham số khởi chạy
  (`--user-agent`), phải sinh theo đúng phiên bản engine thật của
  trình duyệt đã chọn và khớp Client Hints; việc ghi đè bằng
  JavaScript (extension shim) là phương án heuristic, phải được cảnh
  báo là không đảm bảo nhất quán tầng gốc. Múi giờ theo hồ sơ qua CDP
  `Emulation.setTimezoneOverride` chỉ áp dụng cho phiên đang được
  điều khiển — không khẳng định hiệu lực cho phiên chạy tay.
- **Camoufox:** danh tính chỉ qua cơ chế chính thức của thư viện
  (danh tính fpgen được ghim và phát lại qua `CAMOU_CONFIG`); cấm đặt
  tay từng khóa cấu hình; UA là một thành phần của cả bộ danh tính,
  không có đường đổi riêng.
- **Firefox/Gecko thường:** chỉ chạy tay (automation bị API từ chối
  theo fail-closed), không áp cấu hình dấu vết riêng.

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

## 11. Kỷ luật phát ngôn và thương mại

Áp dụng cho mọi văn bản hướng ra ngoài (trang bán hàng, quảng cáo,
bài giới thiệu, câu chữ trong ứng dụng) và mọi báo cáo nội bộ:

1. Cấm con số phần trăm không có phép đo đứng sau (kiểu "vô hiệu hóa
   90% bẫy"). Muốn nói tỉ lệ phải có tập đo và phương pháp đo.
2. Cấm khẳng định sự thật về đối thủ khi chưa tự kiểm chứng được bằng
   bằng chứng. Định vị của LHM chỉ dựa trên những gì LHM đo được về
   chính LHM (ví dụ: local-first, kiểm chứng được) — không dựa trên
   lỗi bị gán cho đối thủ.
3. Cấm câu chữ bảo chứng an toàn tài khoản (kiểu "hồ sơ này AN TOÀN
   để chạy Ads"). Cách diễn đạt duy nhất được phép: liệt kê tiêu chí
   đã đo và trạng thái của chúng, kèm số đo.
4. Cấm tuyệt đối hóa: "không bao giờ", "100%", "luôn là người mới",
   "đè bẹp nền tảng". Nền tảng thay đổi liên tục; mọi khẳng định phải
   có thời điểm và phạm vi đo.
5. Báo cáo của agent ngoài (kể cả văn phong tích cực, khen sản phẩm)
   vẫn phải qua kiểm chứng độc lập như mọi báo cáo khác (Mục 9.2).

## 12. Chuỗi cổng nghiệm thu (thứ tự bắt buộc trước phát hành)

Không bước nào được bỏ qua hay đảo thứ tự:

1. Test đơn vị + test tích hợp cục bộ đạt trên code của chính nhánh.
2. CI Windows trên nhánh đó đạt, gồm cả các phép đo chạy trên runner
   Windows (không chỉ build/đóng gói).
3. Đo và nghiệm thu trên máy Windows thật của chủ dự án bằng EXE đã
   cài đặt, có gói bằng chứng (báo cáo đo, ảnh chụp, nhật ký).
4. Chỉ sau cổng 3, chủ dự án mới quyết định gắn tag và gộp vào
   `main`. Agent đề xuất, chủ dự án quyết.

## 13. Một nguồn sự thật cho code + quản trị file này

1. Mọi thay đổi code phải nằm trên một nhánh GitHub có tên rõ ràng.
   Thay đổi chỉ tồn tại ở máy local (chưa commit/chưa đẩy) không được
   tính là "đã làm" trong bất kỳ báo cáo nào; phải đẩy lên trước khi
   báo cáo hoàn thành.
2. Không để nhiều trạng thái code song song không ai đối chiếu (bản
   local, bản gửi đi, bản trên GitHub). Khi phát hiện lệch nhau, việc
   đầu tiên là đối chiếu và hợp nhất về một trạng thái duy nhất, có
   ghi lại.
3. File tiêu chí này chỉ thay đổi theo quyết định của chủ dự án.
   Agent được đề xuất sửa đổi kèm lý do; không tự ý sửa tiêu chí để
   hợp thức hóa việc mình đã làm.
