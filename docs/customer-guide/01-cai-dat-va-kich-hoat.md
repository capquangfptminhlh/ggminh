# 1. Cài đặt và kích hoạt

## 1.1 Cài đặt trên Windows

1. Chạy tệp cài đặt `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` do
   bên bán cung cấp. Trình cài đặt cho phép chọn thư mục cài (không
   phải cài một chạm).
2. Mở ứng dụng từ shortcut sau khi cài xong. Lần chạy đầu tiên, ứng
   dụng tạo thư mục dữ liệu tại:
   `C:\Users\<tên người dùng>\AppData\Roaming\LHM Ads Browser\storage`
   Mọi hồ sơ, cấu hình và nhật ký quan sát đều nằm trong thư mục này.
3. Ứng dụng **không tự tải engine lạ về máy**. Trình duyệt dùng để mở
   hồ sơ lấy từ các nguồn ở mục 1.4 dưới đây, và engine đóng gói chỉ
   chạy khi chữ ký nhà phát hành và mã băm SHA-256 của toàn bộ tệp
   khớp với manifest đã ký.

Lưu ý thực tế: Windows SmartScreen có thể hiện cảnh báo với bản cài
chưa có chứng chỉ ký số Authenticode. Hãy đối chiếu nguồn tệp với bên
bán trước khi bấm chạy; đừng tải bản cài từ nguồn không rõ.

## 1.2 Dùng thử và license

- Lần cài đặt đầu tiên tự bắt đầu **thời gian dùng thử 30 ngày**, tối
  đa **10 hồ sơ**, gồm các tính năng hồ sơ, Automation và API cục bộ.
- Hết dùng thử hoặc hết hạn license, ứng dụng **khóa các thao tác vận
  hành** (tạo hồ sơ mới, mở trình duyệt, dùng API) nhưng **dữ liệu vẫn
  xem được, sao lưu được và khôi phục được** — phần mềm báo rõ điều
  này trong thông báo lỗi. Đừng chờ tới ngày hết hạn mới gia hạn; xem
  mục Trạng thái license ở bước 3 dưới đây để biết ngày hết hạn.
- License đã hết hạn hoặc không hợp lệ **không tự quay lại dùng thử**.
  License của bản cài này cũng không dùng được cho bản cài khác (mỗi
  license gắn với một mã cài đặt — xem bước 2).

### Kích hoạt license

1. Mở mục **License** trong ứng dụng. Bạn sẽ thấy trạng thái hiện tại:
   gói, ngày hết hạn, giới hạn số hồ sơ và danh sách tính năng.
2. Bấm **Sao chép mã cài đặt** (Installation ID) và gửi mã này cho bên
   bán. Mã cài đặt là một mã định danh của bản cài trên máy bạn —
   không phải mật khẩu, nhưng chỉ gửi cho bên bán của bạn.
3. Bên bán cấp cho bạn một **mã license** (một chuỗi ký tự dài). Dán
   mã vào ô license trong mục License và bấm kích hoạt.
4. Kết quả đúng sẽ báo "Đã kích hoạt thành công" và trạng thái chuyển
   sang gói đã mua. Nếu báo lỗi, xem [FAQ](06-faq-su-co.md#license)
   (lệch mã cài đặt, hết hạn, lệch đồng hồ hệ thống là các nguyên nhân
   có thật trong phần mềm).

## 1.3 Cập nhật trạng thái online (nếu bên bán cấu hình)

Mục License có nút kiểm tra máy chủ xác minh. Nếu bên bán chưa cấu
hình máy chủ, ứng dụng báo "Máy chủ xác minh chưa được cấu hình" —
đây là trạng thái cấu hình, không phải lỗi của máy bạn, và license
offline vẫn có hiệu lực theo chữ ký của nó.

## 1.4 Chọn nguồn engine (nút **Engine** trên thanh công cụ)

Hộp thoại **Browser Engine · Nguồn trình duyệt** quyết định hồ sơ mở
bằng trình duyệt nào:

- **Chromium — System:** dùng Chrome/Edge đã cài sẵn trên máy bạn.
- **Chromium — Bundled:** dùng bộ Chromium do nhà phát hành cung cấp,
  chỉ khi manifest đã ký và mọi tệp khớp SHA-256. Thiếu một trong hai
  điều kiện, nguồn này không khả dụng.
- **Firefox / Gecko — Firefox cài trên máy (mặc định):** dùng bản
  Firefox có sẵn. Hồ sơ Gecko chỉ chạy thủ công; API điều khiển
  (CDP/RPA) bị từ chối theo thiết kế (xem FAQ về lỗi 409).
- **Camoufox (tùy chọn theo hồ sơ):** provider thử nghiệm, cần cài
  riêng bằng nút **Cài đặt Camoufox được xác minh** trong cùng hộp
  thoại. Quá trình cài chỉ chạy khi bạn bấm nút và xác nhận, chỉ nhận
  bản phát hành được LHM ký riêng, kiểm tra kích thước + SHA-256 +
  chữ ký manifest trước khi giải nén. Nếu kiểm chứng không đạt, cài
  đặt dừng lại — phần mềm không tự thay bằng bản khác.

Những điều Camoufox ở bản này **chưa** có (ghi ngay trong giao diện):
chạy bằng tiến trình Windows riêng cho duyệt web thủ công; proxy có
mật khẩu chỉ ở chế độ thử nghiệm (lab); **chưa xác minh DNS/WebRTC**,
GeoIP tự động và Automation Studio. Đổi nguồn engine chỉ thực hiện
được khi đã đóng mọi trình duyệt đang mở.

## 1.5 Sau khi cài xong

Tiếp tục sang [Tạo hồ sơ đầu tiên và gán proxy](02-tao-ho-so-va-proxy.md).
