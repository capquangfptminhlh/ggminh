# INTEGRATION NOTES — Agent 18 (QA license) cho điều phối

## 1. Thêm test vào chuỗi (file chung — điều phối áp)

Trong `package.json` mục `scripts.test`, thêm sau `node test/license-policy-integration.js`:

```
node test/license-state-matrix.js
```

Test tự chứa (khóa thử tự sinh, authority loopback tự đóng), không cần
mạng ngoài, chạy ~1 giây.

## 2. Đề xuất câu chữ (Mục 11) — tầng UI, KHÔNG đổi chuỗi trong src/licensing/

Chuỗi lỗi trong `manager.js` đang được test/consumer khác khớp nguyên
văn; ánh xạ hiển thị nên làm ở `src/ui/licenseCenter.js` (và nơi hiện
thông điệp chặn thao tác) theo reason/status:

### 2a. Lỗi kích hoạt (thay cho việc hiện error.message thô)

| Chuỗi gốc (manager) | Câu hiển thị đề xuất |
|---|---|
| License expired | "License đã hết hạn. Hãy liên hệ bên bán để gia hạn và nhận mã mới." |
| License belongs to a different installation ID | "License này gắn với một mã cài đặt khác. Hãy sao chép mã cài đặt trên máy này và gửi cho bên bán để cấp lại." |
| License is not active yet | "License chưa tới ngày bắt đầu hiệu lực. Kiểm tra lại ngày bắt đầu trong thông tin bên bán đã gửi." |
| License format not recognized | "Mã license không đúng định dạng. Hãy sao chép lại toàn bộ mã bên bán đã gửi, không thêm khoảng trắng hay xuống dòng." |
| License signature mismatch / License JSON is invalid / Invalid license fields… | "Mã license không vượt qua kiểm chứng. Hãy dán lại mã gốc; nếu vẫn lỗi, gửi nguyên văn thông báo này cho bên bán." |
| System clock appears to have moved backwards | "Đồng hồ hệ thống có dấu hiệu bị lùi giờ. Hãy đặt lại giờ Windows cho đúng, bật đồng bộ tự động rồi khởi động lại ứng dụng." |

### 2b. Thông điệp chặn thao tác theo `status().reason` (thay thông điệp chung duy nhất)

Giữ nguyên câu giữ dữ liệu "Dữ liệu vẫn có thể xem, sao lưu và khôi phục."
làm hậu tố cho mọi trường hợp; đổi phần đầu theo reason:

| reason | Phần đầu đề xuất |
|---|---|
| expired / trial_expired | "Giấy phép đã hết hạn." (trial: "Thời gian dùng thử đã kết thúc.") + "Hãy liên hệ bên bán để gia hạn." |
| clock_error | "Đồng hồ hệ thống bất thường nên ứng dụng tạm khóa thao tác." + "Hãy đặt lại giờ Windows cho đúng, bật đồng bộ tự động rồi khởi động lại ứng dụng." |
| different_installation | "License đang lưu gắn với một mã cài đặt khác." + 2a dòng tương ứng |
| not_yet_valid | "License chưa tới ngày bắt đầu hiệu lực." |
| invalid | "License đang lưu không vượt qua kiểm chứng." + "Hãy dán lại mã gốc hoặc liên hệ bên bán." |
| revoked | "License đã bị bên phát hành thu hồi." + "Hãy liên hệ bên bán để biết lý do và hướng xử lý." |
| unverified / verification_expired | "Ứng dụng chưa xác minh được license với máy chủ." + "Hãy kết nối mạng và bấm xác minh online trong mục License." |

### 2c. Nhãn trạng thái còn thiếu trong licenseCenter

- reason=`trial_expired`: dòng trạng thái nên hiện "Dùng thử đã kết thúc"
  thay vì "Bị giới hạn · Chưa kích hoạt".
- Nhãn tiếng Việt cho online.state: `verified`="Đã xác minh",
  `offline_grace`="Đang dùng hạn offline sau xác minh",
  `unverified`="Chưa xác minh", `verification_expired`="Đã quá hạn xác minh",
  `revoked`="Đã bị thu hồi", `expired`="License hết hạn (theo máy chủ)".
- Tên hiển thị tính năng thay mã thô: profiles="Hồ sơ",
  automation="Automation Studio", api="API cục bộ" — áp cho cả thông
  điệp "không cho phép <feature>" và dòng "Quyền: …".

## 3. Đề xuất bổ sung runbook người bán (tài liệu của Agent 14 — điều phối chuyển)

1. Mục thu hồi: nói thẳng "thu hồi chỉ có hiệu lực với bản cài có cấu
   hình máy chủ xác minh; khách chạy offline thuần dùng tiếp tới ngày
   hết hạn in trên license".
2. Mục cấp mới: "token làm mất thì cấp license MỚI và nên revoke license
   đã mất nếu nghi lộ; bản ghi cũ vẫn được due/report đếm tới khi hết hạn".
3. Mục gia hạn: ghi hành vi deactivate đã kiểm chứng — khách xoá license
   cục bộ thì quay về phần dùng thử CÒN LẠI tính từ ngày cài đầu, không
   được cộng lại 30 ngày.

## 4. Đề xuất công cụ (chưa làm — chờ điều phối duyệt)

- Thêm lệnh đọc-chỉ-xem `inspect LEDGER TOKEN` (hoặc inspect theo
  licenseId đã có) vào `tools/license-admin.js` để người bán bóc
  licenseId/plan/hạn từ token khách gửi lại khi làm renew.
- Thống nhất phép cộng tháng giữa `customerLedger.addMonths` (kẹp cuối
  tháng) và `tools/issue-license.js` (`setUTCMonth` tràn ngày): chọn
  phép kẹp cuối tháng cho cả hai để ngày hết hạn nhất quán giữa hai
  đường cấp.

## 5. Không có thay đổi chính sách

Thời hạn trial (30 ngày), trần trial (10), tính năng từng gói, grace
online (72 giờ) — toàn bộ giữ nguyên; đợt này chỉ kiểm chứng, sửa lỗi
sập do file hỏng, và đề xuất câu chữ.
