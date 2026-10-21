# 5. Sao lưu, khôi phục và xóa dữ liệu

Ứng dụng có **hai cơ chế sao lưu khác nhau** — đừng nhầm chúng:

| | Sao lưu cấu hình | Snapshot phiên |
|---|---|---|
| Nội dung | Cấu hình hồ sơ + quy trình (workflow). **Không** chứa phiên đăng nhập, cookie. | Dữ liệu phiên của một hồ sơ đã đóng — **có** chứa thông tin đăng nhập và cookie, đã mã hóa bằng mật khẩu bạn đặt. |
| Mã hóa | AES-256-GCM, khóa suy ra từ mật khẩu bằng scrypt. Mật khẩu tối thiểu 12 ký tự. | Mã hóa bằng mật khẩu tự đặt; ứng dụng cảnh báo tuyệt đối không chia sẻ file hoặc mật khẩu snapshot. |
| Giới hạn | Tối đa 2.000 hồ sơ / 2.000 workflow trong một tệp. | Tối đa 32 MB và 1.200 file mỗi snapshot. |
| Khi khôi phục | Tạo hồ sơ **mới** (tên có hậu tố "(nhập)"), không ghi đè hồ sơ đang có. | Khôi phục vào hồ sơ đã đóng, cần xác nhận rõ ràng trước khi thực hiện. |
| Đồng bộ cloud | Không. | Không. |

## 5.1 Sao lưu cấu hình (nút Sao lưu cấu hình trong mục bảo trì)

**Xuất:** đặt mật khẩu (tối thiểu 12 ký tự) và xuất tệp sao lưu đã
mã hóa. Hãy giữ mật khẩu ở nơi an toàn — mất mật khẩu là mất khả
năng đọc bản sao lưu, phần mềm không có đường khôi phục mật khẩu.

**Nhập:** chọn tệp, nhập mật khẩu. Trước khi nhập, ứng dụng cho xem
trước số hồ sơ/workflow và số hồ sơ cần gán lại proxy. Các điểm cần
biết trước khi bấm nhập:

- Hồ sơ được nhập là **hồ sơ mới**, bắt đầu từ phiên rỗng — đúng như
  hộp xác nhận trong ứng dụng ghi: *"Nhập hồ sơ MỚI, không khôi phục
  cookies/phiên."*
- **Mật khẩu proxy không nằm trong bản sao lưu** (phần mềm từ chối
  tệp sao lưu chứa thông tin đăng nhập proxy). Hồ sơ có proxy mã hóa
  sẽ ở trạng thái **khóa cho tới khi bạn gán lại proxy** trong Proxy
  Center — đây là chủ đích bảo vệ, không phải lỗi.
- Toàn bộ tệp được kiểm tra hợp lệ **trước** khi ghi bất cứ thứ gì:
  một hồ sơ/workflow không hợp lệ làm cả lần nhập dừng lại, dữ liệu
  đang có không bị ghi dở.

## 5.2 Snapshot phiên

Dùng khi bạn cần mang theo cả trạng thái đăng nhập của một hồ sơ:
chọn hồ sơ **đã đóng**, tạo snapshot với mật khẩu riêng. Vì snapshot
chứa thông tin đăng nhập, hãy đối xử với file snapshot như với mật
khẩu của chính tài khoản đó: lưu nơi an toàn, không gửi qua kênh
không tin cậy, không dùng chung mật khẩu snapshot với mật khẩu khác.

## 5.3 Xóa một hồ sơ — thùng rác 30 ngày

- Xóa hồ sơ trong bảng hồ sơ đưa hồ sơ vào **thùng rác**: trong mục
  thùng rác bạn có thể **Khôi phục** hồ sơ quay lại.
- Hồ sơ ở thùng rác quá **30 ngày** thì hết thời hạn khôi phục (ứng
  dụng báo rõ "Trash retention has expired after 30 days" nếu bạn
  khôi phục muộn) và có nút dọn các mục hết hạn.
- **Xóa vĩnh viễn (purge)** trong thùng rác mới là xóa thật và không
  khôi phục được.
- Hồ sơ đang chạy trình duyệt thì không xóa được — đóng trình duyệt
  và chờ tiến trình thoát hẳn trước (xem thêm lỗi 409 ở FAQ).

## 5.4 Dọn cache cục bộ

Mục **Dọn cache trình duyệt cục bộ** chỉ xóa các thư mục cache được
phép của tối đa 20 hồ sơ đã đóng mà bạn chọn; **không** xóa cookie,
mật khẩu, tiện ích, LocalStorage hay IndexedDB. Thao tác cần gõ xác
nhận `XOA CACHE` và không hoàn tác được.

## 5.5 Gỡ cài đặt và xóa toàn bộ dữ liệu

1. Sao lưu cấu hình (mục 5.1) nếu bạn còn cần hồ sơ ở máy khác —
   nhớ: bản sao lưu không chứa phiên đăng nhập.
2. Gỡ ứng dụng bằng trình gỡ cài đặt của Windows (Settings → Apps)
   hoặc shortcut gỡ cài đặt đi kèm.
3. Thư mục dữ liệu của ứng dụng **không tự biến mất** theo thao tác
   gỡ cài đặt thông thường. Muốn xóa sạch, tự xóa thư mục:
   `C:\Users\<tên người dùng>\AppData\Roaming\LHM Ads Browser`
   Thư mục con `storage` bên trong chứa toàn bộ dữ liệu của ứng
   dụng trên máy này: hồ sơ và dữ liệu trình duyệt của từng hồ sơ
   (`storage\profiles`), cấu hình, kho proxy đã mã hóa, quan sát IP
   thoát và nhật ký hành vi trong ứng dụng. Xóa thư mục này là xóa
   toàn bộ — không khôi phục được nếu không có sao lưu.
4. Bản Camoufox đã cài qua hộp thoại Engine nằm trong thư mục dữ
   liệu của ứng dụng và bị xóa cùng khi bạn xóa thư mục ở bước 3.
   Ngược lại, Chrome/Edge/Firefox hệ thống là phần mềm riêng của
   máy, không bị ảnh hưởng.

## 5.6 Giới hạn của việc xóa dữ liệu — đọc trước khi kỳ vọng

- Xóa dữ liệu trong hồ sơ **không xóa bản ghi đã nằm trên máy chủ
  bên ngoài**. Tài khoản đã đăng nhập ở đâu vẫn có lịch sử phía máy
  chủ của dịch vụ đó; xóa cookie cục bộ không rút lại điều đó.
- Xóa một hồ sơ không thay đổi các hồ sơ khác — dữ liệu giữa các hồ
  sơ nằm ở các vùng chứa riêng; nhưng "đã xóa sạch phía nền tảng" là
  điều phần mềm trên máy bạn không thể tuyên bố, xem thêm
  [trang giới hạn](07-nhung-gi-san-pham-khong-hua.md).
