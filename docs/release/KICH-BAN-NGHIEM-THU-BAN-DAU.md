# Kịch bản nghiệm thu bản bán đầu — phương án A (license offline `strict`)

Dùng cho bước A1–A2 trong `COMMERCIAL_LAUNCH_PLAN_20261109.md`. Mỗi bước
ghi **PASS / FAIL / NOT_RUN**, thời điểm, ảnh chụp (che mã license). Đây là
kịch bản, **chưa phải kết quả**.

**Chuẩn bị**

- **Máy bán:** máy chủ dự án có `D:\LHM-Keys\license-issuer-private.pem`.
  Sổ khách hàng (ledger) để **ngoài repo**, ví dụ `D:\LHM-Ops\ledger.json`.
  Nạp mật khẩu khóa theo `docs/seller-runbook/README.md` mục 1 (DPAPI, không
  hiện ra màn hình).
- **Máy khách thử:** Windows 10/11 **sạch, khác máy bán** (máy ảo được).
  Chưa từng cài LHM. Đúng EXE đã đóng băng, ghi SHA-256.
- Không dán mã license, mật khẩu hay khóa vào chat/GitHub. Ảnh chụp phải
  che mã license.

---

## Phần 1 — License offline `strict`

| # | Bước | Kết quả mong đợi | PASS/FAIL | Ghi chú / ảnh |
|---|---|---|---|---|
| 1.1 | Máy khách: kiểm SHA-256 EXE, cài. SmartScreen → *Thông tin bổ sung → Vẫn chạy* | Cài xong, mở được, hiện **Dùng thử · 10 ngày** | | |
| 1.2 | Tạo 10 hồ sơ, thử tạo hồ sơ thứ 11 | Hồ sơ 11 bị chặn với thông báo giới hạn dùng thử | | |
| 1.3 | *Công cụ → Giấy phép & gia hạn* → **Sao chép mã** cài đặt, gửi máy bán | Có mã cài đặt (UUID) | | |
| 1.4 | Máy bán: `node tools\license-admin.js add <LEDGER> "Khach thu 01" <INSTALLATION_ID>` | Trả về `customerId` | | |
| 1.5 | Máy bán: `node tools\license-admin.js issue <LEDGER> <CUSTOMER_ID> pro --days 30 100 D:\LHM-Keys\license-issuer-private.pem strict` | In mã license **một lần**; ledger **không** chứa mã | | |
| 1.6 | Máy khách: *Kích hoạt hoặc gia hạn* → dán mã → **Kích hoạt / gia hạn** | Gói Pro, hạn = ngày cấp + 30 ngày, tối đa 100 hồ sơ | | |
| 1.7 | Tạo hồ sơ thứ 11–12, mở 1 hồ sơ, bật Local API | Được phép (đúng gói Pro) | | |
| 1.8 | Thoát hẳn app, mở lại; khởi động lại Windows, mở lại | License vẫn hiệu lực, không phải kích hoạt lại | | |
| 1.9 | Dán một mã license sửa 1 ký tự | Bị từ chối (chữ ký không hợp lệ) | | |
| 1.10 | Dán mã license cấp cho **mã cài đặt khác** | Bị từ chối (sai bản cài) | | |
| 1.11 | Gia hạn sớm: máy bán `node tools\license-admin.js renew <LEDGER> <LICENSE_ID> --days 30 D:\LHM-Keys\license-issuer-private.pem` → dán mã mới | Hạn mới = hạn cũ + 30 ngày, giữ gói và giới hạn | | |
| 1.12 | **Chỉ trên máy ảo thử:** chỉnh đồng hồ **tới** sau ngày hết hạn, mở app | Trạng thái hết hạn; **không** mở được phiên mới / chạy tự động hóa; vẫn xem hồ sơ, **Sao lưu** được | | |
| 1.13 | Máy ảo thử: chỉnh đồng hồ **lùi** về trước | App cảnh báo giờ hệ thống bị chỉnh lùi | | |
| 1.14 | Dán mã gia hạn còn hạn | Mở phiên lại được | | |

**Ghi lại:** commit app, SHA-256 EXE, bản Windows (`winver`), ngày giờ,
người thử, license ID (không ghi mã license).

## Phần 2 — Nâng cấp giữ dữ liệu

Cần 2 bộ cài: bản **cũ** (đã phát hành trước) và bản **mới** (đã đóng băng).

| # | Bước | Kết quả mong đợi | PASS/FAIL | Ghi chú / ảnh |
|---|---|---|---|---|
| 2.1 | Cài bản cũ, kích hoạt license | Hiệu lực | | |
| 2.2 | Tạo 5 hồ sơ (2 nhóm), 2 proxy có mật khẩu, 1 quy trình Studio, 1 lịch chạy, 1 Snapshot phiên | Có đủ | | |
| 2.3 | Mở 1 hồ sơ, đăng nhập một website thử của bạn, đóng | Có cookie phiên | | |
| 2.4 | *Thông tin phần mềm → Kiểm tra an toàn nâng cấp* | Báo cáo không có lỗi chặn | | |
| 2.5 | **Sao lưu** → tạo `.lhmbak` | Có file | | |
| 2.6 | Cập nhật lên bản mới: qua *Kiểm tra phiên bản online* (nếu đã có release `lhm-updates`) hoặc chạy bộ cài mới đè lên | Bộ cài chạy xong | | |
| 2.7 | Mở bản mới: kiểm phiên bản | Đúng bản mới | | |
| 2.8 | Đếm hồ sơ, nhóm, proxy, quy trình, lịch | Còn đủ như 2.2 | | |
| 2.9 | Mở hồ sơ ở 2.3 | Vẫn đăng nhập (cookie còn) | | |
| 2.10 | Proxy có mật khẩu: **Kiểm tra proxy** | Kết nối được (mật khẩu còn) | | |
| 2.11 | License | Còn hiệu lực, không phải kích hoạt lại | | |
| 2.12 | Gỡ cài đặt rồi cài lại bản mới | Thư mục `%APPDATA%\power-browser` còn; dữ liệu còn | | |

## Phần 3 — Cập nhật có chữ ký (khi làm bước A4)

| # | Bước | Kết quả mong đợi | PASS/FAIL |
|---|---|---|---|
| 3.1 | Máy bán: ký `stable.json` bằng `tools\sign-app-update.js` với khóa `D:\LHM-Keys\update-private.pem` | In SHA-256 và hạn manifest | |
| 3.2 | `node tools\update-release-preflight.js --installer <EXE> --manifest stable.json --public-key resources\update-publisher\update-publisher-ed25519.pub --version <X.Y.Z> --from-version <bản cũ>` | `VERIFIED_ARTIFACT_ONLY` | |
| 3.3 | Tải EXE + `stable.json` lên release `lhm-updates` | URL tải được | |
| 3.4 | Bản cũ: *Kiểm tra phiên bản online* | Thấy bản mới | |
| 3.5 | *Tải bản cập nhật đã xác minh* | Tải xong, đúng SHA-256 | |
| 3.6 | Ghi ngày manifest hết hạn (mặc định 30 ngày) vào lịch ký lại | Có lịch | |

---

## Kết luận nghiệm thu

| Phần | Kết quả | Người duyệt | Ngày |
|---|---|---|---|
| 1. License offline strict | | | |
| 2. Nâng cấp giữ dữ liệu | | | |
| 3. Cập nhật có chữ ký | | | |

Chỉ khi Phần 1 và 2 đều PASS mới đánh dấu bước A1–A2 đạt trong Issue #47.
