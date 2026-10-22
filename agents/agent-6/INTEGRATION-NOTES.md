# INTEGRATION NOTES — Agent 6 (đợt thương mại hoá): Egress qua proxy + WebRTC

**Nhánh:** `agent-6/proxy-egress` từ nền `07150d6` (integration/v5.8-phase-c).
**Engine thật:** Camoufox Linux tại `~/tmp-big/cfx-build/camoufox-bin`,
SHA-256 `2a2cb03f6ca4cfa96cdb9d0991b52f4dc02d7f097d3253d355f6a6361ce28669`
(digest ghi trong cả hai file kết quả theo Mục 23).
**Không sửa file chung nào.** Không push/merge/tag.

## File mới (tất cả trong `stage0-measure/`)

| File | Vai trò |
|---|---|
| `lab-net.js` | Fixture lab loopback: HTTPS echo (ghi địa chỉ nguồn của kết nối), upstream HTTP CONNECT proxy + upstream SOCKS5 (RFC 1928/1929) tự vận hành, STUN responder ghi MỌI datagram, sinh cert lab |
| `run-proxy-egress.js` | Phần 1+2: egress qua đúng đường ứng dụng + WebRTC dưới cấu hình proxy + kiểm tra fail-closed toàn栈 |
| `run-stun-investigation.js` | Phần 3: điều tra việc trình duyệt có tham vấn STUN hay không (S0–S5 + control môi trường UDP) |
| `agent6-proxy-egress-results.json` | Kết quả nguyên văn lần chạy egress |
| `agent6-stun-results.json` | Kết quả nguyên văn lần chạy điều tra STUN |

Địa chỉ lab (toàn bộ trong 127/8 của chính máy này): echo `127.0.0.10`;
nguồn mặc định của trình duyệt/tiến trình quản lý `127.0.0.1`; egress của
upstream HTTP `127.0.0.20`; egress của upstream SOCKS5 `127.0.0.30`. Nhờ
đó địa chỉ echo ghi được là *thuộc về* đúng một khâu trong chuỗi.

## Phần 1 — Egress qua đường proxy của ứng dụng: PASS (loopback)

Đường đã chạy là đường thật của sản phẩm: `CamoufoxPlaywrightController`
→ `NetworkSafetyCheck.evaluate` → `prepareCamoufoxProxy` → gateway xác
thực của ứng dụng (loopback) → upstream lab → echo. Phần fixture duy nhất
là seam launch đã có tiền lệ (wrapper ép headless/timeout/ignoreHTTPSErrors
+ verifier stub + symlink tên `camoufox.exe`), store/vault stub chứa proxy
lab và thông tin xác thực dùng-một-lần, và một pref lab (xem mục "Pref
lab" bên dưới). Quan sát từ **runtime của hồ sơ** (trang fetch echo và đọc
kết quả):

| Kịch bản | Echo thấy nguồn | Kết luận |
|---|---|---|
| Direct (không proxy) | `127.0.0.1` | đường nền, đúng kỳ vọng |
| HTTP upstream qua gateway của app | **`127.0.0.20`** | PASS — egress là upstream proxy, không phải trình duyệt |
| SOCKS5 upstream qua gateway của app | **`127.0.0.30`** | PASS — như trên |
| Hồ sơ trỏ `authProxyId` không tồn tại | — | PASS fail-closed (19.4): `NETWORK_BLOCKED: Proxy reference mismatch`, **0** hit tới echo |

Quan sát từ **tiến trình quản lý** (giữ tách bạch theo 19.3): tiến trình
Node này fetch echo bằng TLS socket thô trực tiếp → echo thấy `127.0.0.1`.
Giá trị này chỉ mô tả kết nối của tiến trình quản lý, không thay thế quan
sát runtime. (Lý do dùng socket thô thay vì `https.get`: shell của máy
lab export env proxy cho Node — `NODE_USE_ENV_PROXY=1` — và NO_PROXY
không chứa `127.0.0.10`, nên `https.get` mặc định sẽ đi vòng qua proxy hạ
tầng và làm sai lệch chính quan sát "trực tiếp" này. Mọi lab tool sau này
cần chú ý.)

Quan sát phụ (chỉ nêu, không kết luận): ở lần smoke, gateway cũng mang
các kết nối nền của chính engine (bản cập nhật thành phần Mozilla/Google)
— engine dùng chung tuyến proxy của hồ sơ cho traffic của nó.

## Phần 2 — WebRTC dưới cấu hình proxy: quan sát nguyên văn

Trang tạo `RTCPeerConnection` với `iceServers` trỏ STUN lab
`127.0.0.1`, phân loại bằng `classifyIceCandidates` hiện có:

- **Direct:** 4 candidate, tất cả `host` + mDNS (2 tên `*.local` × udp/tcp).
  Gathering hoàn tất ~48 ms kèm **một ICE error 701** cho URL STUN.
- **Sau proxy HTTP (đường app):** **0 candidate**, 0 ICE error, gathering
  hoàn tất ~155 ms.
- **Sau proxy SOCKS5 (đường app):** **0 candidate**, 0 ICE error, ~136 ms.

Không candidate nào thuộc loại srflx/prflx/relay trong bất kỳ kịch bản
nào; `unexpectedPublicCandidates` rỗng ở mọi kịch bản. Không có srflx giả
lập nào xuất hiện trong cấu hình đường-ứng-dụng này (xem thêm Phần 3).

## Phần 3 — Bí ẩn "STUN nhận 0 binding request": đã giải ở mức quan sát

**Sự kiện môi trường (control quyết định):** trong sandbox này, **UDP
không chuyển phát được ở bất kỳ địa chỉ cục bộ nào đã thử** — hai socket
UDP trong *cùng một tiến trình* Node không trao đổi được datagram trên
127.0.0.1, 127.0.0.2, 198.19.0.2 và ::1 (đều timeout); client Python còn
nhận EPERM khi gửi UDP loopback; DNS-over-UDP tới gateway cũng timeout.
Control S0 (client Node → STUN lab) vì thế cũng nhận 0 phản hồi và server
ghi 0 datagram — "server không thấy gì" ở máy này là một *sự kiện về
transport*, không phải sự kiện về trình duyệt.

**Quan sát phía trình duyệt (5 biến thể, kết quả nhất quán):**

- S1 (baseline như Agent 7), S2 (STUN gắn trên địa chỉ interface
  198.19.0.2), S3 (STUN trên 127.0.0.2), S4 (ghi đè pref
  `default_address_only=false` + `proxy_only_if_behind_proxy=false`):
  cả bốn đều cho 4 host/mDNS candidate, **ICE error 701** cho URL STUN
  trong ~20–60 ms, gathering hoàn tất ngay, server ghi 0 datagram.
  Error 701 là lỗi "không tới được STUN server" trong mô hình lỗi
  WebRTC — nhất quán với việc trình duyệt *có thử* STUN và transport
  gãy ngay lập tức tại máy này.
- S5 (sau proxy qua đường app): 0 candidate, **không** ICE error —
  khác hẳn mẫu direct. Nhất quán với cấu hình engine tự công bố trong
  `camoufox.cfg` của bản build: `media.peerconnection.ice.proxy_only_if_behind_proxy=true`
  (sau proxy thì không gửi UDP STUN vòng qua proxy TCP). Cùng file đó
  tuyên bố engine *có thể* chế tạo srflx giả mang IP proxy
  (webrtc-ip-spoofing) — trong cấu hình chạy qua đường ứng dụng ở lab
  này, **không quan sát thấy srflx giả nào**; không được tuyên bố tính
  năng đó hoạt động qua đường của LHM.

**Kết luận ở mức quan sát (không vượt quá bằng chứng):**
1. "STUN nhận 0 request" ở đợt trước và đợt này được giải thích bởi
   môi trường: sandbox không có đường UDP. Không có bằng chứng nào ở
   đây cho thấy engine "không tham vấn STUN" trên một máy bình thường.
2. Phía trình duyệt có dấu hiệu đã thử STUN khi direct (error 701 tức
   thì) và không thử khi sau proxy TCP (0 candidate, không error) —
   đúng mẫu cấu hình engine công bố. Cả hai vẫn là quan sát trong môi
   trường không-UDP.
3. Muốn kết luận dứt điểm về srflx: **NOT_RUN** — cần chạy lại
   `run-runtime-egress.js` (Agent 7) và/hoặc
   `run-stun-investigation.js` trên máy có UDP hoạt động (máy Windows
   của chủ dự án tại Cổng 3, hoặc một lab mạng thật). Cả hai script đều
   tự chứa control môi trường UDP để lần chạy đó tự kiểm chứng điều
   kiện trước khi diễn giải.

## Pref lab bắt buộc (khai báo đầy đủ)

`network.proxy.allow_hijacking_localhost=true` được gộp tại seam launch.
Firefox mặc định **không bao giờ** proxy đích loopback (bất kể
`no_proxies_on`), nên nếu thiếu pref này, fetch tới echo loopback đi
thẳng và phép đo sẽ đo sai đường (đã kiểm chứng bằng smoke run: fetch
tới từ 127.0.0.1 trong khi traffic nền của engine vẫn qua gateway). Pref
này chỉ có ý nghĩa trong lab; đích sản phẩm là host công khai nên đây
không phải thay đổi hành vi ứng dụng và không đề xuất đưa vào pref set
của ứng dụng.

## NOT_RUN (điều kiện cần)

- Egress qua proxy công khai thật + endpoint echo công khai: cần proxy
  kiểm soát được ngoài lab và endpoint echo được ủy quyền.
- srflx/STUN trên đường thật: cần môi trường có UDP (xem trên).
- DNS (Mục 4.1): vẫn CHƯA ĐO — cần authoritative DNS kiểm soát được +
  nhật ký phân giải.
- IPv6/QUIC/TLS/HTTP2 echo, toàn bộ trên Windows/EXE: Cổng 3.

## Đề xuất cho điều phối (không tự sửa file chung)

1. Đưa hai runner vào cổng stage0 dạng tùy chọn (chúng cần engine lab;
   ngữ nghĩa NOT_RUN exit 2 đã có sẵn khi thiếu điều kiện).
2. Cập nhật trạng thái Mục 4.1 (chỉ chủ dự án sửa Hiến pháp — Mục 13):
   hàng *IP thoát* → bổ sung "egress qua đường proxy của ứng dụng đã đo
   trên lab loopback (HTTP + SOCKS5), echo thấy đúng nguồn của upstream";
   hàng *WebRTC ICE* → ghi "đã đo một phần: sau proxy của ứng dụng 0
   candidate; direct chỉ host/mDNS; srflx CHƯA ĐO được vì lab không có
   UDP — cần máy có UDP".
3. Tái cấu trúc nhỏ: `run-runtime-egress.js` của Agent 7 chứa STUN
   responder không export được; `lab-net.js` của đợt này cài lại cùng
   responder tối thiểu. Đề xuất trích xuất responder dùng chung vào
   `lab-net.js` khi điều phối có dịp chạm vào cả hai file.
4. Lưu ý môi trường cho mọi agent sau: sandbox này (a) không có UDP,
   (b) Node mặc định bị env-proxy. Mọi phép đo mạng tại đây phải kèm
   control hai sự kiện này trước khi diễn giải "im lặng" của một
   endpoint thành hành vi của engine.
