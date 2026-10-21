# RUN REPORT — Agent 13 (Phân phối engine: chạy thử toàn trình)

Nhánh: `agent-13/engine-distribution` từ nền `07150d6`.
Phạm vi: chạy TOÀN TRÌNH phân phối engine Camoufox bằng khóa THỬ
(Ed25519 tự sinh trong thư mục tạm ngoài repo, đã huỷ sau khi chạy):
sinh khóa → chuẩn bị cây engine → ký bằng `tools/sign-bundled-engine.js`
→ kiểm chứng `BundledEngineManager.verify()` → đóng gói + descriptor →
`validateRelease` → `CamoufoxInstallService.install()` (tải ghim +
giải nén + kiểm chứng + chuyển vào vị trí cài) → các đường từ chối.
Môi trường: Linux, Node v24.20.0. Không khóa nào được commit; test
commit kèm theo (`test/camoufox-engine-distribution.js`) tự sinh khóa
khi chạy, đúng kỷ luật fixture hiện có.

## Cây engine đã dùng (ghi rõ loại)

Cây **nội dung thật, cấu trúc thích ứng**: 12 file sao nguyên vẹn từ
bản dựng Camoufox Linux thật `~/tmp-big/cfx-build` (v156.0.1-beta.36),
gồm binary thật `camoufox-bin` **đổi tên thành `camoufox.exe`** (định
dạng phân phối của sản phẩm là Windows — `verify()` và manifest bắt
buộc entry này) + `libxul.so` (185 MB), 5 thư viện lõi, `omni.ja`,
`application.ini`, `platform.ini`, `camoufox.cfg`,
`dependentlibs.list` — tổng 246 MB. SHA-256 của entry sau khi ký:
`2a2cb03f6ca4cfa9…` — trùng digest của binary thật đã ghi ở các đợt
trước, xác nhận file không bị biến đổi khi sao chép/đổi tên.
Không dùng toàn bộ 1560 file của bản dựng Linux vì: (a) các file font
của bản Linux chứa ký tự `[ ] ,` trong tên — vi phạm quy tắc tên file
an toàn của manifest, công cụ ký từ chối (fail-closed đúng thiết kế);
việc cây **Windows** chính thức có tên file hợp lệ hay không phải kiểm
tra vào ngày phát hành (xem OWNER-RUNBOOK mục 4); (b) dung lượng.

## Kết quả từng bước (lần chạy cuối: 19/19 PASS)

| Bước | Nội dung | Kết quả |
|---|---|---|
| S1 | CLI ký bằng khóa publisher thử RIÊNG (env `LHM_ENGINE_SIGNING_KEY_FILE` + `LHM_ENGINE_PUBLISHER_KEY_FILE`) | PASS — manifest 12 file |
| S2 | `BundledEngineManager.verify()` dưới khóa publisher (inspect = seam SHA-256 như test hiện có) | PASS — version 156.0.1 |
| S3 | `verify()` dưới khóa **license** của ứng dụng | PASS (từ chối đúng) — "signature is not trusted" |
| S4 | `inspectBinary` thật trên binary ELF | Từ chối ("Only local Windows drive paths are permitted") → kiểm tra PE thật = **NOT_RUN**, cần cây Windows |
| S5 | Đóng gói ZIP (stored, 257.482.018 byte, SHA-256 `6e27859e…`; `manifest.json` KHÔNG nằm trong ZIP — đi trong descriptor) + `validateRelease` | PASS |
| S6 | `install()` toàn trình: `downloadPinned` thật (302 github.com → release-assets + kiểm Content-Length/SHA), giải nén bằng seam Python thực thi cùng hợp đồng tập-file-như-manifest của script PowerShell, ghi manifest, `verify()` cây đích, đổi tên vào `engines/camoufox`; cài lần 2 → `alreadyPresent`, không tải lại | PASS — `libxul.so` đã cài trùng SHA với nguồn đã ký |
| S7 | `install()` trên platform linux | PASS (từ chối đúng) — "Windows-only" |
| S8 | Constructor service với publisher key == license key | PASS (từ chối đúng) |
| S9 | Descriptor ký bởi khóa lạ | PASS (từ chối đúng) — "not signed by the trusted publisher" |
| S10 | Descriptor lệch `archiveBytes` (+100) | PASS (từ chối đúng ở khâu tải) — "Content-Length mismatch" |
| S11 | Descriptor lệch `archiveSha256` | PASS (từ chối đúng) — "SHA-256 or length does not match" |
| S12 | `archiveBytes` dưới dải cho phép (50) | PASS (từ chối đúng) — descriptor không hợp lệ |
| S13 | URL ngoài allowlist GitHub Releases | PASS (từ chối đúng) |
| S14 | Sửa 1 byte trong file sau khi ký → `verify()` | PASS (từ chối đúng) — SHA-256 mismatch, status invalid |
| S15 | File chứa private key được ký vào manifest → `verify()` | PASS (từ chối đúng) — "private key material" |
| S16 | CLI: file khóa publisher = khóa license của ứng dụng | PASS (từ chối đúng, exit 1) |
| S17 | CLI: ký Camoufox không có file khóa publisher | PASS (từ chối đúng, exit 1) |
| S18 | CLI: cây chứa private key | PASS (từ chối đúng, exit 1, không sinh manifest) |
| S19 | CLI: file khóa ký nằm trong cây engine | PASS (từ chối đúng, exit 1) |

Lần chạy đầu có 5 FAIL (S5/S6/S9/S10/S11) do chính script chạy thử
của agent dùng URL thiếu đoạn `<repo>` (`github.com/<owner>/releases/…`
thay vì `github.com/<owner>/<repo>/releases/…`) — allowlist từ chối là
đúng; đã sửa URL trong script và chạy lại đạt 19/19. Đây là lỗi của
script thử, không phải của sản phẩm, và tự nó là một bằng chứng phụ
rằng bộ lọc URL hoạt động ở đúng định dạng.

## NOT_RUN + điều kiện

- **Giải nén bằng script PowerShell sản phẩm**
  (`tools/extract-signed-engine.ps1`): Windows-only — lần chạy này
  dùng seam giải nén thực thi cùng hợp đồng (tập entry == tập file
  trong manifest, cấm đường dẫn thoát). Điều kiện: máy/runner Windows.
- **Kiểm tra binary PE thật** (`inspectBinary` không seam): cần cây
  Camoufox Windows chính thức (`camoufox.exe` là PE).
- **Cài đặt end-to-end trên Windows thật / EXE đã đóng gói**: cổng 3
  Mục 12, máy Windows của chủ dự án.
- **Tải qua mạng thật từ GitHub Releases**: transport là seam cục bộ
  nuôi đúng mã `downloadPinned` sản phẩm (redirect allowlist, độ dài,
  SHA đều chạy thật); chưa có release thật để tải.

## Tuyên bố bắt buộc (Mục 16/23)

Toàn trình đã chứng minh được bằng khóa thử **KHÔNG** đồng nghĩa
engine phát hành thật đã sẵn sàng: chưa tồn tại khóa publisher
production, chưa có cây Camoufox Windows chính thức được LHM ký, chưa
có release thật, và các bước Windows ở trên vẫn NOT_RUN. Quy trình để
chủ dự án thực hiện buổi lễ khóa và phát hành thật nằm ở
OWNER-RUNBOOK.md đi kèm.
