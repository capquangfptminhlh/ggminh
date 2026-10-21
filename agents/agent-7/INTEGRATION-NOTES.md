# INTEGRATION NOTES — Agent 7 (Network Safety)

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
