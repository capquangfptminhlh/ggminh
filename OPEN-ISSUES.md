# OPEN ISSUES — Danh sách lỗi/vấn đề còn mở (Agent 10, mở tại đợt A)

Trạng thái ban đầu lập ngày 2026-10-21 trên commit nền
`8349f38b829a133ab53bc4b0a874c3f7b4ff8b22`. Mỗi issue ghi: mức độ, bằng
chứng tái hiện/đọc code, điều kiện đóng. Agent 10 chỉ ghi nhận, không
tự vá code tính năng.

| ID | Mức | Vấn đề | Bằng chứng | Đóng khi |
|---|---|---|---|---|
| QA-001 | Cần quyết định chủ dự án | `NetworkSafetyCheck.evaluate` cho hồ sơ Camoufox kết nối **direct** trả `safeToLaunch:true` mã `PREFLIGHT_ONLY` dù an toàn mạng chưa được chứng nhận. Là quyết định thiết kế đã ghi trong code, nhưng có thể xung đột với diễn giải nghiêm ngặt của Mục 19.4 Hiến pháp. | `src/engine/NetworkSafetyCheck.js` hàm `evaluate` (nhánh `proxy.type==='direct'`); `EngineFactory.launchProfile` chỉ chặn khi `safeToLaunch=false` | Chủ dự án chốt: giữ PREFLIGHT_ONLY cho direct, hay chặn tới khi có phép đo mạng. |
| QA-002 | LOW | `.gitignore` chưa có mẫu khóa (`*.pem`, `*.key`, `*.p12`, `*.pfx`) — repo hiện sạch nhờ kỷ luật, chưa có rào chắn kỹ thuật chống commit nhầm khóa. | `.gitignore` hiện tại (6 dòng); `git ls-files` không có file khóa | Thêm mẫu vào `.gitignore` và rà soát lại `git ls-files`. |
| QA-003 | LOW | `GET /api/profiles` trả toàn bộ publicProfile (gồm ghi chú + blob danh tính đã ghim) trong khi `GET /api/v1/user/list` đã rút gọn — tối thiểu dữ liệu không nhất quán. API nằm sau API key + loopback nên rủi ro thấp. | `src/api/server.js` (hai endpoint); `src/db/store.js` `publicProfile` | Hai endpoint cùng một chính sách dữ liệu, hoặc ghi rõ lý do endpoint đầy đủ tồn tại. |
| QA-004 | LOW (thương mại) | README dòng 5: "miễn phí vĩnh viễn" — cam kết kinh doanh không kiểm chứng được từ repo. | `README.md:5` | Chủ dự án xác nhận giữ/bỏ; ngoài phạm vi kỹ thuật. |
| QA-005 | Trung bình (quy trình) | Chuỗi `npm test` nối bằng `&&`: trên Linux dừng ở bước 31/173 (`browser-diagnostics`) và che khuất kết quả 142 bước sau trong một lần chạy nguyên trạng. Nguy cơ: người chạy test tưởng "gần như toàn bộ fail/chưa chạy". | Chạy `npm test` nguyên trạng 2026-10-21: exit 1 tại bước 31 (log đợt A) | Có cách chạy tổng hợp báo cáo mọi bước (runner gom kết quả) hoặc ghi rõ trong tài liệu kiểm thử; hai fixture Windows (QA-006) được xử lý/nêu rõ. |
| QA-006 | Thấp (test) | Hai test fail trên Linux do fixture phụ thuộc ngữ nghĩa đường dẫn Windows: `test/browser-diagnostics.js:20` (`path.isAbsolute` POSIX loại đường `C:\...` trước stub `existsSync`) và `test/runtime-registry.js:16` (kiểm tra ký tự ổ đĩa chạy trước kiểm tra tên file, thư mục tạm Linux không có ký tự ổ đĩa). **Đã tái hiện giống hệt trên main gốc 77075f3** — không phải hồi quy. | Log chạy từng bước đợt A + chạy đối chiếu trên clone main 77075f3 | Fixture dùng đường dẫn hợp lệ theo nền tảng chạy, hoặc test tự ghi NOT_RUN/có điều kiện nền tảng; không nới lỏng logic fail-closed để chiều test. |
| QA-007 | Cao (phạm vi đo) | Cụm **proxy/DNS/WebRTC/IPv6/QUIC vẫn CHƯA ĐO trên đường chạy thật** ở mọi báo cáo tới nay; phép đo WebRTC hiện có (`NetworkSafetyCheck.inspectContext`) mới ở tầng mock và tự kết luận tối đa INCONCLUSIVE, DNS luôn NOT_TESTED. | Mục 4.1 Hiến pháp (cột Trạng thái); test integration tự khai "mocked lab" | Có lab mạng được duyệt + phép đo trên runtime thật của hồ sơ, cập nhật cột Trạng thái Mục 4 theo đúng kết quả. |
| QA-008 | Cao (tích hợp) | D2 (mẫu hành vi), D3 (cảnh báo IP tự động), cảnh báo trôi IP/gộp đội hồ sơ của Hộ vệ Liên đới: mới là **module + test**, chưa có caller trong ứng dụng (đúng như Mục 10 Hiến pháp ghi). "Đã có module" không được tính là chức năng sản phẩm. | Mục 10 Hiến pháp; `grep` caller trong `main.js`/`src` ngoài thư mục của chính module | Có đường nối vào ứng dụng và bằng chứng cảnh báo tới được người dùng, đúng mẫu 6 câu hỏi của Mục 22. |
| QA-009 | Trung bình (đo) | Đầu đo runtime chưa có các trường WebGL (vendor/renderer/params), canvas hash, audio hash, fonts, voices, Client Hints — kỳ vọng danh tính D1 có chứa WebGL nhưng **không trường nào được đo** (đúng ghi nhận rà soát PR #17). | Mục 4.2–4.4 Hiến pháp (CHƯA ĐO); `stage0-measure/core.js` không có probe WebGL | Đầu đo phủ các trường trên và phép đo chạy được ở tầng engine thật. |
| QA-010 | Cao (nghiệm thu) | Toàn bộ cổng 3–4 Mục 12 **NOT_RUN**: chưa nghiệm thu EXE cài đặt trên máy Windows thật của chủ dự án (gói bằng chứng), chưa gắn tag v5.7.0, chưa gộp main. Thêm: ba trạng thái code lệch nhau (GitHub / nhánh D1 / checkout local của chủ dự án kèm thay đổi chưa commit) chưa đối chiếu hợp nhất (Mục 13). | Mục 10, 12, 13 Hiến pháp; hồ sơ dự án | Chủ dự án cung cấp máy Windows + quyết định; các agent không tự thay thế cổng này bằng CI. |

## Vấn đề đã kiểm tra và KHÔNG mở issue (kèm lý do)

- "Hai test fail trên Linux" từng được kể là do nền tảng: đã **tự tái
  hiện trên main gốc** và đọc code xác định cơ chế — đúng là nền tảng,
  nhưng vẫn mở QA-006 để fixture được sửa cho minh bạch, không để lời
  kể thay bằng chứng.
- Nghi vấn fallback ngầm khi engine lỗi: quét + đọc code toàn bộ đường
  launch — **không tồn tại** (xem QA-BASELINE trục 1).
- Nghi vấn khóa riêng trong repo/gói engine: quét toàn repo — **không
  tồn tại** tại commit nền.
