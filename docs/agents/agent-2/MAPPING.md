# MAPPING — Agent 2 (Nguồn Engine) · Đợt A

Cơ sở: `TIEU-CHI-SAN-PHAM.md` v1.3 tại commit nền `8349f38`.
Phạm vi đối chiếu: Mục 8 (kiến trúc, cài đặt engine, fail-closed), Mục 7
(không tải/chạy engine chưa kiểm chứng; không né AV), Mục 4 (điểm quét phía
engine: TLS/HTTP2 = giữ giá trị engine thật), Mục 16/23 (trạng thái và hồ sơ
nghiệm thu). Trạng thái ghi theo Mục 16: ĐẠT / KHÔNG ĐẠT / CHƯA ĐO, và
PASS / FAIL / NOT_RUN cho phép thử.

| # | Tiêu chí (Hiến pháp) | Code hiện có | Phần thiếu / nhận định | Phép thử hiện có | Trạng thái |
|---|---|---|---|---|---|
| 1 | Cài engine chỉ khi người dùng chủ động (Mục 8) | `main.js` IPC `camoufox-install`: hộp thoại xác nhận "Tải và cài", chặn khi có browser đang chạy, chặn khi đang cài | Đủ ở tầng ứng dụng (ngoài phạm vi sửa của Agent 2; chỉ đối chiếu) | `test/camoufox-install.js` (service-level) | ĐẠT (đối chiếu) |
| 2 | URL nguồn phát hành bị khóa (Mục 8) | `validateRelease` trong `src/engine/camoufoxInstallService.js`: chỉ `https://github.com/<o>/<r>/releases/download/<tag>/<file>.zip`, cấm credentials/port/query/hash | Đủ. Thiếu test cho manifest chứa mục `manifest.json` và descriptor bị ký bằng khóa license thay vì khóa publisher | `test/camoufox-install.js` (URL xấu, http, userinfo, query) | ĐẠT, bổ sung test ở Đợt B |
| 3 | Kiểm tra kích thước + SHA-256 archive trước khi dùng (Mục 8) | `downloadPinned`: Content-Length phải bằng descriptor, đếm byte khi tải, vượt giới hạn là hủy, cuối cùng so SHA-256 + độ dài; giới hạn cứng 100 B – 2 GiB trong descriptor | Đủ. Thiếu test: vòng lặp redirect >5, Content-Length mismatch, redirect https tới host ngoài allowlist | `test/camoufox-download.js` (SHA giả, oversize, redirect http, HTTP 500, CDN hợp lệ) | ĐẠT, bổ sung test ở Đợt B |
| 4 | Manifest ký Ed25519 bằng khóa publisher RIÊNG, không dùng khóa license (Mục 8) | Đường Camoufox: `camoufoxPublisherTrust.js` nạp `publisher-ed25519.pub`, từ chối nếu SPKI trùng khóa license; `main.js` không có khóa publisher thì tắt toàn bộ đường cài/chạy Camoufox (fail-closed); `validateRelease` + `BundledEngineManager.verify` kiểm chữ ký trên payload canonical có domain separation `LHM_BROWSER_ENGINE_BUNDLE_V1` | **THIẾU (GAP-1):** `tools/sign-bundled-engine.js` tự kiểm chữ ký bằng `PUBLIC_KEY` của **license** (`src/licensing/manager`) cho cả hai engine — công cụ phát hành đang ép khóa ký engine = khóa license, trái Mục 8. **THIẾU (GAP-1b):** `CamoufoxInstallService` không tự đối chiếu khóa publisher với khóa license nếu caller truyền nhầm (hiện chỉ `main.js` chống ở tầng nạp khóa) | `test/camoufox-install.js` (nạp khóa trùng license → throw; manifest giả chữ ký → throw) | **KHÔNG ĐẠT** ở công cụ ký; ĐẠT ở đường runtime Camoufox. Sửa ở Đợt B |
| 5 | Chặn khóa riêng tư lọt vào gói engine | `package.json` loại `tools/sign-bundled-engine.js` và các tool license khỏi gói; README staging cấm để khóa trong thư mục engine; `BundledEngineManager.verify` từ chối file không có trong manifest | **THIẾU (GAP-2):** không có kiểm tra nội dung — một file chứa khóa riêng tư (PEM/OpenSSH) vẫn có thể được ký vào manifest và đóng gói/chạy. Công cụ ký cũng không cấm đặt file khóa ký bên trong thư mục engine sắp đóng gói | Chưa có | **KHÔNG ĐẠT**. Sửa ở Đợt B (quét marker khóa riêng tư ở công cụ ký + ở `verify()`) |
| 6 | Từ chối chạy engine chưa kiểm chứng (Mục 8, fail-closed, không fallback ngầm) | `BundledEngineManager.verify()`: đúng tập trường manifest, chữ ký, danh sách file khớp tuyệt đối, SHA-256 từng file, kiểm lại executable sau kiểm tra, cấm symlink/path escape; `CamoufoxAdapter.start` từ chối khi không có bundle đã kiểm chứng (test: 0 lần spawn); `camoufoxRuntimeGate.assessRuntime`: `ready=false` khi chưa có bundle ký | Đủ | `test/camoufox-bundle-integrity.js`, `test/bundled-engine-status.js`, `test/camoufox-runtime-gate.js` | ĐẠT |
| 7 | Giải nén an toàn (zip-slip, symlink, zip-bomb) | `tools/extract-signed-engine.ps1`: tên entry an toàn, cấm symlink, cấm trùng/thừa/thiếu so manifest, giới hạn 512 MiB/file và 3 GiB tổng; sau giải nén `install()` ghi manifest và chạy `verifier().verify()` (SHA từng file) trước khi đổi tên vào vị trí cài | Đủ về thiết kế; phép chạy thật cần PowerShell/Windows | `test/camoufox-install.js` phần Windows (tự bỏ qua ngoài win32) | ĐẠT (thiết kế + test mô phỏng); chạy thật trên Windows = NOT_RUN trong đợt này |
| 8 | Không tải ngầm, không tự cập nhật, không né antivirus/SmartScreen (Mục 7, Mục 8) | Không có auto-updater trong code; tải chỉ qua `install()` được IPC gọi sau xác nhận; header tải công khai danh tính `LHM-Verified-Engine/1`; script giải nén không đụng AV; `tools/stage-camoufox-upstream-smoke.ps1` còn *chạy* Defender scan thay vì xin miễn trừ | Đủ | Đối chiếu code (grep `autoUpdater` = không có); `test/camoufox-install.js` đếm số lần download = 1, cài lại không tải thêm | ĐẠT |
| 9 | Script staging CI (upstream smoke) đúng kỷ luật nguồn | `tools/stage-camoufox-upstream-smoke.ps1`: ghim tag allowlist + kích thước 1311638126 + SHA-256 của asset upstream chính thức, file trích xuất không rời workspace tạm, không upload artifact | Khác biệt có chủ đích, phải ghi rõ: script này kiểm chứng bằng **digest ghim**, không có manifest ký publisher kiểu LHM — chỉ được dùng cho smoke trên runner, **không** được dùng làm nguồn cho đường cài đặt sản phẩm (đường sản phẩm bắt buộc qua hàng 2–5) | CI workflow phía điều phối (Agent 2 không sửa `.github`) | ĐẠT trong phạm vi CI-smoke; NOT_RUN tại máy này (cần runner Windows) |
| 10 | Giữ giá trị engine thật cho TLS/HTTP2 (Mục 4.1/5.2) | Không có code nào can thiệp TLS/HTTP2 fingerprint trong đường engine; chữ ký/chính sách chỉ ở tầng phân phối | Đủ (không làm gì là đúng thiết kế) | — | ĐẠT (theo thiết kế) |
| 11 | Hồ sơ nghiệm thu nguồn engine (Mục 23) | Test ghi rõ commit qua git; digest upstream được ghim trong script | Chưa có bản phát hành LHM-signed thật để kiểm chứng chữ ký trên release thật; chưa có publisher key production (chủ dự án cung cấp ngoài repo) | — | NOT_RUN: kiểm chứng release thật + cài đặt thật trên Windows (thiếu điều kiện bên ngoài, không tự tạo khóa production theo kỷ luật đợt này) |

## Việc Đợt B của Agent 2 (chỉ trong file sở hữu)

1. GAP-1: sửa `tools/sign-bundled-engine.js` — chấp nhận khóa công khai
   publisher riêng (tham số/env), kiểm chữ ký bằng khóa đó, từ chối khi
   khóa publisher trùng khóa license; với `engine='camoufox'` bắt buộc có
   khóa publisher riêng. Thêm test.
2. GAP-1b: `CamoufoxInstallService` nhận thêm tùy chọn `licenseKey` để tự
   từ chối khóa publisher trùng khóa license (phòng thủ nhiều lớp; việc
   truyền tham số ở `main.js` thuộc Agent điều phối — xem
   INTEGRATION-NOTES.md).
3. GAP-2: quét marker khóa riêng tư: công cụ ký từ chối ký cây engine chứa
   material khóa riêng tư và từ chối file khóa nằm trong cây engine;
   `BundledEngineManager.verify()` từ chối cây engine chứa file khóa riêng
   tư độc lập (file ≤ 1 MiB chứa marker PEM/OpenSSH private key). Thêm test.
4. Khóa chặt hành vi đã đúng bằng test bổ sung: validateRelease (manifest
   chứa `manifest.json`, ký bằng khóa license, khóa không phải Ed25519),
   downloadPinned (redirect loop, Content-Length mismatch, redirect https
   ngoài allowlist), constructor install service (khóa RSA, root tương đối),
   `loadCamoufoxPublisherKey` (khóa RSA, file quá cỡ).
