# WHAT SHIPS IN THE BOX — LHM Ads Browser v5.8.0

Một trang cho bộ phận hỗ trợ: khách hàng nhận đúng những gì dưới
đây, không hơn. (Trạng thái: Preview — các mục "chưa kèm" là
trạng thái thật của bản này, không phải lỗi giao hàng.)

## 1. File khách tải về

| Mục | Giá trị |
|---|---|
| File cài đặt | `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` (NSIS, Windows x64) |
| Kích thước / hash bản Wave 2 | 89.473.785 byte / SHA-256 `54aec523bfc6436d3b0a702407fbdf1333a64b9faaf9dd448152f7c4e383b497` (bản phát hành cuối phải ghi lại hash của đúng file giao) |
| Chữ ký Authenticode | **Không có** (quyết định của chủ dự án) → khi cài, SmartScreen hiện "nhà phát hành không xác định"; khách bấm **More info → Run anyway**. Đã có hướng dẫn trong tài liệu phần 01 |
| Icon | Icon LHM riêng (`build/icon.ico`, sinh từ nguồn SVG của dự án) |

## 2. Bên trong gói cài

- Ứng dụng Electron (đóng gói asar) + 2 script PowerShell để ngoài
  asar phục vụ lúc chạy: `src/ops/windowControl.ps1`,
  `tools/extract-signed-engine.ps1`.
- **Không kèm, theo thiết kế của glob đóng gói:** bất kỳ engine
  trình duyệt nào; tài liệu nội bộ, Hiến pháp, hồ sơ QA; test;
  công cụ người bán (`license-admin`, `issue-license`,
  `sign-bundled-engine`…); khoá ký/khoá license dưới mọi hình thức.

## 3. Chính sách engine (khách cần có gì)

- **Hồ sơ Chromium:** chạy trên Chrome/Edge **đã cài sẵn trên máy
  khách**, hoặc gói engine đóng kèm đã ký (giao riêng, ngoài gói
  cài) nếu người bán cung cấp.
- **Hồ sơ Camoufox:** engine cài qua luồng cài đặt có ký trong ứng
  dụng (manifest Ed25519 bằng khóa publisher riêng + kiểm SHA-256).
  Cho tới khi buổi lễ khóa publisher production hoàn tất và có cây
  Camoufox Windows chính thức đã ký, luồng này **fail-closed —
  không cài được**, và bản Preview không kèm tài sản Camoufox
  thương mại nào (trong repo hai thư mục `resources/*engine*` chỉ
  chứa README giữ chỗ và bị loại khỏi gói cài).
- **Gecko/Firefox thường:** chỉ mở thủ công (manual-only), API tự
  động hoá trả HTTP 409 — đúng thiết kế.

## 4. Giao kèm ngoài gói cài

- **Tài liệu khách hàng** (`docs/customer-guide/`, 7 phần): cài
  đặt & kích hoạt · tạo hồ sơ & proxy · hiểu các cảnh báo · bảng
  kiểm tiêu chí · sao lưu/khôi phục/xoá dữ liệu · FAQ sự cố ·
  "Những gì sản phẩm không hứa".
- **License:** dùng thử 10 ngày / tối đa 10 hồ sơ khi chưa kích
  hoạt; token license do người bán cấp thủ công sau khi xác nhận
  thanh toán (starter = tính năng hồ sơ; pro/business thêm API +
  tự động hoá — hai gói này hiện cùng tập tính năng trong code,
  khác nhau ở giới hạn người bán đặt). Hết hạn license vẫn xem,
  sao lưu và khôi phục được dữ liệu.
- **Sổ tay người bán** ở phía người bán, không giao khách.

## 5. Dữ liệu trên máy khách (để hỗ trợ trả lời đúng)

- Thư mục dữ liệu: `%AppData%\Roaming\LHM Ads Browser\storage`
  (hồ sơ dưới 4 gốc: `profiles/`, `gecko-profiles/`,
  `camoufox-profiles/`, `extensions/`).
- File quan sát/cảnh báo có giới hạn giữ liệu ghi trong tài liệu
  phần 03/05 (quan sát IP tối đa 20.000 bản ghi / 7 ngày; sự kiện
  hành vi tối đa 1.200 / 24 giờ; lịch sử cảnh báo 1.000 mục / 90
  ngày). Không ghi nội dung gõ phím, mật khẩu, nội dung biểu mẫu.
- Gỡ cài đặt chỉ gỡ chương trình; thư mục dữ liệu còn lại trên máy
  cho tới khi khách tự xoá (tài liệu phần 05 hướng dẫn).

## 6. Khi khách báo sự cố, hỏi đúng 4 thứ

Phiên bản ứng dụng (tên file cài) · loại hồ sơ/engine · nguyên văn
thông báo lỗi hoặc cảnh báo · đã làm tới bước nào trong tài liệu.
Không hứa kết quả phía nền tảng (Google/Facebook) — xem tài liệu
phần 07.
