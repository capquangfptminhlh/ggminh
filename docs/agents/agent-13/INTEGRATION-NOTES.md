# INTEGRATION NOTES — Agent 13 (Phân phối engine) → Agent điều phối

Nhánh: `agent-13/engine-distribution` từ nền `07150d6`. Agent 13
không sửa `package.json`, `main.js`, `preload.js`, `index.html`,
`.github/**` và không commit bất kỳ khóa nào (khóa thử sinh trong
thư mục tạm ngoài repo, đã huỷ).

## 1. package.json — nối test toàn trình vào chuỗi `npm test`

Thêm (đề xuất đặt ngay sau `node test/camoufox-engine-source-hardening.js`):

```
node test/camoufox-engine-distribution.js
```

Test tự chứa (Node stdlib, khóa tự sinh trong thư mục tạm, chạy được
trên Linux): CLI ký → verify gói → đóng gói/descriptor →
`validateRelease` → `install()` toàn trình với transport seam →
verify cây đã cài, cộng các đường từ chối ở mức pipeline. Đã chạy
đạt tại nhánh này; các test kề (hardening, install, download,
bundle-integrity, bundled-engine-status) vẫn đạt.

## 2. Đề xuất vị trí cho OWNER-RUNBOOK.md

Runbook buổi lễ khóa hiện nằm tại
`docs/agents/agent-13/OWNER-RUNBOOK.md`. Đây là tài liệu vận hành
dành cho chủ dự án — đề xuất điều phối cân nhắc đưa lên `docs/`
(cạnh `docs/BUNDLED_ENGINE_RELEASE.md`) khi tích hợp, để chủ dự án
tìm thấy mà không cần biết cấu trúc thư mục agent. Nội dung runbook
đã khớp với tài liệu phát hành hiện có (đường dẫn neo tin cậy
`publisher-ed25519.pub` trong `resources/lhm-camoufox/`, hai biến môi
trường ký, descriptor phát hành).

## 3. Phát hiện cho ngày phát hành (không cần sửa code)

- Cây Camoufox **Linux** chứa tên file font có ký tự `[ ] ,` — vi
  phạm quy tắc tên file của manifest, công cụ ký từ chối (fail-closed
  đúng thiết kế). Chưa kiểm chứng được cây **Windows** chính thức có
  tên file hợp lệ toàn bộ hay không: đã đưa thành bước kiểm tra bắt
  buộc trong runbook (mục 4 bước 1). Nếu cây Windows có file không
  hợp lệ, xử lý ở khâu chuẩn bị cây phát hành — không nới quy tắc
  tên file trong code.
- Định dạng URL descriptor phải đủ `github.com/<owner>/<repo>/releases/download/<tag>/<file>.zip`;
  thiếu đoạn `<repo>` bị allowlist từ chối (tự phát hiện khi script
  chạy thử của agent viết sai URL — bằng chứng bộ lọc hoạt động).

## 4. Trạng thái còn mở (không thuộc Agent 13 quyết)

- Khóa publisher production + bản engine Windows ký thật: chưa tồn
  tại; quy trình ở OWNER-RUNBOOK.md, thực hiện bởi chủ dự án.
- Giải nén PowerShell thật, kiểm tra PE thật, cài trên Windows thật:
  NOT_RUN tại Linux (chi tiết trong RUN-REPORT.md).
- Câu hỏi khóa ký cho bundled Chromium (Agent 2 đã nêu) giữ nguyên
  trạng thái chưa quyết — runbook này chỉ bao phủ Camoufox.
