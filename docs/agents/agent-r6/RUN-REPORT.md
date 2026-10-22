# RUN REPORT — Agent R6 (Diễn tập ngày phát hành: gói engine Camoufox thương mại)

Nhánh: `agent-r6/engine-distribution-prep` từ nền `f280296`.
Phạm vi: diễn tập TOÀN TRÌNH phát hành engine bằng cây **Windows
chính thức** và khóa THỬ (Ed25519 tự sinh trong thư mục tạm ngoài
repo, huỷ ngay sau mỗi lần chạy): tải upstream có ghim digest → quét
tính hợp lệ của tên file theo quy tắc manifest → ký bằng
`tools/sign-bundled-engine.js` → kiểm chứng `BundledEngineManager` →
đóng gói + descriptor → `validateRelease` → `CamoufoxInstallService`
(tải ghim + giải nén seam + kiểm chứng + chuyển vào vị trí cài) →
`alreadyPresent`. Môi trường: Linux x86_64, Node v24.20.0. Không khóa
production nào được sinh hay giữ; không khóa nào bị commit (quét
chuỗi tiêu đề PEM trên toàn bộ thư mục bàn giao: 0 kết quả).

## PHÁT HIỆN CHÍNH — cây Windows chính thức KHÔNG ký được nguyên trạng

Quy tắc tên file của manifest (`fileName()` trong
`src/engine/bundledEngineManager.js`: mỗi đoạn đường dẫn chỉ gồm
`[A-Za-z0-9_.-]`, đoạn bắt đầu bằng `[A-Za-z0-9_]`, tối đa 240 ký tự)
**từ chối 218 trong 1.579 file** của cây chính thức — toàn bộ nằm
trong `fonts/` (544.878.908 byte):

| Nhóm ký tự vi phạm | Số file | Ví dụ |
|---|---|---|
| Chỉ dấu cách | 92 | `fonts/1003__Bangla MN.ttc` |
| `[` và `]` (trục font biến thiên) | 61 | `fonts/106__Raleway-Italic[wght].ttf` |
| `,` + `[` + `]` | 53 | `fonts/110__Inter-Italic[opsz,wght].ttf` |
| Chữ ngoài ASCII (tiếng Nhật) + dấu cách | 12 | font tiếng Nhật trong `fonts/` |

Hậu quả đã kiểm chứng ở mức CLI, không chỉ ở mức quét: chạy công cụ
ký sản phẩm trên cây nguyên trạng **thất bại, exit 1** —
`Cannot sign engine manifest: Unsafe bundled engine relative file
path` (fail-closed đúng thiết kế). Đây là rủi ro ngày phát hành mà
Agent 13 đã dự báo cho cây Linux (font chứa `[ ] ,`); trên cây
Windows chính thức nó **xảy ra thật và chặn bước ký**. Danh sách verdict
từng file: `filename-verdicts.tsv` + `scan-summary.json` đi kèm.

Các giới hạn manifest còn lại trên cây nguyên trạng đều ĐẠT: số file
1.579 ≤ 10.000; file lớn nhất `fonts/82__Apple Color Emoji.ttc`
192.123.488 byte ≤ 512 MB; tổng 2.563.096.877 byte ≤ 3 GiB; 0 symlink;
0 trùng tên không phân biệt hoa thường; `camoufox.exe` nằm ở gốc cây
(archive upstream phẳng, không thư mục bọc).

## Cây đã dùng (nguồn gốc kiểm chứng được)

| Hạng mục | Giá trị |
|---|---|
| Upstream | `daijro/camoufox`, release `v156.0.1-beta.36` |
| Asset | `camoufox-156.0.1-beta.36-win.x86_64.zip` |
| Kích thước tải về | 1.311.638.126 byte — **khớp chính xác** ghim trong repo |
| SHA-256 tải về | `096fd4832a7a32f2aa7f7bdd07fe6253dda296cbe783acd7bc2c86cf5ae62031` — **khớp** ghim tại `tools/stage-camoufox-upstream-smoke.ps1` và `docs/CAMOUFOX_REAL_WINDOWS_ACCEPTANCE.md` |
| Cây giải nén | 1.579 file, 2.563.096.877 byte, 0 entry symlink, 0 đường dẫn lạ |
| `camoufox.exe` | PE thật: MZ + chữ ký PE, machine `0x8664`, 1.209.344 byte, SHA-256 `a235730786ee4e27b7e5087751509b2d456b0f03ce73d04bbb1b9077458764c6` |

## Kết quả từng bước

### A. Cây nguyên trạng (upstream, không sửa tên)

| Bước | Nội dung | Kết quả |
|---|---|---|
| A1 | Tải asset chính thức + đối chiếu size/SHA với ghim của repo | PASS |
| A2 | Quét verdict tên file từng file (script `scan-filenames.js`, dùng đúng `fileName()` sản phẩm) | **FAIL — 218/1.579 file vi phạm** (toàn bộ ở `fonts/`) |
| A3 | `listFiles()` sản phẩm trên cây | Từ chối đúng — `Unsafe bundled engine relative file path` |
| A4 | Kiểm tra byte PE của `camoufox.exe` thật (thủ công, chỉ là bằng chứng payload) | PASS — MZ/PE/`0x8664` |
| A5 | `inspectBinary` sản phẩm trên cây thật | **NOT_RUN** — cổng đường dẫn Windows từ chối trước khi đọc file trên host Linux (điều kiện: máy Windows, Gate 3) |
| A6 | Lễ khóa thử (tạm, mode 0600) | PASS — SPKI fingerprint `63700734…`, khác khóa license |
| A7 | Ký cây nguyên trạng bằng CLI sản phẩm | **FAIL (đúng kỳ vọng fail-closed)** — exit 1, cùng thông điệp như A3; không manifest nào được sinh |
| A8 | Huỷ khóa thử | PASS |

### B. Cây "đã chuẩn bị kiểu diễn tập" — toàn trình ở quy mô thật

Để diễn tập phần còn lại của toàn trình ở quy mô thật, một bản sao
của cây được chuẩn bị bằng **ánh xạ đổi tên cơ học, chỉ phục vụ diễn
tập**: mọi ký tự ngoài `[A-Za-z0-9_.-]` trong từng đoạn đường dẫn →
`_` (bảng ánh xạ đầy đủ 218 dòng: `rename-mapping.json`). Nội dung
file không đổi (tổng byte trước/sau bằng nhau), 0 va chạm tên, quét
lại đạt **1.579/1.579 PASS** và `listFiles()` chạy được. Ánh xạ này
**không** phải đề xuất sửa phát hành — xem mục Quyết định bên dưới.

| Bước | Nội dung | Kết quả |
|---|---|---|
| B1 | Lễ khóa thử mới (độc lập lần A) | PASS — SPKI fingerprint `22310029…`, khác khóa license |
| B2 | Ký bằng CLI sản phẩm | PASS — manifest 1.579 file, tổng 2.563.096.877 byte, version `156.0.1` |
| B3 | `BundledEngineManager.verify()` dưới khóa publisher (inspect = seam SHA-256) | PASS — version 156.0.1, fileCount 1579, entry SHA `a2357307…` (khớp cây nguyên trạng — nội dung không đổi) |
| B4 | `verify()` dưới khóa license của ứng dụng | PASS (từ chối đúng) — "signature is not trusted" |
| B5 | Đóng gói ZIP (deflate, **không** kèm `manifest.json`) | PASS — **1.355.084.308 byte**, SHA-256 `5e76c5a319aa47796254ca24a6e070429e5633af5a50e47d53e4d0991b9cb5bd`, 1.579 entry (dưới trần archive 2 GiB của `validateRelease`/`downloadPinned`) |
| B6 | `validateRelease` descriptor dưới khóa publisher | PASS |
| B7 | Descriptor ký bởi khóa lạ | PASS (từ chối đúng) — "not signed by the trusted publisher" |
| B8 | `install()` toàn trình: `downloadPinned` thật (302 → asset, kiểm Content-Length/SHA) qua seam vận chuyển cục bộ; giải nén bằng seam thực thi cùng hợp đồng tập-file-như-manifest của script PowerShell; `verify()` cây đích (băm **mọi** file); chuyển vào `engines/camoufox` | PASS — `status().valid = true`, đúng 2 lượt gọi vận chuyển |
| B9 | Cài lần 2 | PASS — `alreadyPresent`, không tải lại |
| B10 | Đối chiếu cây đã cài | PASS — 1.580 file trên đĩa (1.579 payload + `manifest.json` do installer ghi); SHA của `camoufox.exe` và file lớn nhất khớp manifest đã ký |
| B11 | Huỷ khóa thử | PASS |

Khuyết tật của **script diễn tập** (không phải của sản phẩm) đã phát
hiện và sửa giữa hai lần chạy B: bản đầu của `rehearse-pipeline.js`
băm archive bằng `sha256File()` — hàm băm file-engine có trần 512 MB
— nên abort ở bước đóng gói với "Bundled engine file too large".
Đường archive của sản phẩm (`downloadPinned`) băm theo luồng với
trần 2 GiB và không dính lỗi này; script đã chuyển sang hàm băm luồng
riêng và chạy lại sạch từ đầu. Ghi lại để hồ sơ minh bạch.

## NOT_RUN + điều kiện

- **Giải nén bằng script PowerShell sản phẩm**
  (`tools/extract-signed-engine.ps1`): Windows-only — lần này dùng
  seam thực thi cùng hợp đồng (tập entry == tập manifest, kích thước
  từng entry, cấm symlink/đường dẫn thoát). Điều kiện: máy Windows.
- **Kiểm tra PE bằng `inspectBinary` sản phẩm**: cổng của nó đòi
  đường dẫn kiểu ổ đĩa Windows — chỉ chạy được trên Windows (Gate 3).
- **Engine đã cài có chạy đúng với 218 font đã đổi tên hay không**:
  Camoufox liệt kê font từ thư mục `fonts/`; việc đổi tên file font
  có làm engine bỏ qua/nhận sai font hay không **chưa đo** — chỉ kết
  luận được khi chạy engine đã cài trên Windows (Gate 3). Đây là rủi
  ro thực chất của phương án đổi tên, phải ghi rõ trong quyết định.
- **Tải release thật từ GitHub Releases**: `downloadPinned` chạy mã
  thật qua seam vận chuyển cục bộ; chưa tồn tại release LHM thật.

## Quyết định cần chủ dự án chốt TRƯỚC ngày ký phát hành

Vấn đề 218 font phải được xử lý bằng một trong các phương án sau —
agent **không** tự nới quy tắc và không chọn thay:

- **Phương án A — Đổi tên khi chuẩn bị cây** (đã diễn tập ở mục B):
  không đổi code; gói phát hành chứa 218 tên font khác upstream.
  Rủi ro: hành vi liệt kê font của engine với tên đã đổi chưa đo
  (Gate 3 phải chạy thử engine đã cài, gồm điểm đo font). Cây cài
  đặt không còn trùng tên với upstream nên đối chiếu hỗ trợ khó hơn.
- **Phương án B — Nới quy tắc tên file của manifest** (cho phép dấu
  cách, `[ ] ,`, chữ ngoài ASCII): chạm đúng một điểm nghẽn
  (`fileName()` dùng chung cho ký/kiểm chứng/liệt kê). Cần rà soát
  an ninh về lý do tập ký tự bảo thủ được chọn (tính mơ hồ của đường
  dẫn giữa ZIP/NTFS/bộ giải nén, tính ổn định của manifest chuẩn
  hoá) và đi qua quy trình Hiến pháp Mục 8/13. Lưu ý thực tế: bộ
  kiểm tra tên trong script giải nén PowerShell hiện **đã** chấp
  nhận các ký tự này — quy tắc manifest là chốt chặn duy nhất —
  nhưng "chốt chặn duy nhất" không đồng nghĩa "nới là an toàn".
- **Phương án C — Loại 218 font khỏi gói**: mất 544,9 MB font —
  font là thành phần lõi của hệ danh tính của engine này; hành vi
  engine khi thiếu font chưa đo. Không khuyến nghị làm mặc định.
- **Phương án D — Ánh xạ tên hai chiều trong manifest** (tên trong
  gói ↔ tên khi cài; bộ giải nén khôi phục tên upstream): cây cài
  đặt trùng cả tên lẫn nội dung với upstream, nhưng phải đổi schema
  manifest + payload chuẩn hoá + bộ giải nén = thay đổi sản phẩm,
  cần thiết kế và rà soát riêng.

Dù chọn phương án nào, bước quét tên file (script đi kèm) phải thành
**cổng bắt buộc của ngày phát hành**: upstream đổi tên file ở phiên
bản sau là chuyện có thể xảy ra bất cứ lúc nào.

## Tuyên bố bắt buộc (Mục 16/23)

Toàn trình đã chứng minh bằng khóa thử trên cây thật **KHÔNG** đồng
nghĩa engine thương mại đã sẵn sàng phát hành: chưa có khóa publisher
production, chưa có quyết định cho 218 font, cây đã đổi tên chỉ là
dụng cụ diễn tập, các bước Windows (giải nén PowerShell, kiểm tra PE,
chạy engine đã cài) vẫn NOT_RUN, và chưa có release thật. Quy trình
ngày phát hành nằm ở `RELEASE-DAY-CHECKLIST.md` đi kèm; buổi lễ khóa
production nằm ở `docs/agents/agent-13/OWNER-RUNBOOK.md`.

Hồ sơ kèm theo: `scan-filenames.js`, `rehearse-pipeline.js` (script
diễn tập), `filename-verdicts.tsv`, `scan-summary.json` (quét cây
nguyên trạng), `rename-mapping.json` (218 ánh xạ diễn tập),
`pipeline-results-pristine.json` (lần chạy cây nguyên trạng),
`pipeline-results-prepared.json` (lần chạy toàn trình đạt).
Cây và gói diễn tập nằm ngoài repo tại `~/tmp-big/r6/` (upstream/,
tree-prepared/, work-prepared2/) — không file nhị phân nào vào repo.
