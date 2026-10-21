# INTEGRATION NOTES — Agent 3 (Vòng đời hồ sơ)

## Đề xuất cho agent điều phối (file chung — Agent 3 không tự sửa)

1. **package.json — thêm test vòng đời vào chuỗi `test`:**
   chèn `node test/profile-lifecycle.js` vào script `test` (gợi ý đặt sau
   `node test/per-profile-engine-factory.js`). File test đã tồn tại trong
   nhánh `agent-3/profile-lifecycle`; không thêm sẽ không chạy trong CI.
2. **Không cần sửa** main.js / preload.js / index.html / workflow cho phần
   việc của Agent 3. Fix ở `src/engine/CamoufoxPlaywrightController.js`
   tương thích ngược hoàn toàn (chỉ thay đổi đường dọn dẹp khi launch lỗi).

## Tóm tắt thay đổi trong nhánh này

- `src/engine/CamoufoxPlaywrightController.js` — sửa lỗi đóng gateway hai
  lần trên đường launch lỗi sau khi session đã đăng ký (xem MAPPING.md §2).
  Hành vi ở mọi đường khác giữ nguyên; toàn bộ test Camoufox sẵn có vẫn PASS.
- `test/profile-lifecycle.js` (mới) — 7 nhóm test vòng đời: chu trình
  mở/đóng/mở lại; crash giữa phiên (Chromium, controller, native adapter);
  mở đồng thời hỗn hợp engine; 409 khi đang đóng; provider mismatch ở kết
  quả factory; giữ engine sau "khởi động lại app" (Store/Launcher mới).
- `MAPPING.md` (mới) — bản đồ module + đối chiếu tiêu chí Hiến pháp v1.3.

## Điều kiện tích hợp / lưu ý cho các agent khác

- Test của Agent 3 chạy ở mức Node mô phỏng/integration (tiến trình giả,
  context giả). Cần `node_modules` đã cài (express cho `src/api/server.js`).
- NOT_RUN (mọi agent phải giữ nguyên trạng thái này cho tới Đợt D):
  mở/đóng/crash bằng engine thật trên Windows, EXE đóng gói, cổng 3–4
  của Mục 12 Hiến pháp. Không kết luận nào của Agent 3 thay cho các cổng đó.
- Không đổi mặc định engine; không đổi hành vi API công khai; các đường
  HTTP 409 giữ nguyên ngữ nghĩa.
