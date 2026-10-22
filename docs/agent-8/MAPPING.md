# MAPPING — Agent 8: Cảnh báo vận hành (Hộ vệ Liên đới, phần cảnh báo)

Cơ sở: commit `8349f38` (Hiến pháp v1.3). Mọi khẳng định dưới đây là
*quan sát từ code* tại commit nền; phần suy luận ghi rõ là suy luận.

## 1. Các module cảnh báo hiện có

| Module | Hàm chính | Đầu vào | Đầu ra | Caller trong ứng dụng |
|---|---|---|---|---|
| `src/monitor/behaviorPatterns.js` (D2) | `behaviorPatternWarnings(events)` | Sự kiện dạng BehaviorMonitor `{action, profileId, source, at}` (action ∈ open/close/save/delete, source ∈ manual/api) | `{level, alertCount, eventsAnalysed, alerts:[{code, level, profileId, count, message, latestAt}], note}` | **Không có** — chỉ `test/behavior-patterns.js` gọi |
| `src/health/autoIpWarnings.js` (D3) | `automaticIpWarnings(observations)` | Quan sát IP thoát `{profileId, ip (IPv4), observedAt, sessionId?}` | `{status, warningCount, observations, profilesObserved, warnings:[{level, code, profiles, message, note}]}` | **Không có** — chỉ `test/auto-ip-warnings.js` gọi |
| `src/health/localDrift.js` (Health Drift) | `LocalHealthDrift#report()`, `detectDrift(snapshots)` | Snapshot tổng hợp `{at, profiles, errors, warnings, active, appVersion}` (chỉ số đếm tổng hợp; không IP, không định danh) | `report() → {enabled, stored, latest, drift:{status: insufficient\|stable\|review\|investigate, errorChange, warningChange, versionChanged, baseline, recent, note}, notice}` | **Có** — IPC `health-drift-report/snapshot/clear/export` trong `main.js` |
| `src/monitor/behaviorMonitor.js` | `record(...)`, `getReport()` | Thao tác trong ứng dụng | Báo cáo cửa sổ 10 phút: alerts đơn-hồ-sơ + `recentEvents` | **Có** — `main.js` + `src/api/server.js` ghi sự kiện; IPC `get-behavior-report` |
| `src/health/GraphDefense.js` | `checkSubnetRisk`, `checkTemporalRisk` | IP do người vận hành nhập tay | Kết quả rủi ro /24 | Có (IPC `agency-network-preview`); D3 cũng dùng bên trong |

Mã cảnh báo hiện có:
- D2: `synchronized_open_burst`, `identical_sequence`, `bulk_open_close`,
  `regular_interval_open` (đều mức medium).
- D3: `shared_exit_ip` (high), `ip_changed_mid_session` (high),
  `subnet_concentration` (medium), `subnet_overlap` (medium),
  `egress_unstable` (medium).
- BehaviorMonitor (đã hiển thị): `repeat_api_open`, `repeat_open`,
  `rapid_cycle`, `repeat_update`, `bulk_open`.
- Health Drift: không phát "cảnh báo" theo mã; trạng thái `investigate` /
  `review` / `versionChanged` là tín hiệu tương đương chưa được chuẩn hóa
  thành cảnh báo theo Mục 22.

## 2. Nguồn sự kiện thật trong ứng dụng

### 2.1 Sự kiện hành vi (đủ cho D2)
- `BehaviorMonitor` được khởi tạo tại `main.js` (`new BehaviorMonitor(storageDir)`,
  dòng ~814), lưu `behavior-events.json`, giữ 24 giờ / tối đa 1200 sự kiện,
  chỉ gồm `{action, profileId, source, at}` — đúng phạm vi Mục 20.1 và 20.3
  (không nội dung trang, không phím gõ, không thông tin đăng nhập).
- Điểm ghi: các handler IPC trong `main.js` ghi `source: 'manual'`
  (mở/đóng/lưu/xóa hồ sơ, batch open/stop qua Control Tower); `src/api/server.js`
  ghi `source: 'api'` tại các route mở/đóng/lưu/xóa hồ sơ.
- Truy cập dữ liệu: `BehaviorMonitor#events` là trường công khai chứa toàn
  bộ sự kiện đã giữ (đã prune); `getReport()` chỉ tóm tắt 10 phút gần nhất
  nên **không đủ** cho D2 (D2 cần cửa sổ tới 24 giờ cho mẫu nhịp đều).
  Lớp dịch vụ nhận mảng sự kiện qua tham số — phía tích hợp chỉ cần truyền
  `behaviorMonitor.events`.

### 2.2 Quan sát IP thoát (thiếu nhà sản xuất dữ liệu — phần thiếu lớn nhất)
- Ứng dụng **có** khả năng đo IP thoát: `src/engine/proxyChecker.js`
  (`checkProxy(proxy)` qua `api.ipify.org`), được gọi qua IPC `check-proxy`,
  route API `POST /api/proxy/check` và `proxyCenter.verify(...)`.
- Nhưng **không nơi nào ghi lại** quan sát dạng
  `{profileId, ip, observedAt, sessionId}`: các lần kiểm tra là theo yêu
  cầu, kết quả trả về cho caller rồi thôi; không gắn profileId/sessionId,
  không lưu lịch sử. Hệ quả: D3 hiện không có dữ liệu thật để chạy trong
  ứng dụng — đây là phần thiếu thuộc phạm vi agent điều phối (ghi quan sát
  tại `main.js`/controller khi kiểm tra proxy cho một hồ sơ hoặc khi phiên
  bắt đầu), xem INTEGRATION-NOTES.md. Lớp dịch vụ của Agent 8 định nghĩa
  hợp đồng đầu vào và báo `not_measured` khi chưa có quan sát, thay vì im
  lặng coi như bình thường (Mục 16).

### 2.3 Health Drift (đủ)
- `localHealthDrift` khởi tạo tại `main.js` (dòng ~705); snapshot do người
  dùng bấm tay qua IPC `health-drift-snapshot` (tổng hợp từ `checkProfile`),
  tối thiểu cách nhau 30 phút. `report()` dùng được ngay làm đầu vào.

## 3. Đường hiển thị cảnh báo hiện có

- IPC `get-behavior-report` → `preload.js` `getBehaviorReport()` →
  `src/ui/renderer.js` (khối `behaviorActions`, danh sách `behavior-alert-list`,
  nút dashboard `btn-behavior-alert`). Chỉ hiển thị alert của BehaviorMonitor
  với dạng `{code, level, profileId, count, message, latestAt}`.
- IPC `get-profile-health`, `get-all-profile-health`, `health-drift-report`
  hiển thị sức khỏe cấu hình và drift ở dạng riêng, không qua một luồng
  cảnh báo hợp nhất.
- API cục bộ (`src/api/server.js`): có ghi sự kiện hành vi và
  `POST /api/proxy/check`; **chưa có** route đọc cảnh báo D2/D3.
- Kết luận: chưa tồn tại luồng hiển thị nào cho D2/D3/Health-Drift-dạng-cảnh-báo.
  Lớp dịch vụ (Đợt B) tạo một báo cáo cảnh báo hợp nhất, chuẩn Mục 22;
  điểm nối IPC/UI đề xuất trong INTEGRATION-NOTES.md (thuộc agent điều phối
  và Agent 9).

## 4. Khoảng trống Agent 8 xử lý trong đợt này

1. Lớp dịch vụ `src/monitor/warningService.js`: hợp nhất D2 + D3 + Health
   Drift (+ tùy chọn alert của BehaviorMonitor nếu caller truyền vào) thành
   cảnh báo chuẩn bằng chứng Mục 22, fail-closed khi dữ liệu lỗi, báo
   `not_measured` minh bạch khi thiếu nguồn.
2. Test độc lập bằng sự kiện/quan sát tổng hợp (`test/warning-service.js`).
3. Đề xuất nối dây chính xác (INTEGRATION-NOTES.md) — không tự sửa
   `main.js`, `preload.js`, `package.json`, UI.

## 5. Ngoài phạm vi / NOT_RUN của Agent 8

- Ghi quan sát IP thoát thật trong `main.js` (agent điều phối sở hữu file).
- Hiển thị cảnh báo hợp nhất trong UI (Agent 9 + điều phối).
- Chạy cảnh báo trên EXE Windows thật: NOT_RUN (môi trường Linux, cổng
  nghiệm thu 3 thuộc chủ dự án — Hiến pháp Mục 12).
