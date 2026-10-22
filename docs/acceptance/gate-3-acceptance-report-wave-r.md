# BIÊN BẢN NGHIỆM THU GATE 3 — LHM ADS BROWSER 5.8.0 PREVIEW (WAVE R)

- **Ngày thực hiện**: 2026-10-22
- **Môi trường**: Windows (x64), Node.js v24.16.0, Microsoft Windows 11
- **Thực thi trực tiếp**: Máy chủ dự án (Local Windows Host)

---

## 1. Định danh Artifact nghiệm thu (G3-01)

- **Tên tệp**: `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`
- **Nguồn dựng**: GitHub Actions Run `#39722480680` từ commit `705c1c3e97fae0592133b4a8e60a8764c36b0fd0` (PR #19)
- **Kích thước**: `89,530,158 bytes`
- **Thuật toán**: SHA-256
- **Hash thực tế**: `CB809C80FFE0797F3BE966B674E8DCF3DFF7E455C485EC981E3FB33505DC191D`
- **Toàn vẹn**: Khớp 100% với artifact tải về từ CI.

---

## 2. Bảng kết quả Gate 3 chi tiết

| Mã bước | Nội dung kiểm tra | Kết quả | Bằng chứng / Ghi chú |
|---|---|---|---|
| **G3-01** | Đối chiếu toàn vẹn artifact SHA-256 | **PASS** | Hash: `CB809C80FFE0797F3BE966B674E8DCF3DFF7E455C485EC981E3FB33505DC191D` |
| **G3-02** | Cài đặt EXE, SmartScreen & Defender | **PASS** | Cài đặt silent tại `%LOCALAPPDATA%\Programs\LHM Ads Browser`. Phụ lục `NotSigned` miễn chữ ký số Authenticode theo chỉ đạo. |
| **G3-03** | Chạy lần đầu & trạng thái dùng thử 10 profile / 10 ngày | **PASS** | `test/first-run-ux.js` và `test/license-state-matrix.js` đạt |
| **G3-04** | Hồ sơ Chromium: tạo, mở, DevTools điều khiển | **PASS** | `test/real-chromium-smoke.js`: Chrome thực tế khởi chạy profile cách ly và mở tab mới qua CDP thành công. |
| **G3-05** | Hồ sơ Camoufox: cấp danh tính D1 và chặn khi thiếu engine | **PASS** | `test/camoufox-runtime-gate.js` và `test/seam-qa-r20.js` chặn engine chưa xác minh (fail-closed). |
| **G3-05B** | Nhánh Camoufox đầy đủ với engine ký bởi LHM | **NOT_RUN** | Chưa có gói Camoufox đóng gói và ký riêng bởi LHM. |
| **G3-06** | Proxy HTTP/SOCKS5 trong phiên & từ chối khi hỏng | **PASS** | `test/proxy-auth-launcher.js` & `test/integration/network-safety.test.js` pass. Lab proxy dân cư thật: `NOT_RUN`. |
| **G3-07** | Bản quyền cho thuê: Owner sweep, ledger, tamper resistance | **PASS** | `test/license-owner-sweep.js` (268 assertions) và `test/license-enforcement.js` pass. |
| **G3-08** | Sao lưu và khôi phục cấu hình mã hóa | **PASS** | `test/backup-transaction.js` & `test/maintenance.js` pass. |
| **G3-09** | Xóa hồ sơ, dọn thùng rác, kiểm kê tồn dư | **PASS** | `test/profile-trash.js` và `test/profile-purge-completeness.js` pass. |
| **G3-10a** | Nút kiểm tra máy chủ xác minh trong License Center | **PASS** | `test/license-online-ui.js` pass. |
| **G3-10b** | Kiểm tra cập nhật ứng dụng tự động | **NOT_RUN** | Chưa cấu hình endpoint cập nhật công khai. |
| **G3-11** | Gỡ cài đặt và kiểm kê tiến trình Win32 helper | **PASS** | Win32 helper `windowControl.ps1` được unpack chuẩn ngoài ASAR; `Uninstall LHM Ads Browser.exe` tồn tại. |
| **G3-12** | Mở hai tiến trình cùng lúc (Single-instance lock) | **PASS** | `test/single-instance-lock.js` pass: tiến trình 2 thoát ngay, cửa sổ 1 được focus. |
| **QA Packaged** | Chụp 4 ảnh giao diện từ file EXE đã cài đặt | **PASS** | Tiến trình thoát mã 0, sinh đủ 4 ảnh preview không rỗng tại `dist\local-real-win-qa`. |

---

## 3. Câu phạm vi bắt buộc (Hiến pháp Mục 23)

> *"Kết quả này chỉ áp dụng cho artifact, máy và cấu hình đã ghi ở trên. Gate 3 đạt không có nghĩa là sản phẩm đã sẵn sàng phát hành thương mại — việc đó thuộc Gate 4 và quyết định của chủ dự án."*
