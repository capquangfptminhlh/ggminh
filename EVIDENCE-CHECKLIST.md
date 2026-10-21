# EVIDENCE CHECKLIST — Mẫu kiểm chứng bàn giao của 9 agent (Agent 10, đợt B)

Dùng để rà soát mọi bàn giao trong chương trình triển khai theo Hiến
pháp v1.3. Nguyên tắc phán quyết (Mục 9, 14, 16, 22, 23):

- Mỗi kết luận thuộc đúng một mức: **quan sát đo được / suy luận từ
  code / chưa xác minh**. Suy luận không được trình bày như đã đo.
- Trạng thái chỉ có **ĐẠT / KHÔNG ĐẠT / CHƯA ĐO**; lỗi thu thập (thiếu
  môi trường, timeout, thiếu quyền) ghi lý do riêng dưới CHƯA ĐO hoặc
  NOT_RUN — **không bao giờ** chuyển thành ĐẠT.
- Tầng bằng chứng phải ghi rõ: **mô phỏng (mock) / integration /
  engine thật / EXE thật qua giao diện**. Kết quả tầng dưới không thay
  thế tầng trên (Mục 23). PASS của test tự khai "mocked lab" chỉ là
  bằng chứng tầng mô phỏng.
- CI xanh hoặc test đơn vị đạt **không** phải căn cứ phát hành (Mục 9.3).
- Không kết luận nền tảng đã/chưa liên kết hồ sơ từ kết quả phía trình
  duyệt (Mục 3.3, 19.2). Không thu nội dung phím gõ, mật khẩu, clipboard,
  cookie thật của khách cho bất kỳ phép đo nào (Mục 20.3).

## A. Trường hồ sơ bắt buộc cho MỌI kết quả đo (Mục 23)

Mỗi bàn giao kèm phép đo phải có đủ:

- [ ] Commit của code được đo (full hash) và nhánh
- [ ] Phiên bản + SHA-256 của engine (nếu có engine tham gia)
- [ ] Hệ điều hành + môi trường (máy thật / VM / runner; Windows build nếu là Windows)
- [ ] Cấu hình liên quan, đã loại bỏ bí mật
- [ ] Thời gian đo + phương pháp + phạm vi đo (đo những trường/điểm nào)
- [ ] Kết quả kỳ vọng vs thực tế, số trường đã đo ghi đúng số (không "khớp toàn bộ" khi còn trường thiếu)
- [ ] Danh sách phần CHƯA ĐO / NOT_RUN kèm lý do từng mục
- [ ] Điều kiện hết hiệu lực (mục C dưới đây)

## B. Yêu cầu theo từng agent

### Agent 1 — Kiến trúc & tích hợp
- [ ] Bảng đối chiếu: Tiêu chí (Mục Hiến pháp) → Code hiện có → Phần thiếu → Agent phụ trách → Phép thử → Bằng chứng
- [ ] Mọi file chung (package.json, main.js, preload.js, workflow) chỉ do điều phối sửa; đề xuất của agent khác nằm trong INTEGRATION-NOTES, có diff đọc được
- [ ] Không module mới trùng chức năng module đã có (đối chiếu kiểm kê ở đợt A)

### Agent 2 — Nguồn engine
- [ ] Digest: kích thước + SHA-256 của artifact khớp nguồn phát hành chính thức (ghi rõ nguồn đối chiếu và ngày)
- [ ] Manifest: chữ ký Ed25519 hợp lệ bằng khóa publisher (khóa riêng KHÔNG xuất hiện trong repo/log/báo cáo)
- [ ] Đường từ chối: artifact sai digest/chữ ký phải bị chặn trước khi chạy — có test hoặc bản ghi chạy thật
- [ ] Kiểm tra digest thực hiện TRƯỚC lần chạy engine đầu tiên trong quy trình (không chạy rồi mới đối chiếu)

### Agent 3 — Vòng đời hồ sơ
- [ ] Mở/đóng/mở lại/crash: có bản ghi từng kịch bản, tách tầng integration vs engine thật
- [ ] Hồ sơ cũ giữ nguyên engine sau mọi thay đổi (kiểm chứng bằng hồ sơ mẫu có engine_type cũ)
- [ ] Lỗi engine → throw rõ ràng; bằng chứng KHÔNG có đường tự chuyển engine (đọc diff, không chỉ nghe báo cáo)
- [ ] Đóng lỗi/đóng dở: trạng thái tiến trình và khóa hồ sơ sau crash được ghi lại

### Agent 4 — Kiểm chứng cấu hình (D1)
- [ ] Test chứng minh env danh tính **thật sự tới** lệnh/context khởi chạy engine (điểm mù đã biết của PR #17) — assert trên đối tượng launch thật hoặc spy, không chỉ kiểm tra hàm sinh env
- [ ] Công cụ sinh danh tính chạy end-to-end (không chỉ `--check` cú pháp): đầu ra được lưu, phát lại, và đo khớp
- [ ] Kỳ vọng vs lộ ra: liệt kê đúng số trường so (ví dụ 7/9) — trường chưa đo ghi tên cụ thể

### Agent 5 — Đo runtime
- [ ] Đầu đo phủ các trường đã hứa: WebGL vendor/renderer/params/extensions, canvas (giải mã về cùng RGBA trước khi so), audio, fonts, voices, media devices, Client Hints hai tầng, cửa sổ/DPR, locale
- [ ] Mỗi trường: giá trị kỳ vọng (từ danh tính đã ghim) vs giá trị đo, trạng thái riêng
- [ ] Cập nhật cột Trạng thái trong Mục 4 Hiến pháp tương ứng đúng kết quả (qua điều phối)
- [ ] Engine thật: ghi binary + SHA-256 + nền tảng chạy (Linux ≠ Windows — không suy ra kết quả Windows)

### Agent 6 — Cách ly dữ liệu
- [ ] Đúng giao thức Mục 17.2: dữ liệu đánh dấu tổng hợp (KHÔNG cookie đăng nhập thật); ghi A → kiểm tra B không thấy; đóng/mở lại; chạy đồng thời; sau crash
- [ ] Từng loại lưu trữ một trạng thái riêng: cookie, localStorage, sessionStorage, IndexedDB, Cache Storage, Service Worker (ETag/favicon/HSTS chỉ khi có tuyên bố liên quan)
- [ ] Backup/restore: khôi phục vào hồ sơ đích không rò dữ liệu sang hồ sơ khác; backup mã hóa (AES-256-GCM) được kiểm chứng bằng test

### Agent 7 — Network Safety
- [ ] IP thoát lấy từ **runtime của hồ sơ**, không phải tiến trình quản lý (Mục 19.3)
- [ ] DNS: phương pháp quan sát ghi rõ; quốc gia resolver khác proxy KHÔNG tự kết luận rò
- [ ] WebRTC: phân biệt loại candidate (host/srflx/relay/mDNS); kết luận tối đa đúng mức bằng chứng (INCONCLUSIVE khi chưa đủ)
- [ ] IPv6/QUIC: trạng thái đo riêng; mất mạng/proxy chết giữa phiên → hành vi fail-closed có bản ghi
- [ ] KHÔNG chấm điểm/chất lượng IP (ngoài phạm vi — Mục 7, 19.1)

### Agent 8 — Cảnh báo vận hành
- [ ] Mọi cảnh báo mẫu đúng Mục 22 — đủ 6 câu hỏi: quan sát gì; hồ sơ/phiên nào; khi nào + bằng cách nào; so với cấu hình/tiêu chí nào; giới hạn kết luận; người dùng kiểm tra/xử lý gì tiếp
- [ ] Diễn đạt thời điểm theo độ trễ đo (cấm "phát hiện ngay khi…", cấm "trước khi nền tảng dùng")
- [ ] Cảnh báo chỉ mô tả mẫu quan sát được — không kết luận nền tảng sẽ xử lý tài khoản (Mục 20.2)
- [ ] Bằng chứng cảnh báo **tới được người dùng** qua ứng dụng (không dừng ở module + test đơn vị)
- [ ] Dữ liệu hành vi: chỉ sự kiện tổng hợp tối thiểu; không nội dung phím gõ/mật khẩu/clipboard (Mục 20.3)

### Agent 9 — UI & đóng gói
- [ ] Chữ trong UI tuân Mục 11: không bảo chứng "an toàn để chạy Ads", không phần trăm không phép đo, không tuyệt đối hóa; trạng thái hiển thị đúng ba giá trị ĐẠT/KHÔNG ĐẠT/CHƯA ĐO
- [ ] Build EXE: ghi hash installer + commit nguồn + nội dung package (engine kèm theo có digest/chữ ký hay không)
- [ ] Lỗi hiển thị cho người dùng có hướng xử lý tiếp theo (Mục 22 áp cho cả thông báo lỗi)
- [ ] Trên Linux: build Windows là NOT_RUN — ghi rõ, không suy đoán

### Agent 10 — QA độc lập (tự áp dụng)
- [ ] Mọi phán quyết kèm đường dẫn file/dòng code hoặc log chạy
- [ ] FAIL được phân loại: lỗi thật / nền tảng (kèm tái hiện đối chiếu khi có thể)
- [ ] OPEN-ISSUES được cập nhật: issue đóng phải có bằng chứng đóng, không đóng bằng lời kể

## C. Điều kiện hết hiệu lực của kết quả (Mục 23)

Kết quả đo hết hiệu lực và phải đo lại khi bất kỳ yếu tố nào thay đổi:
phiên bản/hash engine; commit ứng dụng; cấu hình hồ sơ hoặc proxy;
hệ điều hành/môi trường; nguồn phát hành engine. Bàn giao không ghi
điều kiện hết hiệu lực coi như **chưa đủ hồ sơ**.

## D. Điều kiện nghiệm thu còn thiếu (toàn chương trình, tại thời điểm lập mẫu)

| Điều kiện | Thuộc về | Trạng thái |
|---|---|---|
| Máy Windows thật của chủ dự án cho cổng 3 (EXE đã cài + gói bằng chứng) | Chủ dự án | THIẾU |
| Quyền push để chạy CI Windows kèm phép đo trên nhánh tích hợp | Chủ dự án (token hiện không ghi được workflow) | THIẾU |
| Lab mạng được duyệt (proxy xác thực thật, STUN endpoint, egress kỳ vọng) cho QA-007 | Chủ dự án | THIẾU |
| Engine Camoufox được ký lại để phân phối (LHM-approved redistribution) | Chủ dự án | THIẾU (đã ghi trong release blockers) |
| Chứng chỉ Authenticode cho EXE | Chủ dự án | THIẾU |
| Đối chiếu/hợp nhất ba trạng thái code lệch nhau (Mục 13, QA-010) | Chủ dự án + điều phối | THIẾU |
