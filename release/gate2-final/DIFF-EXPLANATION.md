# DIFF-EXPLANATION — Bản sửa generate-step so với file trên nhánh D1

- **Người soạn:** Agent R1 (đợt chuẩn bị phát hành), trên nền
  `integration/v5.8-phase-c` local @ `f280296`.
- **Khung đối chiếu:** file smoke trên nhánh D1
  (`feature/d1-camoufox-per-profile-identity` @ `7f13c3f`, đường dẫn
  `.github/workflows/camoufox-upstream-smoke.yml`) = git blob
  `e1ac324ae20cecabb498c7862a9a921cd6437da7`.

## 1. Toàn bộ delta của bản final (có sửa) so với file D1: đúng 2 điểm, +6 dòng

Không có dòng nào bị sửa hay xoá. Chỉ có hai điểm cộng thêm:

| # | Vị trí trong bản final | Nội dung | Nguồn gốc |
|---|---|---|---|
| 1 | Dòng 10 | `      - integration/v5.8-phase-c` trong danh sách nhánh trigger `push` | Kế thừa nguyên trạng từ bộ file của Agent 2 — R1 không thêm dòng này |
| 2 | Dòng 127–131 | Khối cài runtime-prefix bên trong bước "Generate two pinned identities with the official launcher" | Bản sửa tuỳ chọn ở Mục 4 của `release/workflows/APPLY-GUIDE.md`, R1 áp nguyên văn |

**Bằng chứng tính đầy đủ:** xoá đúng 6 dòng trên (dòng 10 và dòng 127–131)
khỏi `camoufox-upstream-smoke.yml` bản final thì file còn lại hash thành
đúng blob `e1ac324ae20cecabb498c7862a9a921cd6437da7` — tức phần còn lại
byte-identical với file D1. Tính tương đương của blob `e1ac324` đã được
kiểm lại bằng 3 đường độc lập (chi tiết ở `INTEGRATION-NOTES.md`).

## 2. Giải thích từng dòng của khối sửa (dòng 127–131)

Bối cảnh: bước generate (bước YAML 15/18; trên giao diện GitHub là bước
16 vì UI đếm cả "Set up job") kỳ vọng thư mục
`$RUNNER_TEMP/lhm-camoufox-runtime` đã chứa `node_modules/camoufox` và
throw `Pinned camoufox launcher runtime missing` nếu không có — nhưng
không bước nào trong workflow tạo prefix đó. Đây là nguyên nhân run D1
`39614246764` fail tại đúng bước này. Khối sửa được chèn NGAY TRƯỚC guard
cũ:

- **Dòng 127** —
  `if(!(Test-Path (Join-Path $runtime 'node_modules/camoufox'))){`
  Điều kiện vào: chỉ cài khi gói ghim thực sự chưa có trong prefix. Khối
  sửa là idempotent — nếu sau này có bước nào nạp sẵn prefix, khối này tự
  bỏ qua, không cài đè.
- **Dòng 128** —
  `npm install --prefix $runtime --no-save --no-package-lock \``
  Cài vào ĐÚNG prefix mà bước generate sẽ staging generator vào
  (`$runtime` = `$RUNNER_TEMP/lhm-camoufox-runtime`) — đó là nơi cơ chế
  resolve ESM của bước này tìm gói ghim. `--no-save` và
  `--no-package-lock`: prefix là thư mục staging dùng một lần, không để
  lại package.json/lockfile phát sinh. Dấu backtick cuối dòng là cú pháp
  nối dòng của PowerShell.
- **Dòng 129** —
  `--ignore-scripts --no-audit --no-fund camoufox@0.5.8 playwright-core@1.62.0`
  `--ignore-scripts` khớp kỷ luật cài đặt của chính workflow này (bước 3
  "Install pinned TypeScript launcher" cũng dùng) và chặn postinstall
  tải thêm. Hai phiên bản ghim là đúng cặp bước 3 cài ở thư mục gốc repo:
  `camoufox@0.5.8` (gói generator chính thức) và `playwright-core@1.62.0`
  (bản ghim của repo) — nên generator chạy đúng đường code mà run D1
  định chạy, không đổi hành vi đo.
- **Dòng 130** —
  `if($LASTEXITCODE -ne 0){throw 'Install pinned launcher runtime failed'}`
  Fail-closed với thông điệp RIÊNG: cài đặt thất bại được báo là thất bại
  cài đặt, không bị guard "runtime missing" phía dưới che khuất thành
  một chẩn đoán sai nguyên nhân.
- **Dòng 131** — `}` đóng khối điều kiện.

**Phần không đổi quanh khối sửa:** guard gốc (nay ở dòng 132–134) vẫn
chạy vô điều kiện sau khối sửa — nếu cài xong mà gói vẫn thiếu, bước
vẫn throw `Pinned camoufox launcher runtime missing` y như trước. Lớp
phòng thủ cũ được giữ nguyên; khối sửa chỉ bổ sung cách tạo prefix mà
workflow chưa từng có.

## 3. Về bản without-fix đi kèm

`camoufox-upstream-smoke.without-fix.yml` là bản Agent 2 đã giao
(byte-identical, blob `72eb2823b06730f69e063e86c20390d9f9222532`), giữ
lại CHỈ để ai duyệt cũng diff được bản sửa trong 5 dòng. **Không áp bản
này**: áp nó là tái tạo nguyên trạng lỗi fail-bước-generate đã biết.
