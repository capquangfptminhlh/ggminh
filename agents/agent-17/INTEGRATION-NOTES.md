# INTEGRATION NOTES — Agent 17 (xoá dữ liệu + sao lưu)

## Điều phối cần làm

1. **Thêm test vào chuỗi `npm test`** (package.json thuộc điều phối):
   `node test/profile-deletion-backup-drill.js` — đặt cạnh
   `test/profile-trash.js`. Test tự chứa, không cần engine/mạng.
2. **Bản sửa `src/db/store.js` đi kèm trong nhánh này** (hằng số
   `PROFILE_DATA_ROOTS` + dùng trong `cleanupTrashedFolders()` và
   `deleteProfile()`) — khi gộp, giữ nguyên; đây là sửa lỗi thật F1
   đã có test tái hiện trước/sau.

## Việc cần chủ dự án quyết (không tự sửa)

3. **F3 — Snapshot phiên sau purge:** purge hiện không xoá
   `session-snapshots/<id>/`. Ba hướng: (a) purge xoá luôn snapshot
   của hồ sơ; (b) giữ nguyên nhưng UI purge phải nói rõ "snapshot
   phiên đã tạo sẽ còn lại"; (c) cảnh báo khi purge nếu còn snapshot.
   Khuyến nghị tối thiểu (b) — không im lặng. Fix thuộc
   `src/ops/sessionSnapshots.js`/UI, ngoài phạm vi file của Agent 17.
4. **F4 — Workflow treo sau purge:** `automation-workflows.json`
   giữ workflow tham chiếu id hồ sơ đã xoá vĩnh viễn. Hướng xử lý:
   chặn purge khi còn workflow tham chiếu (kèm thông báo), hoặc xoá
   workflow cùng purge sau xác nhận. Cần quyết trước khi sửa vì liên
   quan hành vi người dùng thấy được.

## Ghi nhận phụ (không thuộc phạm vi, không chặn)

5. `src/privacy/isolation.js` (`isolatedPaths`) chỉ biết
   `profiles/` và `gecko-profiles/` — không có khái niệm
   `camoufox-profiles/`. Nếu module này được dùng làm bản đồ đường
   dữ liệu cho các phép đo cách ly (Mục 17.2), đường Camoufox đang
   vắng trong bản đồ đó; đề nghị agent sở hữu đo cách ly đối chiếu.
6. Gỡ cài đặt: `build.nsis.deleteAppDataOnUninstall` chưa đặt —
   theo cấu hình, uninstall để lại toàn bộ cây `storage`. Nếu chủ
   dự án muốn uninstall hỏi/xoá dữ liệu, đây là thay đổi cấu hình
   đóng gói (Agent 1 sở hữu RELEASE-PIPELINE) + cần nghiệm thu
   Windows; sổ tay khách hàng hiện đã hướng dẫn xoá thủ công, khớp
   với cấu hình hiện tại.
