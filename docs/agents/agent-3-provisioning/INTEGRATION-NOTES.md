# INTEGRATION NOTES — Agent 3 (đợt thương mại): Provisioning chạy thật

Nhánh `agent-3/provisioning-real-run`, nền `07150d6`. Bằng chứng chạy
thật: `provisioning-real-run-results.json` cùng thư mục (hồ sơ Mục 23:
commit, engine SHA-256, OS, Node, gói generator, kết quả từng bước).

## Thay đổi trong phạm vi agent (điều phối không cần sửa gì thêm)

1. `src/engine/camoufoxProvisioning.js` — hai sửa chữa từ chạy thật:
   - **Nguồn locale**: trước đây chỉ đọc `fingerprint.language` (số
     ít) — trường mà fingerprint chuẩn của repo
     (`src/engine/fingerprint.js`) không hề có; hồ sơ khai `languages`
     (mảng) bị sinh với `locale=null`, cho danh tính có kỳ vọng ngôn
     ngữ `null` (đã tái hiện 2/2 lần trên code gốc). Nay: ưu tiên
     `language`, dự phòng `languages[0]`.
   - **Cổng nhất quán ngay tại provisioning**: sau
     `validateStoredIdentity`, chạy thêm
     `assertIdentityMatchesProfile`; danh tính mâu thuẫn trường đã
     khai của hồ sơ → không gắn, trạng thái `invalid` /
     `generated-identity-contradicts-profile`. Trước đây danh tính
     như vậy vẫn được gắn và chỉ vỡ ở lần mở hồ sơ sau đó.
   `main.js` đã gọi `provisionCamoufoxIdentity` từ Đợt C — bản sửa
   chảy thẳng qua, không cần nối lại.
2. `test/camoufox-provisioning-real.js` — test chạy thật mới (xem
   mục dưới).

## Đề xuất cho điều phối

- **Không** đưa `test/camoufox-provisioning-real.js` vào chuỗi
  `npm test` thường: nó cần engine thật + gói generator, tự báo
  NOT_RUN (exit 2) khi thiếu điều kiện. Đặt nó cạnh các lần chạy
  stage0/engine thật (máy có engine đã kiểm chứng), giống vị trí của
  `stage0-measure/run-config.js`.
- Lưu ý mong manh (chưa cần hành động): việc ghi phiên bản generator
  dựa vào `require('camoufox/package.json')`; gói 0.5.8 không có
  exports map nên chạy được (đã kiểm chứng thật). Nếu bản camoufox
  tương lai thêm exports map mà không mở `./package.json`, generator
  sẽ ghi `unknown` và validator sẽ từ chối theo fail-closed — hành vi
  an toàn, nhưng provisioning sẽ báo `invalid` thay vì chạy; khi nâng
  cấp gói cần kiểm tra điểm này trước.

## Trạng thái theo Mục 23

- PASS: sinh thật 2 danh tính (en-US/America/New_York,
  vi-VN/Asia/Ho_Chi_Minh, ràng buộc os='windows') qua `defaultGenerate`
  + gói chính thức; validator + cổng nhất quán đạt; expectations đủ
  9/9 trường; replay env đúng định dạng controller (chunk ≤ 2047,
  nối khớp byte); phiên Camoufox thật trên Linux/headless: 7/7 trường
  so được khớp kỳ vọng cho cả hai hồ sơ.
- NOT_RUN: so khớp WebGL trong phiên thật (headless Linux không tạo
  được WebGL context — 0 trường so được, không phải lệch); toàn bộ
  đường Windows (camoufox.exe + CI).
- Không kết luận gì về việc nền tảng có liên kết các hồ sơ hay
  không — mọi kết quả trên là quan sát phía trình duyệt.
