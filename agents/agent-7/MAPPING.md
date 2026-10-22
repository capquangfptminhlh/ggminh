# MAPPING — Agent 7 (Network Safety): Hiến pháp Mục 19 + Mục 4.1 → code hiện có

Nền: commit `8349f38` (Hiến pháp v1.3), nhánh `agent-7/network-safety`.
Mức bằng chứng ghi theo Mục 14: *quan sát đo được* / *suy luận từ code* /
*chưa xác minh*. Tài liệu này là suy luận từ code đã đọc trực tiếp, không
phải phép đo runtime.

## Bảng đối chiếu

| Tiêu chí | Code hiện có | Phần thiếu | Phép thử / bằng chứng |
|---|---|---|---|
| 19.1 Cấu hình proxy được kiểm trước khi chạy | `NetworkSafetyCheck.evaluate()` (src/engine/NetworkSafetyCheck.js): chuẩn hóa proxy qua `normalizedProxy` (camoufoxProxyPlan), đối chiếu bản ghi Proxy Center (host/type/port) và vault (user/pass) | Chỉ đường Camoufox được gate; đường Chromium không qua NetworkSafetyCheck (ngoài phạm vi Agent 7, ghi nhận cho Agent 1/3) | test/integration/network-safety.test.js (mocked) + test mới của Agent 7 (Đợt B) |
| 19.1 IP thoát thực tế của phiên kiểm thử | `src/engine/proxyChecker.js`: HTTPS tới `api.ipify.org` qua socket proxy tự dựng — đây là quan sát ở **tiến trình quản lý**, không phải runtime của hồ sơ | Chưa có phép đo IP thoát đọc từ chính phiên trình duyệt của hồ sơ ở mức sản phẩm | Đợt B(2): stage0-measure/run-runtime-egress.js (loopback) |
| 19.1 Tính liên tục / thay đổi IP trong thời gian quan sát | `src/health/autoIpWarnings.js`: nhận observations {profileId, ip, observedAt, sessionId} → cảnh báo `ip_changed_mid_session`, `egress_unstable` (≥4 IP) | Module chưa có nguồn dữ liệu nối vào ứng dụng (không caller nào cấp observations từ runtime); thuộc Agent 8 nối dây | test/auto-ip-warnings.js (đơn vị, mocked data) |
| 19.1 Đường truyền ngoài chính sách | Fail-closed ở tầng cấu hình (evaluate) + gateway loopback chỉ CONNECT HTTPS, plain HTTP → 501 (authenticatedHttpGateway.js, authenticatedSocksGateway.js) | Chưa có phép đo runtime chứng minh không có đường trực tiếp khi hồ sơ chạy qua proxy thật | NOT_RUN — cần lab proxy kiểm soát được (xem INTEGRATION-NOTES) |
| 19.1 Dùng chung tài nguyên mạng giữa các hồ sơ | autoIpWarnings: `shared_exit_ip` (high), /24 qua GraphDefense (`checkSubnetRisk`, `checkTemporalRisk`) | Chưa nối ứng dụng (Agent 8); diễn đạt đã đúng Mục 19.2 (chỉ mô tả quan sát, kèm note không kết luận nền tảng liên kết) | test/auto-ip-warnings.js |
| 19.3 WebRTC: phân biệt loại candidate/mDNS/relay | `NetworkSafetyCheck.inspectContext()`: đã có khung đo trong context thật (STUN do operator cấp, expected egress bắt buộc, thiếu → NOT_RUN), NHƯNG logic cũ gộp mọi candidate: IP public ≠ egress kỳ vọng = leak — chưa phân loại host/srflx/relay/mDNS, chưa xử lý IPv6/mDNS | Phân loại candidate đúng 19.3 | Đợt B(3): `classifyIceCandidate(s)` trong NetworkSafetyCheck + test đơn vị + đo loopback |
| 19.3 DNS: quan sát bằng nhật ký resolver kiểm soát | Chưa có đầu đo trong sản phẩm; tools/test-camoufox-proxy.mjs ghi `dns:'NOT_TESTED'` và yêu cầu nhật ký resolver của operator | Toàn bộ phép đo DNS | NOT_RUN — cần máy chủ DNS kiểm soát + khả năng trỏ resolver/proxy DNS; thiết kế ở INTEGRATION-NOTES |
| 19.3 IP từ runtime ≠ IP từ tiến trình quản lý | proxyChecker (quản lý) tồn tại; inspectContext (runtime) tồn tại nhưng chỉ đo WebRTC | Phép đo IP thoát từ runtime | Đợt B(2) |
| 19.4 Fail-closed: proxy bắt buộc không kết nối được → chặn | evaluate() chặn: lab chưa duyệt, thiếu store/vault, lệch bản ghi proxy, thiếu credentials, geoip bật (chưa kiểm chứng) → `NETWORK_BLOCKED`; EngineFactory.launchProfile và CamoufoxPlaywrightController.launch đều ném lỗi code NETWORK_BLOCKED trước khi mở engine | Test ở mức EngineFactory/Controller chứng minh adapter/launcher không hề được gọi sau khi chặn (chưa có) | Đợt B(1): test/network-safety-fail-closed.js |
| 19.4 Không fallback engine/đường mạng khác | EngineFactory: mismatch provider → throw; controller: thiếu playwright-core → throw "no fallback"; gateways: plain HTTP → 501, nguồn không phải loopback → destroy | Test khẳng định không fallback ở đường factory (kèm B1) | test/network-safety-fail-closed.js |
| 4.1 TLS JA3/JA4, HTTP/2 fingerprint, header order | Không có đầu đo trong sản phẩm (xử lý G — giữ của engine) | Phép đo echo phía máy chủ kiểm soát | NOT_RUN — cần máy chủ echo kiểm soát được; ngoài đợt này |
| 4.1 IPv6 lộ song song | Chưa có đầu đo; classifier cũ chỉ IPv4 | Phân loại candidate IPv6 (Đợt B3, mức phân loại); đo tuyến IPv6 thật cần mạng IPv6 | Phân loại: test đơn vị. Đo tuyến: NOT_RUN |
| 4.1 QUIC/UDP rò tuyến | Chưa có cấu hình/đo trong phạm vi Camoufox lab | — | NOT_RUN — cần lab proxy + trang HTTP/3 kiểm soát |

## Cơ chế quan sát IP thoát hiện có của ứng dụng (tóm tắt)

1. `proxyChecker.js` (tiến trình quản lý): tự dựng socket qua proxy ứng viên
   tới `api.ipify.org:443`, parse `"ip"` từ phản hồi — dùng để kiểm tra proxy
   trong Proxy Center/UI, không đi qua trình duyệt của hồ sơ.
2. `autoIpWarnings.js` (module thư viện): tiêu thụ observations do ứng dụng
   ghi lại; hiện chưa có caller cấp dữ liệu runtime (Agent 8 xử lý nối dây).
3. `tools/test-camoufox-proxy.mjs` (công cụ lab, chạy tay): mở Camoufox thật
   qua proxy của operator, đọc IP từ trang echo HTTPS do trình duyệt tải —
   đây là mẫu đúng hướng "đo từ runtime", nhưng là công cụ ngoài sản phẩm,
   yêu cầu proxy + echo + STUN do operator cấp; thiếu input → NOT_RUN exit 2
   (test/camoufox-lab-gate.js khóa hành vi này).

## Nguyên tắc diễn đạt (Mục 19.2) áp cho mọi output của Agent 7

Chỉ mô tả quan sát: "hai hồ sơ có cùng IP thoát tại thời điểm đo", "quan sát
thấy candidate srflx công khai khác IP thoát kỳ vọng". Không viết "nền tảng
đã liên kết", không chấm điểm/chấm uy tín IP (Mục 7, 19.1).
