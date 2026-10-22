# INTEGRATION NOTES — Agent 7 (đợt thương mại hoá): quan sát IP thoát từ runtime

Nhánh `agent-7/runtime-egress-observation`, nền `f4d7329`. File chung
(package.json, main.js, preload.js, index.html) KHÔNG bị chạm — mọi điểm
nối dưới đây là đề xuất cho điều phối thực hiện.

## Cái đã có trong nhánh này

- `src/health/runtimeEgressObservation.js` (mới):
  `observeRuntimeExitIp({ context | page, profileId, sessionId, echoUrl,
  store, timeoutMs })` → fetch endpoint echo TỪ TRONG page context của
  phiên Camoufox do controller điều khiển, ghi quan sát qua
  ExitIpObservationStore với nhãn `source: 'browser-runtime'`.
  Fail-closed toàn diện: echo không tới được / timeout / HTTP lỗi /
  redirect / thân không phải IPv4 → KHÔNG ghi gì, trả
  `{ recorded: false, reason }`, không bao giờ throw vì lỗi đo.
- `src/health/exitIpObservations.js` (sửa, tương thích ngược): `record()`
  nhận thêm `source` tuỳ chọn, chỉ nhận `'browser-runtime'` |
  `'manager-process'` (nhãn lạ → từ chối ghi); không truyền source thì
  bản ghi giữ nguyên hình dạng cũ (không có khóa `source`). File cũ nạp
  lại nguyên vẹn. Export thêm `OBSERVATION_SOURCES`, `isObservationSource`.
- `src/health/autoIpWarnings.js` (sửa tối thiểu): `normalizeObservations`
  kiểm chứng + cho `source` chảy qua (nhãn lạ → throw, fail-closed như
  sessionId). Logic cảnh báo KHÔNG phân biệt nguồn — test chứng minh đầu
  vào có nhãn / không nhãn / trộn cho cảnh báo giống hệt nhau, và
  warningService xử lý được cả ba.
- `test/runtime-egress-observation.js` (mới): parse echo + chuẩn hoá
  IPv4 (kể cả dạng `::ffff:`), schema store, ma trận fail-closed bằng
  page/fetch stub, tương thích D3 + warningService.
- `stage0-measure/run-runtime-egress-observation.js` (mới): harness chạy
  thật qua đúng CamoufoxPlaywrightController của ứng dụng (seam headless
  như run-isolation.js) — 9/9 checks PASS trên engine thật, kết quả lưu
  tại `stage0-measure/agent7-runtime-egress-observation-results.json`.

## Điểm nối đề xuất cho điều phối (main.js)

### 1. Gắn nhãn cho đường ghi hiện tại (một dòng)

Chỗ ghi quan sát checkProxy hiện tại trong handler `start-browser`
(main.js ~dòng 690):

```js
ipObservationStore.record({profileId:id, ip:result.ip, sessionId:appSessionId,
  source:'manager-process'});
```

Store và D3 ở nhánh này đã chấp nhận nhãn — sau thay đổi này mọi bản ghi
mới đều phân biệt được nguồn; bản ghi cũ không nhãn vẫn đọc/cảnh báo bình
thường (không cần migration).

### 2. Gọi quan sát runtime sau khi mở hồ sơ qua controller

Chỉ áp dụng cho phiên do CamoufoxPlaywrightController điều khiển (đường
launcher trả về context / `controller.contextFor(id)`). Mẫu nối, đặt
NGAY SAU khi mở hồ sơ thành công, cùng chỗ với lời ghi manager-process
hiện tại:

```js
const { observeRuntimeExitIp } = require('./src/health/runtimeEgressObservation');
// fire-and-forget: KHÔNG await trong luồng mở hồ sơ
void observeRuntimeExitIp({
  context: camoufoxController.contextFor(id),
  profileId: id,
  sessionId: appSessionId,
  echoUrl: settings.runtimeEchoUrl,        // xem mục 3
  store: ipObservationStore,
  timeoutMs: 8000,
}).catch(() => {}); // module đã không throw vì lỗi đo; catch là lưới cuối
```

- Thời điểm gọi: một lần, ngay sau launch thành công. Không gọi lặp
  định kỳ trong đợt này — phát hiện đổi IP GIỮA phiên bằng nguồn runtime
  cần quyết định về lịch đo riêng (xem NOT_RUN).
- Timeout: mặc định 8000 ms (chặn cứng 250–30000), gồm abort trong trang
  + deadline phía Node; trang dò do module tự mở trong context và tự
  đóng — không đụng tab của người dùng.
- Không chặn luồng: lời gọi không được await; mở hồ sơ thành công/thất
  bại không phụ thuộc kết quả đo. Đo thất bại = không có bản ghi = D3 báo
  not_measured cho hồ sơ đó — đúng Mục 19.4 (thiếu bằng chứng báo là
  thiếu bằng chứng), TUYỆT ĐỐI không lấp bằng kết quả checkProxy.

### 3. Endpoint echo (điều kiện tiên quyết, quyết định của chủ dự án)

Module cần MỘT endpoint do LHM kiểm soát, hợp đồng: GET → 200, thân là
JSON `{"ip": "<ipv4>"}` (hoặc `{"remoteAddress": ...}` / text thuần),
header `Access-Control-Allow-Origin: *` (fetch chạy trong page context)
và `Cache-Control: no-store`, không redirect. URL lấy từ cấu hình
(settings), không hardcode. Lưu ý riêng tư phải quyết cùng chính sách
hiện tại: checkProxy đang dùng api.ipify.org — đường runtime dùng cùng
một endpoint bên thứ ba như vậy sẽ để lộ IP thoát của hồ sơ cho bên đó
giống hệt đường manager hiện tại; endpoint tự vận hành thì không. Đây
là quyết định của chủ dự án, module không tự chọn.

### 4. Chuỗi test (package.json — điều phối sở hữu)

Đề xuất thêm vào `test`:

```
node test/runtime-egress-observation.js && node --check src/health/runtimeEgressObservation.js
```

Harness stage0 KHÔNG đưa vào chuỗi thường (cần binary engine):
chạy tay bằng `LHM_CAMOUFOX_EXECUTABLE=<path> node stage0-measure/run-runtime-egress-observation.js`
(exit 2 = NOT_RUN khi thiếu điều kiện).

## Giới hạn trung thực + NOT_RUN

- **Chỉ phiên do controller điều khiển.** Đường Camoufox controller hiện
  vẫn là đường experimental có cổng (`enabled`) trong ứng dụng. Phiên mở
  qua native adapter, Chromium, hay Gecko mở tay KHÔNG có page handle
  cho ứng dụng → quan sát nguồn runtime cho các phiên đó là **NOT_RUN**:
  chúng tiếp tục chỉ có quan sát tiến trình quản lý (đã gắn nhãn rõ),
  và theo Mục 19.3 hai nguồn không bao giờ được thay thế cho nhau.
  Cơ chế khác cho phiên mở tay (ví dụ trang đo do người dùng tự mở)
  là việc thiết kế riêng, chưa làm trong đợt này.
- **Loopback chứng minh cơ chế, chưa chứng minh phân biệt qua proxy.**
  Lần chạy thật: cả hai nguồn đều thấy 127.0.0.1 theo cấu trúc loopback.
  Fetch trong trang đi qua đúng cấu hình mạng của context (kế thừa proxy
  plan của hồ sơ) — nhưng khẳng định "IP runtime khác IP manager khi qua
  proxy thật" là **NOT_RUN** cho tới khi đo qua proxy kiểm soát được
  (lab của Agent 6 / mạng thật). Không suy diễn ngược.
- **Một lần đo lúc mở hồ sơ.** Module không tự đo lại giữa phiên; cảnh
  báo `ip_changed_mid_session` phía runtime cần lịch đo — chưa nối.
- **IPv4 only**, theo thiết kế của store/D3 hiện tại; echo trả IPv6 thì
  coi như không đo được (fail-closed), không ép sang dạng khác.
- **Windows/EXE đóng gói: NOT_RUN** — lần chạy thật là Linux + binary
  lab qua controller (cổng 3 lo phần Windows).

---
---

# INTEGRATION NOTES — Agent 7 (Network Safety) — ĐỢT TRƯỚC, giữ làm lịch sử

Nền: `8349f38`, nhánh `agent-7/network-safety`. Đối chiếu: `agents/agent-7/MAPPING.md`.

## Những gì Agent 7 đã thay đổi

1. `src/engine/NetworkSafetyCheck.js` — bổ sung phân loại ICE candidate
   đúng Mục 19.3: `classifyIceCandidate(s)` trả {type: host/srflx/prflx/
   relay, addressKind: public/private/loopback/link-local/mDNS/docu-
   mentation/shared/unverified cho IPv4+IPv6}; `inspectContext()` dùng
   bộ phân loại, trả thêm `candidates[]` và `unexpectedPublicCandidates[]`.
   Chỉ địa chỉ công khai loại srflx/prflx/host khác egress kỳ vọng mới bị
   tính là quan sát lộ công khai bất ngờ; relay công khai (địa chỉ máy chủ
   TURN) không bị tính. Trường trả về cũ giữ nguyên (result/webrtc/dns/
   candidateCount/reason) — test cũ `test/integration/network-safety.test.js`
   vẫn đạt không sửa.
2. `test/network-safety-fail-closed.js` (mới) — ma trận evaluate + chặn ở
   EngineFactory (adapter không được gọi lần nào khi bị chặn; positive
   control khi lab đạt) + chặn ở CamoufoxPlaywrightController (context
   không được tạo). Cần coordinator thêm vào chuỗi `npm test` trong
   package.json: `node test/network-safety-fail-closed.js`.
3. `test/network-safety-ice-classification.js` (mới) — đơn vị cho bộ phân
   loại + inspectContext mocked. Đề xuất thêm vào package.json cạnh test
   trên.
4. `stage0-measure/run-runtime-egress.js` (mới) — công cụ đo từ runtime
   (xem bằng chứng bên dưới). Chạy tay, không thuộc npm test:
   `LHM_PLAYWRIGHT_CORE=<dir playwright-core> LHM_CAMOUFOX_EXECUTABLE=<binary lab> node stage0-measure/run-runtime-egress.js`.
   Thiếu điều kiện → in NOT_RUN, exit 2. Đề xuất thêm `node --check` của
   file này vào cổng stage0 của package.json/workflow.

## Bằng chứng đã chạy trên máy này (Linux, 2026-10-21)

- Test mới + test liên quan cũ đều đạt: network-safety-fail-closed,
  network-safety-ice-classification, integration/network-safety.test,
  camoufox-lab-gate, auto-ip-warnings, proxy-gateway, proxy-socks-auth,
  per-profile-engine-factory, gecko-proxy, selective-core-gate,
  stage0-measure/test (contract).
- Đo runtime thật (Camoufox Linux tại ~/tmp-big/cfx-build/camoufox-bin,
  playwright-core 1.62.0, loopback): trạng thái RAN.
  - IP thoát đọc từ **runtime của hồ sơ**: trang trong phiên trình duyệt
    fetch endpoint echo; máy chủ ghi remoteAddress `127.0.0.1` cho đúng
    kết nối của trình duyệt (nguồn ghi nhãn `browser-runtime`).
  - Quan sát của tiến trình quản lý tới cùng endpoint được báo cáo riêng
    (`manager-process`) — không thay thế quan sát runtime (Mục 19.3).
  - ICE: 4 candidate, tất cả host + mDNS (tên `*.local`) — phân loại đúng;
    không có địa chỉ công khai nào lộ ra trong lần chạy loopback này.
  - STUN server loopback của công cụ nhận **0 binding request**: trình
    duyệt trong cấu hình này không tham vấn STUN server, nên không quan
    sát được srflx. Thiếu srflx ở đây là *thiếu quan sát*, không phải
    bằng chứng về tuyến mạng — đã ghi trong chính output của công cụ.

## NOT_RUN và điều kiện cần bổ sung

| Phép đo | Trạng thái | Điều kiện cần |
|---|---|---|
| IP thoát công khai của hồ sơ qua proxy thật (runtime) | NOT_RUN | Proxy kiểm soát được (operator cấp) + endpoint echo HTTPS được ủy quyền (mẫu: tools/test-camoufox-proxy.mjs đã có khung; cần input lab) |
| DNS: resolver thực tế / rò DNS qua proxy | NOT_RUN — chưa có đầu đo trong sản phẩm | Máy chủ DNS authoritative kiểm soát được + nhật ký phân giải; cấu hình trỏ tên miền kiểm thử qua resolver đó; trên Windows lab càng tốt |
| WebRTC srflx qua STUN ngoài | NOT_RUN trên máy này | STUN server operator cấp + môi trường mạng mà trình duyệt thực sự tham vấn STUN (lần chạy loopback: 0 request — cần điều tra riêng trong lab Windows/mạng thật); khung inspectContext đã sẵn sàng |
| IPv6: tuyến v6 song song v4 qua proxy | NOT_RUN (chỉ mới phân loại candidate v6 ở mức đơn vị) | Mạng có IPv6 + proxy hỗ trợ v6 |
| QUIC/UDP rò tuyến | NOT_RUN | Lab proxy + trang HTTP/3 kiểm soát |
| TLS JA3/JA4, HTTP/2 fingerprint, thứ tự header (xử lý G) | NOT_RUN | Máy chủ echo kiểm soát ghi lại handshake/frame/header — đề xuất giao Agent 5 hoặc đợt sau |
| Mọi phép đo trên EXE Windows đã cài | NOT_RUN | Cổng 3 Hiến pháp (máy Windows của chủ dự án) — thuộc Agent 10/chủ dự án |

## Ghi chú cho Agent 8 / điều phối

- `autoIpWarnings.js` đúng diễn đạt Mục 19.2 (mọi cảnh báo kèm note không
  kết luận nền tảng liên kết) nhưng chưa có nguồn observations từ runtime.
  Công cụ `run-runtime-egress.js` cho thấy mẫu cấp dữ liệu: mỗi lần đo IP
  thoát từ runtime sinh một observation {profileId, ip, observedAt,
  sessionId} đúng định dạng module này tiêu thụ.
- Không có module chấm điểm IP nào được tạo; uy tín IP nằm ngoài phạm vi
  (Mục 7/19.1) theo đúng lệnh cấm.
- File chung không bị sửa: package.json, main.js, preload.js, index.html,
  .github — mọi đề xuất nối dây nằm trong tài liệu này.
