# Báo cáo Agent 18 — QA luồng license (đợt thương mại hoá)

**Nhánh:** `agent-18/license-qa` từ `f4d7329`. **Tầng kiểm chứng:** integration —
`LicenseManager` + `LicensePolicy` THẬT (không stub manager như test cũ),
công cụ bán thật (`tools/license-admin.js`, ledger, authority server trên
loopback), khóa Ed25519 THỬ tự sinh lúc chạy test. Không phải bằng chứng
EXE đóng gói (Mục 23). Không thay đổi chính sách license nào.

**Sản phẩm:** `test/license-state-matrix.js` (11 mục A–L, tất cả PASS) +
2 sửa lỗi thật trong `src/licensing/` kèm test hồi quy (mục G).
Toàn bộ test license sẵn có chạy lại: PASS (enforcement, center,
center-ui, online, online-ui, policy-integration, admin, dashboard)
+ security, api-profile-updates, local-cli: PASS.

## 1. Ma trận trạng thái (hành vi thật đo bằng test)

| Trạng thái | Nguồn sự thật trong code | Hành vi ứng dụng quan sát được | Đối chiếu tài liệu | Kết quả |
|---|---|---|---|---|
| Dùng thử (mới cài) | `enforcement.js`: TRIAL_DAYS=30, TRIAL_MAX_PROFILES=10, TRIAL_FEATURES = cả 3 | access=trial, còn 30 ngày, tối đa 10 hồ sơ, dùng được profiles+automation+api; tạo hồ sơ thứ 11 bị chặn | Runbook + sổ tay khách: "30 ngày, tối đa 10 hồ sơ, đủ ba nhóm tính năng" | **PASS — khớp đúng con số** |
| Dùng thử ngày 29 → 30 | đồng hồ trial neo tại lần cài đầu | ngày 29 còn trial (còn 1 ngày); đủ 30 ngày → blocked, reason=`trial_expired` | — | PASS |
| starter hợp lệ | gói: features=['profiles'] | licensed; api/automation bị chặn "không cho phép"; trần hồ sơ theo token | Runbook: starter = chỉ hồ sơ | PASS |
| pro hợp lệ | features=['api','automation','profiles'] | licensed, đủ 3 tính năng | Runbook: pro = hồ sơ + API + Automation | PASS |
| business hợp lệ | features giống hệt pro | licensed, đủ 3 tính năng | Runbook ghi cùng mô tả như pro | PASS + **ghi nhận thương mại**: pro và business **giống hệt nhau về tính năng trong code** — khác biệt duy nhất là tên gói và `maxProfiles` do người bán đặt. Nếu giá hai gói khác nhau, khác biệt phải nằm ở trần hồ sơ/điều khoản dịch vụ, không ở tính năng |
| Hết hạn (expired) | manager.status | activate bị từ chối ("License expired"); token hết hạn gắn sẵn trong file → blocked reason=`expired`, **không** hồi lại dùng thử dù trial chưa hết | Runbook: "hết hạn không tự quay lại dùng thử" | PASS |
| Chưa tới hạn (not_yet_valid) | issuedAt > now+5 phút | activate bị từ chối; token gắn sẵn → blocked reason=`not_yet_valid`; lệch đồng hồ ≤5 phút được chấp nhận | Sổ tay khách có liệt kê trạng thái này | PASS |
| Sai máy (different_installation) | installationId trong token ≠ máy | activate bị từ chối; token gắn sẵn → blocked | Runbook mục 5: cấp license mới theo mã cài đặt mới | PASS |
| Đồng hồ lùi (clock_error) | neo highest-seen bền qua khởi động lại | lùi ≤5 phút: chấp nhận; lùi hơn: status=`clock_error`, policy blocked, activate bị từ chối; neo giữ qua restart | Runbook: sửa giờ Windows + khởi động lại, không cấp license mới để "né" — khớp (license mới cũng không kích hoạt được khi clock_error) | PASS |
| Token bị sửa nội dung | chữ ký Ed25519 trên claims chuẩn hoá | sửa maxProfiles 3→9999 giữ nguyên chữ ký → verify báo "License signature mismatch"; trạng thái = `invalid`, blocked | — | PASS (chống nâng quyền) |
| Token rác / hỏng định dạng | verifyLicense | activate báo "License format not recognized"; token rác gắn sẵn → `invalid` (không phải inactive) | — | PASS |
| File activation hỏng cú pháp JSON | manager constructor | **TRƯỚC: ném SyntaxError thô, main.js (dòng 780) không bọc → licensing sập khi khởi động. SAU SỬA: status=`invalid`, blocked, không hồi trial; activate hợp lệ sau đó tự sửa trạng thái** | — | **LỖI THẬT — ĐÃ SỬA + test hồi quy (mục G)** |
| File trial hỏng cú pháp JSON | enforcement constructor | **TRƯỚC: SyntaxError thô. SAU SỬA: lỗi có kiểm soát "Trial state invalid: manual license support required"** — cùng quy ước với file identity/clock | — | **LÃI THẬT — ĐÃ SỬA** |
| Huỷ kích hoạt cục bộ (deactivate) | trial neo tại ngày cài | quay về **phần trial còn lại** (huỷ ở ngày 10 → còn 20 ngày), không bao giờ là 30 ngày mới; qua ngày 30 → blocked `trial_expired` | Tài liệu chưa mô tả điểm này — đã ghi vào INTEGRATION-NOTES để bổ sung runbook | PASS (hành vi đúng chủ đích chống gian lận, nay đã có test ghim) |
| Thu hồi (revoke) — khách offline | registry chỉ có ý nghĩa qua xác minh online | manager cục bộ vẫn báo `active` — **thu hồi không có hiệu lực gì** với bản cài không cấu hình endpoint xác minh | Runbook nói thu hồi "ghi vào registry (dùng cho xác minh online)" — đúng nhưng cần nói thẳng hơn với người bán: khách offline dùng tiếp tới hết hạn | PASS + cảnh báo vận hành (xem mục 3) |
| Thu hồi — khách có xác minh online | OnlineLicenseVerifier + authority | chưa có receipt → blocked `unverified` (fail-closed ngay lần đầu); receipt `revoked` → blocked reason=`revoked`; `allow` + receipt mới hơn → licensed trở lại; grace offline 72 giờ sau receipt hợp lệ | — | PASS |

## 2. Kiểm toán thông điệp người dùng thấy

| # | Bề mặt | Chuỗi thực tế (nguyên văn) | Có bước tiếp theo rõ không | Đánh giá |
|---|---|---|---|---|
| M1 | Lỗi kích hoạt (UI hiện thô qua `licenseCenter.js`: "Kích hoạt thất bại: " + error.message) | Tiếng Anh kỹ thuật: `License expired` / `License belongs to a different installation ID` / `License is not active yet` / `License format not recognized` / `License signature mismatch` / `System clock appears to have moved backwards`… | **Không** — không câu nào nói việc cần làm (gửi mã cài đặt cho người bán, chép lại toàn bộ token, kiểm tra ngày bắt đầu, sửa giờ Windows) | **LỆCH** — đề xuất ánh xạ tiếng Việt tại tầng UI trong INTEGRATION-NOTES (không đổi chuỗi trong manager vì test/consumer khác đang khớp chúng) |
| M2 | Chặn thao tác (enforcement.require) — MỘT thông điệp chung cho mọi lý do chặn | "Giấy phép hết hạn, bị thu hồi hoặc chưa được máy chủ xác minh. Dữ liệu vẫn có thể xem, sao lưu và khôi phục." | Một phần — câu giữ dữ liệu rất tốt và khớp tài liệu; nhưng không có bước xử lý cụ thể | **LỆCH theo lý do**: test H chứng minh khi reason=`clock_error` người dùng vẫn nhận đúng câu này — hướng dẫn sai trọng tâm (vấn đề là đồng hồ, không phải giấy phép); với `different_installation`/`not_yet_valid` cũng lệch tương tự. Đề xuất thông điệp theo reason trong INTEGRATION-NOTES |
| M3 | Nhãn trạng thái ở License Center | statusText tiếng Việt cho các trạng thái manager: đạt. Nhưng khi trial hết hạn, manager báo `inactive` → dòng trạng thái hiện "Bị giới hạn · Chưa kích hoạt" | — | **LỆCH nhỏ**: khách đã dùng hết 30 ngày thử chứ không phải "chưa kích hoạt"; dòng tính năng bên dưới có câu giữ dữ liệu nên không mất dữ liệu, nhưng nhãn chính gây hiểu lầm. Đề xuất nhãn riêng cho reason=`trial_expired` |
| M4 | Trạng thái xác minh online trên UI | hiện mã thô tiếng Anh: `revoked`, `unverified`, `verification_expired`, `offline_grace` | Không | **LỆCH nhỏ** — đề xuất nhãn tiếng Việt trong INTEGRATION-NOTES |
| M5 | Chặn theo tính năng | "Gói starter không cho phép api. Hãy gia hạn hoặc nâng gói." | **Có** (gia hạn/nâng gói) | ĐẠT về cấu trúc; trừ điểm: lẫn mã tính năng tiếng Anh (`api`, `automation`, `profiles`) trong câu tiếng Việt — đề xuất tên hiển thị |
| M6 | Chặn theo trần hồ sơ | "Giới hạn 10 profile của gói dùng thử đã đạt. Có thể mở hoặc sửa những profile hiện có." | **Có** | ĐẠT |
| M7 | Dòng quyền khi dùng thử | "Quyền: profiles, automation, api · Giới hạn 10 hồ sơ" | — | ĐẠT thông tin; mã tiếng Anh thô (cùng nhóm M5) |

## 3. Quy trình người bán end-to-end (công cụ thật, mục K của test)

Chuỗi **add → issue → khách activate → due → renew → revoke → allow**
chạy trọn bằng `tools/license-admin.js` + ledger + authority thật:
token cấp ra kích hoạt được ở manager khách độc lập; ledger **không**
chứa token (đã kiểm tra toàn văn file); `due` báo đúng cửa sổ 14 ngày;
renew giữ gói + trần hồ sơ, sinh licenseId mới và ghi `renewalOf`;
revoke ghi đồng thời registry + ledger; allow đảo ngược được.

Điểm dễ thao tác sai / thiếu công cụ (ghi nhận, không tự sửa):

1. **`tools/issue-license.js` không diễn tập được bằng khóa thử**: nó
   tự kiểm chứng token bằng `PUBLIC_KEY` production đã biên dịch trong
   `manager.js`, nên khóa khác → lỗi "License signature mismatch" —
   đọc như lỗi ký, thực chất là lệch neo tin cậy. Đường này chỉ dùng
   được với đúng khóa production duy nhất (đúng thiết kế neo tin cậy,
   nhưng người bán phải biết trước).
2. **Thu hồi không tới được khách offline** (xem bảng mục 1): bán hàng
   phải hiểu revoke chỉ có tác dụng khi bản cài của khách có cấu hình
   máy chủ xác minh + đã từng xác minh thành công. Ngoài ra khi endpoint
   đã cấu hình mà khách chưa xác minh lần nào, app chặn fail-closed
   (`unverified`) — bật xác minh online là một thay đổi hành vi lớn,
   cần quy trình riêng, không bật lặng lẽ.
3. **Token in đúng một lần, mất là cấp mới** (licenseId mới); bản ghi
   cũ vẫn nằm trong ledger và vẫn được `due`/`report` đếm. Nên thu hồi
   token đã mất nếu nghi lộ — runbook chưa có lưu ý này (đề xuất bổ sung).
4. **Không có lệnh tra cứu từ token**: renew cần `OLD_LICENSE_ID` lấy
   từ ledger; nếu người bán chỉ có token khách gửi lại thì không có
   lệnh `inspect` để bóc licenseId — đề xuất thêm lệnh đọc-chỉ-xem
   trong INTEGRATION-NOTES.
5. **Hai bộ cấp dùng hai phép cộng tháng khác nhau**: ledger dùng
   `addMonths` kẹp cuối tháng (31/1 + 1 tháng → 28/2); issue-license
   dùng `setUTCMonth` tràn ngày (31/1 + 1 tháng → 3/3). Cả hai cho
   token hợp lệ nhưng ngày hết hạn lệch nhau vài ngày tuỳ công cụ.
6. revoke/allow cập nhật hai file không nguyên tử (code tự ghi chú) —
   runbook đã yêu cầu đối soát thủ công khi một phía lỗi: khớp thực tế.

## 4. Sửa lỗi đã thực hiện (trong phạm vi src/licensing/)

- `manager.js`: file `license-activation.json` hỏng cú pháp JSON →
  trạng thái `invalid` fail-closed thay vì ném SyntaxError làm sập
  khởi tạo ở `main.js:780`; activate/deactivate thành công xoá cờ hỏng.
- `enforcement.js`: file `license-trial.json` hỏng cú pháp → lỗi có
  kiểm soát "Trial state invalid: manual license support required".
- Hồi quy: mục G của `test/license-state-matrix.js`; toàn bộ test
  license cũ PASS sau sửa.
