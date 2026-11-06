# OPEN ISSUES — Danh sách lỗi/vấn đề còn mở (Agent 10, mở tại đợt A)

Trạng thái ban đầu lập ngày 2026-10-21 trên commit nền
`8349f38b829a133ab53bc4b0a874c3f7b4ff8b22`. Mỗi issue ghi: mức độ, bằng
chứng tái hiện/đọc code, điều kiện đóng. Agent 10 chỉ ghi nhận, không
tự vá code tính năng.

## Cập nhật 2026-11-06

Đã đóng (có bằng chứng):

- **QA-002**: `.gitignore` đã có các mẫu `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `*private*key*`.
- **QA-003**: `GET /api/profiles` đi qua `apiProfile()` trong `src/api/server.js`, hàm này bỏ `notes` và che blob danh tính, giống cách `/api/v1/user/list` đã làm.
- **QA-006**: CI có thêm job `linux-tests` (ubuntu, `npm test`) chạy trên mọi PR. Lần chạy đầu tiên lộ thêm 3 lỗi đường dẫn đã sửa: `AndroidManager.tool()` dựng đường dẫn SDK bằng quy tắc của máy chủ thay vì của nền tảng đang điều khiển, cùng hai fixture dùng chuỗi Windows.
- **QA-004**: README không còn câu "miễn phí vĩnh viễn"; nó nói rõ bản dùng thử 10 ngày, tối đa 10 hồ sơ, và các gói license trả phí.
- **QA-005**: `npm test` đã có runner gom kết quả. Nó chạy hết mọi bước kể cả khi có bước fail và in `steps run: N of N | PASS | FAIL`.

Lỗi bảo mật và độ ổn định đã sửa sau ngày lập danh sách:

- Tắt hồ sơ êm, tách file tải về theo hồ sơ: #84.
- Proxy gateway chỉ phục vụ trình duyệt của chính hồ sơ: #85.
- Cổng CDP tắt mặc định: #86.
- Nâng Electron 33 (đã hết hỗ trợ) lên 44, và chỉ báo "đã sao chép" khi clipboard thật sự có dữ liệu: #87.
- Vá `body-parser` (lỗi DoS), nâng `electron-builder` lên 26 (bỏ lỗi `tar` mức critical). Sửa chế độ chụp UI của CI để nó không ghi `Local State` và bộ nhớ đệm GPU vào dữ liệu thật của khách.

Vẫn mở:

- QA-001: chờ chủ dự án quyết định.

Đối chiếu `docs/decisions/OWNER-DECISIONS-CONSOLIDATED.md` với code ngày 2026-11-06. Các mục sau đã được cài sẵn, chủ dự án chỉ cần xác nhận hoặc đổi:

- F3 = 1: xoá vĩnh viễn thì xoá luôn snapshot phiên (`PROFILE_PURGE_ONLY_ROOTS` trong `src/db/store.js`), và hộp xác nhận có nói rõ.
- F4 = 2: xoá vĩnh viễn thì xoá luôn các workflow gắn với hồ sơ (`store.onProfilePurged` trong `main.js`). Hộp xác nhận có nói chung chung nhưng chưa liệt kê tên workflow.
- D1 = 1: chỉ kiểm tra cập nhật khi người dùng bấm.
- D2 = 1: kênh cập nhật là GitHub Releases.
- D4 = 2: chỉ tải khi người dùng bấm, có kiểm chữ ký và hash; app không tự chạy bộ cài.
- QD-04: không còn áp dụng. Workflow giờ được sửa qua PR bình thường.

Khoá công khai ký cập nhật đã có từ 2026-11-06 (`resources/update-publisher/update-publisher-ed25519.pub`, vân tay SPKI `38f6fa46…f228`, được `test/update-trust-anchor.js` ghim). Khoá riêng đã mã hoá và mật khẩu của nó nằm ngoài repo, trên máy chủ dự án. Chỉ bộ cài build từ commit có khoá này mới nhận được cập nhật online, nên khách phải được giao tay một bộ cài như vậy ít nhất một lần.

Khoá phát hành license được tạo mới ngày 2026-11-06, vì khoá riêng ứng với khoá cũ (`4fa87829…`) không còn. Khoá công khai mới (`725db621…dff0`) nằm trong app và trong Worker, được `test/license-trust-anchor.js` ghim. Mọi license đã ký bằng khoá cũ đều mất hiệu lực.

Máy chủ license online `browser.lhmcrm.com` chưa được dựng: DNS không có bản ghi, workflow deploy chưa chạy lần nào, môi trường `production` mới có `CLOUDFLARE_API_TOKEN`. Trong lúc chưa có máy chủ, việc bán chạy bằng token `strict` cấp offline (`tools/license-admin.js`), và đó là mặc định của lệnh cấp.

Gói nghiệm thu Gate 3 phải lấy từ một bản build `main` có khoá này. Gói cũ cho `6f3ef60` không có khoá.
- QA-007, QA-008, QA-009: nằm ngoài phạm vi các đợt sửa trên.
- QA-010: chưa xong. Agent đã cài thử bộ cài NSIS, nâng cấp đè lên bản cũ và gỡ cài đặt trên máy Windows của chủ dự án, với dữ liệu cô lập. Nhưng cổng nghiệm thu của chính chủ dự án, ký số và máy Windows sạch vẫn NOT_RUN.

Ghi chú: 6 cảnh báo mức trung bình còn lại của `npm audit` đều là `minimatch`. Gói này chỉ có trong công cụ build và chỉ xử lý mẫu glob do dự án tự viết.

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
