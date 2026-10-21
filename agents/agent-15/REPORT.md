# Báo cáo Agent 15 — Độ bền ở quy mô đội hồ sơ

**Nhánh:** `agent-15/fleet-scale`, nền `f4d7329`. **Tầng kiểm thử:** unit/integration
bằng dữ liệu TỔNG HỢP (không hồ sơ/cookie thật, không engine, không EXE).
**Môi trường đo (Mục 23):** máy này — Linux x86_64 (kernel 7.0.0-39-generic),
Node v24.20.0, 2 vCPU, ~8 GB RAM. Mọi con số dưới đây là của máy này; **không**
suy diễn sang máy Windows của khách. Máy là VM dùng chung nên số liệu dao động
giữa các lần chạy — báo cáo ghi khoảng dao động qua 3 lần chạy.

## 1. Store hồ sơ (src/db/store.js) — quy mô 10 / 50 / 100

Hỗn hợp tổng hợp: 25% Chromium native, 25% Chromium custom fingerprint,
25% Firefox, 25% Camoufox kèm blob danh tính ~24 KB (kích thước tương đương
blob thật; nội dung là filler tổng hợp).

| Chỉ số | 10 hồ sơ | 50 hồ sơ | 100 hồ sơ |
|---|---|---|---|
| db.json | 54.983 B | 321.483 B | 666.481 B (~6,7 KB/hồ sơ với hỗn hợp này) |
| Tạo toàn bộ (mỗi saveProfile ghi lại toàn bộ DB) | ~105 ms | 212–462 ms | 350–1.484 ms (≈3,5–15 ms/hồ sơ) |
| Nạp Store mới (đọc + parse toàn bộ) | ~1–2 ms | 5–32 ms | 6–10 ms |
| Một lần sửa hồ sơ (ghi lại toàn bộ DB) | ~0,5 ms | 6–14 ms | 6–22 ms |
| getProfiles() / lọc theo nhóm+engine | <1 ms | <1 ms | <1 ms |

Tính đúng đắn ở quy mô 100: đủ 100 hồ sơ, id không trùng, nạp lại từ đĩa giữ
nguyên 100 hồ sơ, blob danh tính nguyên vẹn sau vòng save/load.

**Kết luận:** ở quy mô mục tiêu 100 hồ sơ, không có điểm nghẽn — thao tác đắt
nhất (sửa một hồ sơ) ở mức vài chục ms. Đặc tính kiến trúc cần biết: mỗi lần
lưu ghi lại toàn bộ db.json nên chi phí một thao tác tăng tuyến tính theo
dung lượng DB; đây là đặc tính đã đo, không phải lỗi ở quy mô này.

## 2. ExitIpObservationStore — cap 20.000 mục / 7 ngày

| record() tại | Thời gian (trung vị) |
|---|---|
| 1.000 mục | 1,3–2,9 ms |
| 5.000 mục | 7,4–30 ms |
| 10.000 mục | 14–71 ms |
| 20.000 mục (cap) | 27,5–28,6 ms |

`record()` tốn O(n): mỗi lần ghi chạy prune (Date.parse × n) + stringify toàn
bộ + ghi lại toàn bộ file (~2,3 MB tại cap). Chi phí bị chặn bởi chính cap
20.000; trong ứng dụng record được gọi một lần mỗi lần mở trình duyệt
(fire-and-forget) nên mức này chấp nhận được. Ghi nhận là ứng viên tối ưu
trong tương lai (ghi gộp/nhật ký nối tiếp) nếu tần suất ghi tăng — không phải
lỗi.

Tính đúng đắn tại ngưỡng — **đều đạt**: tại đúng 20.000, ghi thêm 1 mục thì
chỉ mục cũ nhất bị rơi, mục mới nhất ở cuối, file trên đĩa khớp cap; seed
20.005 mục bị cắt đúng thành 20.000 mục mới nhất và giữ nguyên thứ tự; mục
quá 7 ngày bị prune hết, mục tươi giữ đủ.

## 3. BehaviorMonitor — cap 1.200 sự kiện / 24 giờ

- Seed 1.300 sự kiện → prune đúng còn 1.200, rơi đúng 100 sự kiện cũ nhất,
  thứ tự giữ nguyên, sự kiện mới nhất còn.
- record() tại cap (gồm ghi lại file + getReport): 1,8–7,2 ms; getReport()
  tại cap: 0,3–0,6 ms. Ghi tiếp tại cap: vẫn 1.200, mới vào/cũ ra đúng.
- Sự kiện quá 24 giờ và sự kiện ở tương lai đều bị prune; file trên đĩa khớp cap.

## 4. Độ bền khi ghi dở — một lỗi thật, đã sửa trong phạm vi module

**Bằng chứng:**
- Test giết tiến trình (SIGKILL giữa vòng ghi liên tục): exit-ip 8/8 vòng +
  24/24 vòng thăm dò thêm — file nguyên vẹn; Store hồ sơ 5/5 nguyên vẹn.
  Trên tổ hợp Linux/Node này, `writeFileSync` không bị quan sát thấy rách
  file khi tiến trình bị giết. Vector còn lại là sập hệ điều hành/mất điện
  giữa chừng khi ghi (sản phẩm chạy trên máy Windows của khách) và hỏng
  file từ bên ngoài.
- Trạng thái file rách được tái hiện xác định (cắt nửa tài liệu JSON):
  constructor cũ **âm thầm bỏ toàn bộ lịch sử** — nạp lại thấy 0 mục và bản
  gốc bị ghi đè mất ở lần ghi kế tiếp. ExitIpObservationStore là kho duy
  nhất trong ba kho **ghi thẳng vào file đích** (Store và BehaviorMonitor
  đều ghi file tạm + rename) và là kho duy nhất nuốt lỗi parse không một
  dấu vết.

**Đã sửa (`src/health/exitIpObservations.js`, chỉ trong module này):**
1. `persist()` ghi file tạm + `renameSync` — nguyên tử như hai kho còn lại:
   ghi dở chỉ có thể để lại trạng thái đầy đủ cũ hoặc mới, không bao giờ
   là file rách.
2. File hiện có mà không parse được (hoặc không phải mảng) được **bảo lưu**
   thành file kề bên `exit-ip-observations.json.corrupt-<dấu-thời-gian>`
   trước khi kho khởi động rỗng — theo đúng triết lý giữ dữ liệu hỏng của
   BehaviorMonitor; kho vẫn dùng được ngay sau đó.

**Test hồi quy** (`test/fleet-scale.js`, mục file rách): FAIL trên code cũ
(0 file `.corrupt` được tạo), PASS sau sửa. Các test sẵn có liên quan đều
PASS sau sửa: `integration-wiring` (gồm assert mode 0o600), `store-persistence`,
`auto-ip-warnings`, `warning-service`. Riêng `test/behavior-monitor.js` FAIL
trong clone này vì thiếu `node_modules` (`Cannot find module 'express'`) —
**fail y hệt trên nền nguyên trạng**, là vấn đề môi trường có từ trước,
không phải hồi quy; BehaviorMonitor được kiểm chứng trực tiếp ở mục 3.

## NOT_RUN / giới hạn

- Không chạy trên Windows/EXE (cổng nghiệm thu riêng); hành vi ghi file trên
  NTFS chưa được đo ở đây.
- Không có đội hồ sơ khách thật; blob danh tính là filler có kích thước
  tương đương, chi phí parse/stringify phụ thuộc kích thước là chính.
