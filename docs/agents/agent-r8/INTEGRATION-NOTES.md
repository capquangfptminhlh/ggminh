# INTEGRATION NOTES — Agent R8 (Wave R): Gói quyết định tổng hợp cho chủ dự án

## Sản phẩm (file mới, trên nhánh `agent-r8/decision-pack` @ nền `f280296`)

- `docs/decisions/OWNER-DECISIONS-CONSOLIDATED.md` — hợp nhất MỌI quyết
  định chủ dự án còn mở vào một văn bản duy nhất, trả lời được trong một
  tin nhắn bằng lưới đáp án ở Mục 12 của chính văn bản:
  QD-01 (PREFLIGHT_ONLY), QD-02 (tách khóa publisher), QD-03 (cập nhật
  Hiến pháp §4/§17.2), QD-04 (áp workflow), D1–D4 của Agent 12 (cập nhật
  ứng dụng), F3/F4 của Agent 17 (purge), ECHO (endpoint echo runtime,
  Agent 7), AUTH (Authenticode — đã quyết KHÔNG mua 2026-10-22, ghi dạng
  ĐÃ QUYẾT kèm đường mở lại).
- File này (ghi chú tích hợp). Không sửa file nào khác; không sửa các hồ
  sơ QD gốc — gói tổng hợp tham chiếu chúng làm nguồn.

## Đối chiếu tiền đề với code tại f280296 (đã kiểm trực tiếp)

- **Còn đúng nguyên trạng:** QD-01 (`NetworkSafetyCheck.js:17`,
  `EngineFactory.js:47-55`), QD-02 (`sign-bundled-engine.js:63`,
  `bundledEngineManager.js:10,139`, `main.js:828-830`), D1–D4
  (updateCheck có mặt, chưa nối dây — grep main/preload không có
  `check-for-update`; chưa có `tools/sign-app-update.js`), F3/F4 (purge
  tại `store.js:259,317` chỉ đi 4 gốc ở `:25`; không chạm
  `session-snapshots/`, không dọn `automation-workflows.json`), ECHO
  (nối dây đã xong ở `main.js:695-716`, chỉ chờ chọn endpoint).

## ⚠️ Hai cờ lệch đã ghi vào gói (điều phối/chủ dự án cần biết)

1. **QD-04 — tiền đề chính bị sự kiện vượt qua.** Bản gốc hỏi đường push;
   push đã thực thi (snapshot, đầu xa `f549a63`, PR #18 Draft, CI run
   39641363889 SUCCESS). Gói tổng hợp **viết lại QD-04** thành phần còn
   sống: áp 2 file từ `release/workflows/` + duyệt bản sửa bước generate
   của Agent 2 (không sửa thì bước generate fail theo cấu trúc — bằng
   chứng run 39614246764). Đáp án theo bản gốc QD-04 sẽ vô nghĩa.
2. **QD-03 — 5 hàng WebGL trong Nhóm C3 đã cũ.** Agent 4 (đợt thương
   mại) đo WebGL headful/Xvfb thành công SAU khi QD-03 soạn (cả 5 điểm
   §4.3 MEASURED, vendor/renderer 2/2, 9/12 tham số) và đã đề xuất câu
   chữ mới hơn (`agents/agent-4/INTEGRATION-NOTES.md` mục 4). Gói định
   nghĩa Lựa chọn 1 của QD-03 là "duyệt toàn bộ **với hàng WebGL thay
   bằng câu chữ Agent 4**" — tránh áp nguyên văn ghi sai sổ đăng ký.
   Ngoài ra hàng DNS §4.1 cũng có bằng chứng mới (Agent 5) nhưng ngoài
   phạm vi QD-03 — để QD riêng sau.

## Điều phối cần làm tiếp

1. Chuyển gói cho chủ dự án; nhận lưới đáp án (Mục 12) — một tin nhắn.
2. Theo đáp án, mở việc theo thứ tự ở cuối gói: QD-04 → CI lại (khép
   Cổng 2 phần đo); QD-02=1 → buổi lễ khóa; QD-03 → áp Hiến pháp v1.4;
   QD-01/F3/F4/nhóm D → giao agent; ECHO → cấu hình.
3. Việc tài liệu SmartScreen cho `docs/customer-guide/01-...md` làm bất
   kể đáp án (hệ quả của AUTH đã quyết).
4. Khi hoà giải với luồng song song của chủ dự án (commit cục bộ
   `89b3c2c`): lưu ý luồng đó đã sửa độc lập đúng điểm dự phòng khóa của
   QD-02 — diff trước khi thực thi QD-02.

## Kỷ luật đã giữ

- Không quyết thay mục nào; khuyến nghị đứng của Agent 19/12/17 được ghi
  rõ nguồn và tách khỏi văn bản quyết định.
- Không push/merge/tag; gói nằm trên nhánh riêng chờ điều phối.
