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

### Khi Windows hiện cảnh báo SmartScreen lúc chạy tệp cài đặt

Ở giai đoạn phát hành hiện tại, bên bán phát hành bản cài **chưa ký
số bằng chứng chỉ Authenticode**. Vì vậy, khi bạn chạy tệp cài đặt,
Windows có thể hiện cảnh báo SmartScreen. Đây là điều đã biết trước
của bản phát hành này; cách nhận diện và xử lý như sau.

**Cảnh báo trông như thế nào:** một cửa sổ nền xanh của Windows với
tiêu đề dạng "Windows protected your PC" (trên Windows tiếng Việt:
"Windows đã bảo vệ PC của bạn"). Nội dung cho biết Microsoft
Defender SmartScreen đã ngăn một ứng dụng không được nhận diện khởi
động, kèm dòng chữ nói việc chạy ứng dụng này có thể gây rủi ro cho
PC. Ban đầu cửa sổ chỉ có nút **Don't run** (Không chạy) và một liên
kết nhỏ **More info** (Thông tin khác). Sau bước này, hộp thoại cài
đặt cũng có thể ghi nhà phát hành là "không xác định" (Unknown
publisher).

**Vì sao có cảnh báo này:** SmartScreen kiểm tra hai thứ — tệp có
chữ ký số của nhà phát hành do một tổ chức cấp chứng chỉ bên ngoài
cấp hay không, và tệp đã có đủ lịch sử được tải dùng hay chưa. Bản
cài hiện tại chưa có chữ ký Authenticode, và mỗi phiên bản mới là
một tệp mới chưa có lịch sử, nên cảnh báo có thể xuất hiện lại khi
bạn cài phiên bản tiếp theo.

**Cách xử lý, theo đúng thứ tự:**

1. Chỉ tiếp tục nếu tệp cài đặt do chính bên bán gửi cho bạn qua
   kênh hai bên đã thỏa thuận. Đừng chạy bản cài tải từ nguồn không
   rõ, kể cả khi tên tệp giống hệt.
2. Nếu bên bán công bố mã SHA-256 kèm bản phát hành (trong ghi chú
   phát hành), hãy đối chiếu mã của tệp bạn có với mã đã công bố
   trước khi chạy.
3. Nếu SmartScreen hoặc Defender cảnh báo hay chặn bản cài, ghi lại
   nguyên văn thông báo, kiểm tra tên tệp và SHA-256 với nguồn phát
   hành chính thức, rồi liên hệ bộ phận hỗ trợ LHM. Không tự bỏ qua
   cảnh báo hoặc tắt các lớp bảo vệ để tiếp tục cài.
4. Nếu Windows cho phép cài đặt, kiểm tra thông tin UAC và chỉ cấp
   quyền khi anh/chị đã xác minh nguồn cung cấp, tên chương trình và
   hiểu rõ quyền mà ứng dụng yêu cầu.

**Việc không nên làm:** không tắt SmartScreen/Windows Defender,
không thêm ngoại lệ antivirus và không dùng tệp từ nguồn không rõ.
Bản Preview chưa ký Authenticode không được diễn giải là đã được
Windows/Microsoft chứng nhận an toàn.

Lưu ý phân biệt: chữ ký Authenticode nói ở mục này là chứng chỉ do
tổ chức bên ngoài cấp cho tệp cài đặt. Nó khác với chữ ký nội bộ mà
sản phẩm tự kiểm tra cho license và cho engine ở bước 3 trên đây —
phần kiểm tra nội bộ đó vẫn hoạt động bình thường.

## 1.2 Dùng thử và license

- Lần cài đặt đầu tiên tự bắt đầu **thời gian dùng thử 10 ngày**, tối
  đa **10 hồ sơ**, gồm các tính năng hồ sơ, Automation và API cục bộ.
- Hết dùng thử hoặc hết hạn license, ứng dụng **khóa các thao tác vận
  hành** (tạo hồ sơ mới, mở trình duyệt, dùng API) nhưng **dữ liệu vẫn
  xem được, sao lưu được và khôi phục được** — phần mềm báo rõ điều
  này trong thông báo lỗi. Đừng chờ tới ngày hết hạn mới gia hạn; xem
  mục Trạng thái license ở bước 3 dưới đây để biết ngày hết hạn.
- License đã hết hạn hoặc không hợp lệ **không tự quay lại dùng thử**.
  License của bản cài này cũng không dùng được cho bản cài khác (mỗi
  license gắn với một mã cài đặt — xem bước 2).
- Với license thuê `owner-sweep`, đến ngày hết hạn khách có thể tiếp
  tục dùng khi máy chủ chủ sở hữu đang ngoại tuyến. Sau khi chủ sở hữu
  chạy quét và ứng dụng nhận biên nhận thu hồi có chữ ký, thao tác mở
  hoặc chạy mới bị khóa; phiên browser đang mở không bị tự đóng.

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
đây là trạng thái cấu hình, không phải lỗi của máy bạn. License
`strict`/offline vẫn được đánh giá theo chữ ký và ngày hết hạn ghi
trong mã license. Riêng license thuê `owner-sweep` bắt buộc có URL
xác minh và phải nhận ít nhất một biên nhận đăng ký có chữ ký trước
khi mở thao tác vận hành. Nếu chưa hoàn tất bước này, ứng dụng chặn
theo cơ chế fail-closed; hãy liên hệ bên bán, không xóa cấu hình máy
chủ để tìm cách tiếp tục sử dụng.

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
