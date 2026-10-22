# Ghi chú tích hợp — Agent 15 (độ bền quy mô đội hồ sơ)

## Đã tự chứa trong nhánh này (điều phối không cần nối dây)

- `src/health/exitIpObservations.js`: sửa độ bền trong phạm vi module —
  persist nguyên tử (tmp + rename) và bảo lưu file không parse được thành
  `.corrupt-<timestamp>`. Không đổi API, không đổi định dạng file, không
  đổi chính sách retention (20.000 mục / 7 ngày). Người tiêu thụ hiện tại
  (main.js ghi fire-and-forget, warningService đọc qua `list()`) không
  bị ảnh hưởng.
- `test/fleet-scale.js`: bộ test/benchmark mới (Store 10/50/100 hồ sơ,
  hai kho tại cap, giết tiến trình khi ghi, hồi quy file rách).

## Đề xuất cho điều phối

1. Thêm `node test/fleet-scale.js` vào chuỗi `npm test` trong package.json
   (đặt gần `node test/integration-wiring.js`). Lưu ý: test spawn tiến
   trình con và chỉ ghi vào thư mục tạm của hệ điều hành; thời gian chạy
   ~10–20 giây trên máy này. Trên CI Windows cần một lần chạy xác nhận —
   test dùng SIGKILL qua child_process (Node hỗ trợ trên Windows ở mức
   terminate tiến trình) nhưng hành vi thực tế chưa được đo trên Windows.
2. Không cần thay đổi nào ở main.js/preload.js.

## Ghi nhận để quyết sau (không chặn phát hành ở quy mô hiện tại)

- `ExitIpObservationStore.record()` là O(n) theo số mục đã lưu (prune +
  stringify + ghi toàn bộ file mỗi lần): ~28 ms tại cap 20.000 trên máy
  đo này. Nếu sau này tần suất ghi tăng (ví dụ ghi theo phiên thay vì
  theo lần mở), cân nhắc ghi gộp theo lô hoặc nhật ký nối tiếp.
- `Store.saveData` ghi lại toàn bộ db.json mỗi thao tác (~6–22 ms ở 100
  hồ sơ trên máy đo này) — tuyến tính theo kích thước DB; chỉ đáng xem
  lại khi quy mô vượt xa 100 hồ sơ.
