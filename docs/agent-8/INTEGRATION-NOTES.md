# INTEGRATION NOTES — Agent 8: nối lớp dịch vụ cảnh báo vào ứng dụng

Tài liệu này là **đề xuất nối dây** cho agent điều phối (sở hữu
`main.js`, `preload.js`, `package.json`) và Agent 9 (UI). Agent 8 không
tự sửa các file đó. Hợp đồng được chứng minh độc lập bằng
`node test/warning-service.js` (test mô phỏng, sự kiện tổng hợp —
không phải bằng chứng chạy trong ứng dụng thật; phân biệt tầng kiểm
thử theo Mục 23).

## 1. Hợp đồng của lớp dịch vụ

File mới: `src/monitor/warningService.js` — chỉ phụ thuộc
`behaviorPatterns` (D2), `autoIpWarnings` (D3), `localDrift`,
`GraphDefense`; không phụ thuộc Electron.

```js
const { createWarningService } = require('./src/monitor/warningService');
const warningService = createWarningService(); // { evaluate, list, reset }

const report = warningService.evaluate({
  behaviorEvents,   // BehaviorMonitor#events — mảng {action, profileId, source, at}
  ipObservations,   // mảng {profileId, ip, observedAt, sessionId?} — xem mục 3
  healthDrift,      // localHealthDrift.report() | detectDrift() | snapshots[]
  monitorAlerts,    // tùy chọn: behaviorMonitor.getReport().alerts
});
```

Đầu ra `report`:
- `overall`: `high | medium | notice | normal | incomplete | error |
  not_measured`. `normal` chỉ khi **mọi** nguồn đã chạy và không có
  cảnh báo; còn nguồn chưa đo thì là `incomplete`/`not_measured`
  (Mục 16 — UI phải hiển thị trạng thái này, không ẩn).
- `sources`: theo từng nguồn `{status: ok | not_measured | error,
  reason?, ...số đếm}`. Nguồn lỗi dữ liệu → `error`, không bao giờ
  thành đạt.
- `warnings[]`: mỗi cảnh báo có đủ sáu thành phần bằng chứng Mục 22 —
  `title`, `observed{summary, profiles, sessionIds, count, values}`,
  `windowFrom/windowTo` (+ bản ISO), `evaluatedAt`, `method`,
  `criterion`, `limitation`, `nextSteps[]`, cộng `firstDetectedAt`,
  `lastDetectedAt`, `timesObserved` từ sổ đăng ký trong bộ nhớ.

## 2. Nối vào `main.js` (điều phối thực hiện)

1. Thêm require cạnh dòng require `behaviorMonitor` hiện có:
   ```js
   const { createWarningService } = require('./src/monitor/warningService');
   ```
2. Khởi tạo cạnh nơi `behaviorMonitor = new BehaviorMonitor(storageDir)`
   (khoảng dòng 814) và `localHealthDrift` (khoảng dòng 705):
   ```js
   warningService = createWarningService();
   ```
3. Thêm một IPC handler (kiểu *kéo* — đánh giá lười khi UI hỏi, không
   cần timer; chi phí bị chặn bởi giới hạn 1200 sự kiện / 20000 quan
   sát của các normaliser):
   ```js
   ipcMain.handle('get-warning-report', () => warningService.evaluate({
     behaviorEvents: behaviorMonitor.events,
     ipObservations: ipObservationStore.list(),
     healthDrift: localHealthDrift ? localHealthDrift.report() : null,
     monitorAlerts: behaviorMonitor.getReport().alerts,
   }));
   ```
   Ghi chú: `BehaviorMonitor#events` là trường công khai hiện tại.
   Nếu muốn đóng gói, điều phối có thể thêm `getEvents()` một dòng vào
   `behaviorMonitor.js` và dùng nó thay cho truy cập trường trực tiếp.
4. (Tùy chọn, quyết định của điều phối) API cục bộ: truyền thêm
   `warningService` vào `createApiServer(store, launcher, {...})`
   (main.js khoảng dòng 105) và thêm route đọc `GET /api/warnings`
   trong `src/api/server.js` trả cùng một `report`. API hiện chưa có
   route đọc cảnh báo D2/D3 (xem MAPPING.md mục 3).

## 3. Phần còn thiếu bắt buộc: nơi ghi quan sát IP thoát

D3 không có dữ liệu thật cho tới khi ứng dụng **ghi** quan sát. Đề
xuất tối thiểu, hoàn toàn trong phạm vi `main.js`/điều phối:

- Tạo một kho quan sát nhỏ cạnh `behavior-events.json`:
  `exit-ip-observations.json`, ghi dạng mảng
  `{profileId, ip, observedAt, sessionId}`, mode `0o600`, cắt giữ
  tối đa 20000 mục / 7 ngày (đề xuất; thời hạn lưu và khả năng xóa
  phải công bố theo Mục 20.3 — cùng chính sách như `behavior-events.json`
  là lựa chọn an toàn).
- `sessionId`: một mã sinh một lần cho mỗi lần chạy ứng dụng (phiên
  ứng dụng), sinh tại khởi động trong `main.js`. Đây là điều kiện để
  cảnh báo `ip_changed_mid_session` hoạt động.
- Điểm ghi: trong handler `start-browser` (main.js khoảng dòng 654),
  **sau khi mở hồ sơ thành công**, nếu hồ sơ có proxy đã cấu hình thì
  gọi `checkProxy(proxyCuaHoSo)` (hàm hiện có, đo qua
  `api.ipify.org`) và ghi quan sát với IP trả về. Lỗi đo (mất mạng,
  timeout) → **không ghi**, và không chặn việc mở hồ sơ; lần đo lỗi
  không được biến thành quan sát.
- Không dùng kết quả `proxyCenter.verify(...)` làm quan sát hồ sơ:
  nó kiểm tra proxy độc lập, không gắn với hồ sơ/phiên (Mục 19.3 —
  kết quả từ tiến trình quản lý không thay kết quả từ runtime của hồ
  sơ; ghi tại điểm mở hồ sơ là gần runtime nhất trong kiến trúc hiện
  tại, và giới hạn này phải ghi trong `limitation` khi diễn giải).

## 4. Nối vào `preload.js` và UI (Agent 9 + điều phối)

`preload.js` (cạnh `getBehaviorReport`, dòng 46):
```js
getWarningReport: () => ipcRenderer.invoke('get-warning-report'),
```

UI (Agent 9): hiển thị `report.warnings` trong panel hành vi hiện có
(`behavior-alert-list` trong `src/ui/renderer.js`) hoặc một mục
"Cảnh báo vận hành" riêng. Mỗi mục hiển thị: `title`,
`observed.summary`, hồ sơ liên quan, cửa sổ thời gian
(`windowFromIso`–`windowToIso`), `criterion`, `limitation`,
`nextSteps`. Các nguồn `not_measured`/`error` phải hiển thị thành
trạng thái CHƯA ĐO/lỗi kèm `reason` — không ẩn, không gộp thành
"ổn định" (Mục 16, 22). Cấm diễn đạt lại thành kết luận về nền tảng
hoặc "an toàn để chạy Ads" (Mục 11.3).

## 5. Đăng ký test vào `package.json` (điều phối)

Trong chuỗi `scripts.test`, sau đoạn
`node test/behavior-patterns.js && node --check src/monitor/behaviorPatterns.js`
thêm:
```
node test/warning-service.js && node --check src/monitor/warningService.js &&
```

## 6. Trạng thái kiểm chứng tại thời điểm bàn giao

- `node test/warning-service.js`: **PASS** (18 khối kiểm tra, sự kiện
  tổng hợp) trên Linux/Node v24 tại nhánh `agent-8/warnings-wiring`.
- Test của D2/D3/Health Drift hiện có: **PASS** (chạy lại sau khi thêm
  lớp dịch vụ).
- `test/behavior-monitor.js`: **NOT_RUN trong môi trường này** —
  clone nền chưa cài `node_modules` (`Cannot find module 'express'`
  qua `src/api/server.js`); lỗi tồn tại sẵn tại commit nền, không
  liên quan thay đổi của Agent 8 (không file tracked nào bị sửa).
- Chạy trong ứng dụng Electron / EXE Windows: **NOT_RUN** — thuộc
  cổng nghiệm thu 2–3 (Mục 12), cần điều phối tích hợp + máy Windows
  của chủ dự án.
