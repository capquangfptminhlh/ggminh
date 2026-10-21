# INTEGRATION NOTES — Agent 8 (đợt thương mại hoá): lưu bền lịch sử cảnh báo

## Đã giao (không chạm file chung nào)

- `src/monitor/warningHistory.js` — kho lịch sử cảnh báo bền:
  `createWarningHistory({ storageDir, now?, maxEntries?, maxAgeMs?,
  countMode? })` → `{ load, record, entries, seedRecords, status,
  clear, file }`. File `warning-history.json` trong storageDir, ghi
  nguyên tử (tmp + rename), mode 0o600 (POSIX).
- `test/warning-history.js` — 8 khối test, tất cả PASS (xem báo cáo).

## Thiết kế cốt lõi điều phối cần biết

1. **Rào chắn Mục 20.3 là cấu trúc, không phải quy ước:** mọi bản ghi
   qua `projectWarning()` — whitelist đúng hình dạng cảnh báo đã chuẩn
   hoá của Mục 22 + 3 trường sổ đăng ký (`firstDetectedAt`,
   `lastDetectedAt`, `timesObserved`). Trường lạ (kể cả nội dung form/
   phím gõ nếu một caller lỗi gắn vào) bị loại trước khi chạm đĩa —
   test khối 4 chứng minh bằng cách đọc file thô.
2. **File hỏng → `load()` trả `status:'error'`, 0 mục được tin** (JSON
   hỏng, sai version, một mục sai định dạng, `timesObserved` bị sửa
   thành 0 — đều error). Không bao giờ có trạng thái kiểu pass/normal.
3. **Hai chế độ đếm — phải đi cặp với cách nối warningService:**
   - `countMode:'delta'` (mặc định) ↔ warningService **nguyên bản**:
     service khởi động lại bộ đếm ở 1 mỗi lần chạy app; kho gấp phần
     tăng trong phiên vào tổng bền. firstDetectedAt giữ mốc đầu tiên
     vĩnh viễn.
   - `countMode:'authoritative'` ↔ warningService **đã áp diff seed ở
     mục B**: bộ đếm của service đã là tổng tích luỹ nên kho lấy max.
   Áp diff seed mà quên đổi countMode (hoặc ngược lại) sẽ đếm đôi/
   đếm thiếu — hai thay đổi phải đi cùng nhau.
4. **Retention (Mục 20.3):** tối đa 1.000 cảnh báo phân biệt; mục hết
   hạn 90 ngày sau lần phát hiện CUỐI. Lý do: đầu vào thô giữ ngắn hơn
   nhiều (sự kiện hành vi 24h/1.200 mục; quan sát IP 7 ngày/20.000
   mục) nhưng sổ cảnh báo là bản ghi tối thiểu đã kết luận — người
   dùng cần trả lời "cái này xuất hiện từ khi nào" theo chu kỳ rà
   soát hàng quý. Đổi số tại hằng số đầu file
   (`WARNING_HISTORY_MAX_ENTRIES` / `WARNING_HISTORY_MAX_AGE_MS`).

## A. Nối vào main.js (điều phối thực hiện — mức tối thiểu, không cần sửa warningService.js)

Hiện trạng: `warningService = createWarningService();` tại whenReady
(~dòng 870, cạnh `ipObservationStore`), và handler IPC
`get-warning-report` (~dòng 720) gọi `warningService.evaluate({...})`.

```js
// 1) require (cạnh dòng 15-16):
const { createWarningHistory } = require('./src/monitor/warningHistory');

// 2) biến module (cạnh dòng 68-69):
let warningHistory = null;

// 3) whenReady, TRƯỚC hoặc cạnh dòng 870:
try {
  warningHistory = createWarningHistory({ storageDir }); // countMode 'delta'
  const loaded = warningHistory.load();
  if (loaded.status === 'error')
    console.warn('[warning-history]', loaded.reason); // bề mặt hoá, đừng nuốt
} catch (_) { warningHistory = null; }

// 4) trong handler 'get-warning-report': giữ lại report và lưu sau mỗi evaluate:
ipcMain.handle('get-warning-report', () => {
  if (!warningService) warningService = createWarningService();
  const report = warningService.evaluate({ /* ...nguyên như hiện tại... */ });
  if (warningHistory) {
    warningHistory.record(report); // {ok:false} chỉ khi ghi đĩa lỗi — status() lộ ra
    report.history = warningHistory.entries();
    report.historyStatus = warningHistory.status();
  }
  return report;
});

// 5) xoá theo yêu cầu người dùng (Mục 20.3) — IPC mới, cạnh các handler bảo trì:
ipcMain.handle('clear-warning-history', () => {
  if (warningService) warningService.reset();       // xoá cả sổ trong RAM
  return warningHistory ? warningHistory.clear() : { ok: false, error: 'history not initialised' };
});
```

Ghi chú: `record()` tự `load()` lần đầu nếu điều phối quên, nên không
có đường nào ghi đè mất lịch sử cũ. Với cách nối mức tối thiểu này,
báo cáo trong-phiên của service vẫn khởi động bộ đếm ở 1 sau mỗi lần
mở app — sự thật bền nằm ở `report.history` (đây là giới hạn đã biết,
không phải lỗi). Muốn chính service khôi phục trạng thái thì áp mục B.

## B. Diff tối thiểu vào warningService.js (ĐỀ XUẤT — chưa áp; agent không sửa file này)

Thêm tuỳ chọn `seed` cho `createWarningService` (~6 dòng):

```diff
-function createWarningService({ now = () => Date.now() } = {}) {
+function createWarningService({ now = () => Date.now(), seed = null } = {}) {
   if (typeof now !== 'function') throw Error('now must be a function');
   const registry = new Map();
+  // Optional durable-history seed (warningHistory.seedRecords()):
+  // restores firstDetectedAt / timesObserved across app restarts.
+  // Seeded entries are replaced by fresh normalised warnings on the
+  // next evaluate(); evaluate() already carries the three bookkeeping
+  // fields over from the previous registry entry, so no other change
+  // is needed.
+  if (Array.isArray(seed)) for (const w of seed) {
+    if (isRecord(w) && typeof w.id === 'string' &&
+        Number.isFinite(w.firstDetectedAt) &&
+        Number.isInteger(w.timesObserved) && w.timesObserved > 0)
+      registry.set(w.id, w);
+  }
   let lastSources = {};
```

Khi áp diff này, đổi cách khởi tạo ở main.js thành:

```js
warningHistory = createWarningHistory({ storageDir, countMode: 'authoritative' });
// ...sau load() thành công:
warningService = createWarningService({ seed: warningHistory.seedRecords() });
```

(cả hai chỗ tạo service: whenReady ~870 và lazy fallback trong
handler ~721 — chỗ lazy nên dùng cùng seed nếu warningHistory có sẵn.)

## C. Đề xuất chuỗi test (package.json — file chung, điều phối áp)

Thêm sau `node test/warning-service.js`:

```diff
+ && node test/warning-history.js && node --check src/monitor/warningHistory.js
```

## NOT_RUN / giới hạn

- Chạy trong Electron thật sau khi nối: thuộc điều phối (mức test ở
  đây là unit/integration bằng Node thuần + service thật, không phải
  EXE — Mục 23).
- Mode 0o600 là bảo đảm POSIX; trên Windows Node chỉ tôn trọng một
  phần cờ mode — file nằm trong thư mục dữ liệu riêng của người dùng
  (ACL theo tài khoản Windows), cùng tính chất với các file monitor
  hiện có. Chưa đo trên Windows.
