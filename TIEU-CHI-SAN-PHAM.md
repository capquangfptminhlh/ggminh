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
> Bản v1.3 (2026-10-21): tích hợp các đính chính đã qua rà soát — nguyên
> tắc nhận định ba mức (Mục 14), định nghĩa "người dùng mới" (Mục 15),
> định nghĩa "sạch" và trạng thái báo cáo (Mục 16), lưu trữ (Mục 17),
> tính nhất quán (Mục 18), diễn giải IP/mạng (Mục 19), hành vi (Mục 20),
> phân biệt web/native/OS (Mục 21), bằng chứng cảnh báo (Mục 22), hồ sơ
> nghiệm thu (Mục 23); Mục 8 phân biệt trạng thái hiện tại và ĐỊNH HƯỚNG
> GECKO do chủ dự án duyệt — ghi định hướng không phải phép đổi code.

## 1. Mục đích sản phẩm

LHM Ads Browser giúp người vận hành nhiều tài khoản quảng cáo quản lý nhiều
hồ sơ trình duyệt trên một máy Windows, sao cho mỗi hồ sơ **sạch, nhất quán với chính nó, dữ liệu được cách ly giữa các
hồ sơ, và được cảnh báo khi có tài nguyên dùng chung quan sát được**
giữa các hồ sơ (định nghĩa "sạch": Mục 16).

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
2. **Không rò rỉ chéo** — dữ liệu riêng của hồ sơ A không bị truy cập
   hoặc dùng lại ngoài chính sách ở hồ sơ B; đặc điểm môi trường dùng
   chung được đánh giá riêng, không gộp vào kết luận cách ly (Mục 17.1).
3. **Đo được và kiểm chứng được** — mọi khẳng định phải có phép đo đi kèm.
   Cấm chấm điểm (score) không có cơ sở đo. Cấm kết luận "nền tảng không
   thể liên kết hồ sơ" từ dấu vết trình duyệt.
4. Tiêu chuẩn thực tế của chủ dự án: tạo Gmail không bị yêu cầu xác minh
   điện thoại = lần thử đó đạt. Cách ghi duy nhất được phép: *"Lần thử
   này hoàn tất mà không xuất hiện yêu cầu xác minh số điện thoại."*
   Đây là quan sát của một lần thử, không phải bằng chứng cho các lần
   khác, và không thay cho nghiệm thu cách ly/mạng (chi tiết: Mục 15).
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

Mức độ mỗi nền tảng thực tế sử dụng từng điểm được ghi riêng theo bằng
chứng; tên gọi "điểm quét" không khẳng định mọi điểm đều được cả hai nền
tảng dùng như nhau. Danh mục là tài liệu sống: phát hiện điểm quét mới
thì bổ sung vào đây trước, rồi mới làm tính năng. Cột *Trạng thái* là sổ đo sống — mọi PR
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
   lộ ra, hành vi đồng bộ — cảnh báo sau khi LHM quan sát thấy sự kiện
   đáp ứng điều kiện cảnh báo, ghi rõ thời điểm và độ trễ đo (Mục 22).

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
- **Trạng thái hiện tại và định hướng engine (chủ dự án duyệt
  2026-10-21):** trong giai đoạn kiểm thử hiện tại, giữ nguyên mặc
  định đang có (Chromium là engine mặc định, Camoufox là adapter tùy
  chọn theo hồ sơ). ĐỊNH HƯỚNG: sau khi engine Gecko được chọn đã
  qua nghiệm thu (tương thích, cập nhật bảo mật, dữ liệu và mạng
  theo chuỗi cổng Mục 12), mặc định tạo hồ sơ MỚI trên giao diện sẽ
  chuyển sang engine Gecko đó. Hồ sơ cũ giữ nguyên engine của chúng;
  API cũ giữ tương thích; Chromium vẫn là lựa chọn khi người dùng
  chủ động chọn; không chuyển ngầm engine khi gặp lỗi. **Việc ghi
  định hướng này vào Hiến pháp không đồng nghĩa đã cho phép đổi mặc
  định trong code** — đổi mặc định chỉ thực hiện theo một quyết định
  riêng của chủ dự án sau nghiệm thu. Tên engine không phải bằng
  chứng về mức riêng tư hay khả năng bị nền tảng nhận diện.
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

## 14. Nguyên tắc nhận định và kiểm chứng

Mọi nhận định trong dự án thuộc đúng một trong ba mức:

1. **Quan sát đo được:** có kết quả từ đúng phiên bản ứng dụng, engine
   và môi trường kiểm thử.
2. **Suy luận kỹ thuật:** giải thích hợp lý từ kiến trúc hoặc quan sát,
   chưa được chứng minh trực tiếp.
3. **Chưa xác minh:** thiếu phép đo, nguồn hoặc điều kiện kiểm thử.

Không được chuyển một suy luận thành sự thật chỉ vì nhiều AI, nhiều
bài viết hoặc nhiều agent cùng nhắc lại. Khi các báo cáo mâu thuẫn,
ưu tiên bằng chứng có thể tái hiện; số lượng bên đồng ý không thay
thế chất lượng kiểm chứng.

Phải phân biệt bốn bước khác nhau: trình duyệt *có thể cung cấp* thông
tin; một trang *đã đọc* thông tin; thông tin *đã truyền* tới máy chủ;
máy chủ *đã dùng* thông tin để ra quyết định. Chứng minh một bước
không tự chứng minh các bước sau.

## 15. "Người dùng mới" và giới hạn nhận diện

"Người dùng mới" có thể mang nhiều nghĩa không tương đương: tài khoản
mới đăng ký; hồ sơ trình duyệt mới tạo; phiên chưa có định danh lưu
trữ trước đó; thiết bị chưa từng được quan sát; một người chưa từng
dùng dịch vụ.

Hồ sơ trình duyệt mới không bảo đảm thiết bị, mạng hoặc người vận
hành là mới đối với nền tảng. Ngược lại, môi trường quen thuộc cũng
không tự đồng nghĩa hoạt động không hợp lệ.

Không giả định nền tảng chỉ có một điểm tín nhiệm chung: nhận ra
phiên, liên hệ tài khoản, đánh giá rủi ro và yêu cầu xác minh có thể
là những quyết định khác nhau, với ngưỡng khác nhau.

Kết quả tạo tài khoản không bị yêu cầu số điện thoại chỉ được ghi
đúng một cách: **"Lần thử này hoàn tất mà không xuất hiện yêu cầu
xác minh số điện thoại."** Không dùng kết quả đó thay cho nghiệm thu
cách ly dữ liệu, quyền riêng tư hoặc an toàn mạng.

## 16. Định nghĩa "sạch" và trạng thái báo cáo

Trong sản phẩm này, "sạch" chỉ có nghĩa là đạt các tiêu chí kỹ thuật
đã kiểm thử trong phạm vi công bố:

- Dữ liệu giữa các hồ sơ được cách ly trong các phép thử đã thực hiện.
- Cấu hình thực tế phù hợp với cấu hình được hỗ trợ và đã khai báo.
- Kết nối đi theo chính sách mạng đã chọn.
- Không phát hiện đường truyền ngoài chính sách trong phạm vi phép đo.
- Không phát hiện thay đổi ngoài dự kiến trong khoảng thời gian quan sát.

Không dùng "sạch" để khẳng định: nền tảng coi đây là người mới; nền
tảng không thể liên hệ các phiên; IP có uy tín tốt; tài khoản sẽ không
bị yêu cầu xác minh hoặc hạn chế.

Trạng thái báo cáo chỉ có ba giá trị: **ĐẠT** (phép thử đã chạy và đáp
ứng điều kiện nghiệm thu cụ thể), **KHÔNG ĐẠT** (phép thử đã chạy và
phát hiện vi phạm), **CHƯA ĐO** (chưa có bằng chứng đủ để kết luận).
API không hỗ trợ, thiếu quyền, timeout và thiếu hạ tầng phải ghi lý
do riêng dưới trạng thái phù hợp — không được chuyển lỗi thu thập dữ
liệu thành ĐẠT. Không xuất kết luận "sạch toàn bộ" khi còn tiêu chí
bắt buộc chưa đo.

## 17. Trình duyệt và dữ liệu lưu trữ

**17.1. Cách ly dữ liệu khác với khác biệt đặc điểm thiết bị.** Hai
hồ sơ có thể cùng GPU, hệ điều hành, fonts hoặc kích thước màn hình
mà vẫn cách ly dữ liệu đúng. Ngược lại, hai hồ sơ có đặc điểm thiết
bị khác nhau vẫn có thể bị dùng lẫn cookie hoặc dữ liệu phiên nếu
triển khai sai. Không dùng fingerprint khác nhau làm bằng chứng cách
ly lưu trữ.

**17.2. Phép thử cách ly phải kiểm tra đường đi của dữ liệu**, bằng
website kiểm thử và dữ liệu tổng hợp do nhóm kiểm soát: ghi dữ liệu
đánh dấu vào hồ sơ A; kiểm tra hồ sơ B không nhận được dữ liệu đó;
đóng và mở lại để kiểm tra tính bền vững; thử chạy đồng thời và sau
khi tiến trình gặp sự cố; kiểm tra các loại lưu trữ trong phạm vi hỗ
trợ (cookie, localStorage, IndexedDB, Cache Storage, Service
Worker). Cơ chế khác như HTTP cache hay favicon cache cần phép thử
riêng nếu có tuyên bố liên quan. Không thu thập cookie đăng nhập
thật của khách hàng để chứng minh cách ly.

**17.3. Giới hạn của việc xóa dữ liệu.** Xóa dữ liệu trong hồ sơ
không có nghĩa xóa bản ghi đã nằm trên máy chủ bên ngoài. Không
tuyên bố mọi cookie đã xóa sẽ được khôi phục qua cache; cũng không
tuyên bố phân vùng cache loại bỏ mọi hình thức liên kết dữ liệu.

## 18. Đặc điểm trình duyệt và tính nhất quán

Các thuộc tính trình duyệt là tín hiệu mô tả môi trường, không mặc
nhiên là căn cước duy nhất của thiết bị hoặc con người:

- Hash giống nhau không chứng minh cùng thiết bị; hash khác nhau
  không chứng minh khác người.
- Cập nhật engine, hệ điều hành hoặc driver có thể thay đổi kết quả.
- Khả năng truy cập API khác nhau giữa các engine, phiên bản và quyền.
- Thuộc tính không được hỗ trợ không tự đồng nghĩa cấu hình lỗi.

"Tính nhất quán" phải đánh giá bằng quy tắc có căn cứ, lấy **cấu hình
đã khai báo của hồ sơ** làm chuẩn đối chiếu. Không tự đặt quy tắc
tuyệt đối kiểu: ngôn ngữ phải trùng quốc gia của IP; múi giờ khác vị
trí IP là rò rỉ; tổ hợp hệ điều hành/GPU ít gặp chắc chắn là giả;
không có chuyển động chuột chắc chắn là tự động hóa. Người dùng có
thể đi công tác, làm việc từ xa, dùng nhiều ngôn ngữ hoặc công cụ
trợ năng.

Đối với các phép đo cụ thể: Canvas — chỉ so kết quả của cùng tác vụ
và cùng điều kiện; khi so các đường xuất ảnh, chuẩn hóa về dữ liệu
pixel tương ứng. WebGL — ghi nhận khả năng API, giá trị thực tế và
trường không truy cập được. Audio — phân biệt AudioContext và
OfflineAudioContext; không gọi kết quả render offline là phép đo
trực tiếp sai số card âm thanh. Fonts/media — ghi rõ đây là kết quả
dò hoặc khả năng được phép truy cập, không mặc định là toàn bộ phần
cứng/phần mềm của máy. TLS/HTTP — không diễn giải một chữ ký giao
thức thành nhận diện chính xác duy nhất một người, thiết bị hoặc
hệ điều hành.

## 19. IP và Network Safety — diễn giải và giới hạn

**19.1. Phạm vi LHM chịu trách nhiệm:** cấu hình proxy; IP thoát
thực tế của phiên kiểm thử; tính liên tục của kết nối; thay đổi IP
trong thời gian quan sát; các đường truyền ngoài chính sách đã cấu
hình; việc dùng chung tài nguyên mạng giữa các hồ sơ. LHM không tự
chấm uy tín IP và không thay thế hệ thống kiểm IP riêng của chủ
dự án (Mục 7).

**19.2. Diễn giải kết quả mạng:** cùng IP không chứng minh cùng
người; cùng subnet /24 không chứng minh cùng hộ gia đình hoặc chủ
thể; IP datacenter không tự chứng minh kết nối không an toàn; địa
lý IP là ước lượng, không mặc định là vị trí vật lý chính xác; địa
chỉ LAN phổ biến trùng nhau giữa hai nơi không tạo bằng chứng liên
hệ có ý nghĩa. Cảnh báo phải mô tả điều quan sát được — ví dụ "Hai
hồ sơ có cùng IP thoát tại thời điểm đo" — không đổi thành "Nền
tảng đã liên kết hai hồ sơ".

**19.3. Không đơn giản hóa phép đo rò rỉ:** không áp dụng quy tắc
"mọi IP WebRTC khác IP proxy đều là IP thật bị lộ" — phải phân biệt
loại candidate, địa chỉ riêng/công khai, mDNS, relay và chính sách
mạng; không xác định được địa chỉ thuộc đường nào thì ghi chưa xác
minh. DNS phải kiểm tra bằng phương pháp quan sát phù hợp; quốc gia
của DNS resolver khác quốc gia proxy không đủ chứng minh rò rỉ. Kết
quả IP từ tiến trình quản lý không thay thế kết quả từ runtime của
hồ sơ.

**19.4. Fail-closed:** chặn khi không đáp ứng điều kiện mạng bắt
buộc của hồ sơ (proxy bắt buộc không kết nối được; phát hiện kết
nối trực tiếp trái chính sách; phép kiểm bắt buộc không hoàn thành
nên không đủ căn cứ cho phép sử dụng). Thiếu bằng chứng phải báo là
thiếu bằng chứng, không báo sai rằng đã phát hiện rò rỉ. Không tự
chuyển sang đường mạng hoặc engine khác (xem thêm Mục 8).

## 20. Hành vi và cảnh báo vận hành

**20.1. Phạm vi quan sát:** LHM chỉ phân tích những sự kiện thực sự
quan sát được trong ứng dụng hoặc trong phép kiểm thử được cho
phép: thời điểm mở/đóng hồ sơ; số hồ sơ hoạt động đồng thời; các
thao tác do chính LHM điều phối; chuỗi sự kiện được ghi nhận rõ
nguồn; tần suất và sự lặp lại trong khoảng thời gian xác định.
Không suy diễn rằng LHM biết toàn bộ thao tác trên website nếu chưa
có cơ chế thu thập tương ứng.

**20.2. Giới hạn suy luận:** không coi các hành vi sau là bằng chứng
chắc chắn về người hay máy: gõ nhanh hoặc chậm; dán nội dung; dùng
autofill; không có lỗi chính tả; di chuyển chuột thẳng; chỉ dùng bàn
phím; làm việc đều đặn theo lịch. Không tuyên bố nhận diện cùng một
người qua nhịp gõ hoặc quỹ đạo chuột nếu chưa có nghiên cứu và phép
nghiệm thu phù hợp. Cảnh báo hành vi chỉ mô tả mẫu quan sát được,
không kết luận nền tảng sẽ xử lý tài khoản ra sao.

**20.3. Bảo vệ dữ liệu hành vi:** ưu tiên dữ liệu sự kiện tổng hợp
tối thiểu. Không ghi mật khẩu, nội dung phím gõ, clipboard, nội dung
biểu mẫu nhạy cảm hoặc nội dung trao đổi của khách hàng để phân tích
hành vi. Cơ chế nội bộ có thể là bí mật sản phẩm, nhưng việc thu
thập dữ liệu khách hàng phải được mô tả minh bạch, có thời hạn lưu
và khả năng xóa.

## 21. Phân biệt website, ứng dụng native và hệ điều hành

Không gán quyền của hệ điều hành cho một trang web thông thường:

- Website không có quyền chung để quét SSID/BSSID xung quanh.
- Truy cập vị trí, cảm biến và thiết bị media phụ thuộc API, quyền
  và chính sách của từng nền tảng.
- Dữ liệu một ứng dụng native nhận được không chứng minh website
  cùng thương hiệu cũng nhận được.
- Thông tin có ở một dịch vụ không chứng minh nó được dùng trong
  mọi quyết định của dịch vụ khác.

Không diễn giải khả năng theo dõi ngoài website thành "nền tảng
thấy toàn bộ lịch sử duyệt web".

## 22. Yêu cầu đối với cảnh báo và bằng chứng

Mỗi cảnh báo phải trả lời được sáu câu hỏi: (1) quan sát thấy gì;
(2) ở hồ sơ hoặc phiên nào; (3) lúc nào và bằng cách nào; (4) so với
cấu hình hoặc tiêu chí nào; (5) giới hạn của kết luận là gì; (6)
người dùng có thể kiểm tra hoặc xử lý gì tiếp theo.

Diễn đạt phải bám thời điểm và độ trễ đo: viết "IP thoát thay đổi
từ A sang B giữa hai lần đo lúc 10:02 và 10:07; chưa xác định được
thời điểm thay đổi chính xác", không viết "đã phát hiện ngay khi IP
thay đổi". Tương tự, cụm "cảnh báo trước khi nền tảng dùng tín hiệu"
bị thay bằng "cảnh báo sau khi LHM quan sát thấy sự kiện đáp ứng
điều kiện cảnh báo, ghi rõ thời điểm và độ trễ đo" — không thể
nghiệm thu thời điểm một hệ thống bên ngoài sử dụng dữ liệu nếu
không có quyền quan sát hệ thống đó.

## 23. Hồ sơ nghiệm thu

Mỗi kết quả đo phải gắn với: commit của ứng dụng; phiên bản và hash
của engine; hệ điều hành và môi trường kiểm thử; cấu hình liên quan
(đã loại bỏ bí mật); thời gian, phương pháp và phạm vi đo; kết quả
kỳ vọng, thực tế và trạng thái; các phần chưa đo hoặc không hỗ trợ.

Phải phân biệt rõ: test mô phỏng, integration test, engine thật,
EXE chạy qua giao diện thật — không dùng kết quả của tầng này làm
bằng chứng cho tầng khác. Báo cáo số trường đạt phải ghi đúng số
trường đã đo; không dùng "khớp toàn bộ" khi còn trường thiếu. Kết
quả cũ phải có điều kiện hết hiệu lực hoặc cần đo lại khi engine,
cấu hình, proxy hay môi trường thay đổi.
