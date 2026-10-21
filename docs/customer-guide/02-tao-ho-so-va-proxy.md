# 2. Tạo hồ sơ đầu tiên và gán proxy

Bấm **Tạo Profile Mới**. Form gồm ba tab: *1. Thông tin chung*,
*2. Proxy & Mạng*, *3. Vân tay phần cứng*.

## 2.1 Tab Thông tin chung — chọn engine

Engine lưu **theo từng hồ sơ**; đổi engine của một hồ sơ không mang
theo phiên đăng nhập (cookie, dữ liệu duyệt) của engine cũ.

| Lựa chọn trên form | Ý nghĩa thực tế ở bản này |
|---|---|
| Chrome / Edge | Engine mặc định, tương thích bản hiện tại. Dùng Chrome/Edge trên máy hoặc bộ bundled đã xác minh, tùy nguồn đã chọn ở hộp thoại Engine. |
| Firefox / Gecko | Dùng Firefox cài trên máy (có thể chỉ đường dẫn `firefox.exe`). Chỉ dùng thủ công; hỗ trợ proxy HTTP/SOCKS5 **không mật khẩu** qua giao diện này; CDP/RPA không hỗ trợ. |
| Camoufox / Gecko | Thử nghiệm riêng từng hồ sơ. Cần launcher và binary Camoufox đã kiểm chứng (cài ở hộp thoại Engine). Theo ghi chú trong form: **chưa hỗ trợ proxy/RPA trong bản preview**. |

Điền thêm: **Tên Profile** (ví dụ theo khách hàng/chiến dịch), **Nhóm**,
**Trang khởi động** (1–5 URL, mỗi dòng một URL), **Tag** (tối đa 8) và
**Ghi chú** nếu cần.

### Danh tính đã ghim cho hồ sơ Camoufox (chế độ thông số gốc)

Khi tạo hồ sơ Camoufox ở chế độ thông số gốc, ứng dụng sẽ thử **sinh
một bộ danh tính nhất quán bằng cơ chế chính thức của thư viện
Camoufox** ngay lúc tạo hồ sơ và ghim bộ danh tính đó cho hồ sơ (các
giá trị như User-Agent, nền tảng, ngôn ngữ, múi giờ, màn hình thuộc
cùng một bộ — ứng dụng không chắp vá từng giá trị riêng lẻ).

Có trường hợp bộ danh tính **không được cấp** (máy chưa cài engine
Camoufox đã kiểm chứng, hoặc thành phần sinh danh tính chưa sẵn
sàng). Khi đó hồ sơ vẫn được tạo, chạy với thông số gốc của engine,
và hồ sơ ghi trạng thái cấp danh tính là *unavailable* (chưa cấp
được). Đây không phải lỗi làm hỏng hồ sơ; bạn có thể yêu cầu cấp danh
tính sau bằng thao tác cấp danh tính cho hồ sơ đã có, hoặc liên hệ
bên bán kiểm tra tình trạng engine. Ý nghĩa chi tiết và cách xử lý:
xem [FAQ — provisioning unavailable](06-faq-su-co.md#provisioning).

## 2.2 Tab Proxy & Mạng

- **Loại Proxy:** *Không dùng Proxy (Direct)*, *HTTP* hoặc *SOCKS5*.
- Nên tạo proxy trong **Proxy Center** (nút trên thanh công cụ) rồi
  chọn lại từ ô **Chọn từ kho Proxy đã lưu** trong form hồ sơ. Lý do:
  tài khoản/mật khẩu proxy được quản lý và lưu trong kho bảo mật của
  Proxy Center — ô tài khoản/mật khẩu trong form hồ sơ bị khóa và ghi
  rõ "Quản lý tại Proxy Center". Bản sao lưu cấu hình cũng không chứa
  mật khẩu proxy.
- **Kiểm tra kết nối Proxy:** nút này kiểm tra IP thoát qua HTTPS
  (dịch vụ api.ipify.org) và so sánh với IP trực tiếp nếu đo được.
  Kết quả cho bạn biết proxy có kết nối được không và IP thoát quan
  sát được là gì — từ góc nhìn của ứng dụng quản lý. Đây là một lần
  đo tại thời điểm bấm nút; kết quả không thay thế phép đo từ phiên
  trình duyệt đang chạy, và không đánh giá chất lượng/uy tín của IP
  (việc đó nằm ngoài phạm vi sản phẩm — xem
  [trang giới hạn](07-nhung-gi-san-pham-khong-hua.md)).

Nguyên tắc vận hành mà chính phần mềm dựa vào để cảnh báo bạn (xem
chương 3): mỗi hồ sơ nên có IP thoát riêng; nhiều hồ sơ dùng chung
một IP thoát hoặc tập trung trên cùng một dải /24 là tài nguyên mạng
dùng chung quan sát được, và ứng dụng sẽ cảnh báo. Việc chọn proxy
nào cho hồ sơ nào là quyết định của bạn — phần mềm không tự đổi
proxy của hồ sơ.

## 2.3 Tab Vân tay phần cứng (thông số trình duyệt)

- **Thông số gốc (khuyên dùng):** UA, Canvas, WebGL… là giá trị thật
  của trình duyệt đang chạy hồ sơ; không có extension can thiệp. Với
  hồ sơ Camoufox, "thông số gốc" đi cùng danh tính đã ghim ở mục 2.1.
- **Tùy chỉnh thử nghiệm (cũ):** các giá trị tự đặt (hệ điều hành mô
  phỏng, độ phân giải, số nhân CPU, RAM, User-Agent, nhiễu Canvas/
  WebAudio/WebRTC thử nghiệm). Giao diện ghi rõ: chế độ này **có thể
  gây sai lệch hoặc lỗi website**, các giá trị tùy chỉnh "không chứng
  minh tính tương thích hoặc ẩn danh", và tính năng sửa WebRTC thử
  nghiệm "không bảo đảm chặn rò rỉ". Giá trị tự đặt rời rạc cũng có
  thể tự mâu thuẫn với nhau — đó là lý do chế độ gốc là lựa chọn
  khuyên dùng.
- Cả hai chế độ đều kèm câu ghi ngay trong form: **"Không có tùy
  chọn nào bảo đảm Google không liên kết các tài khoản."**
- Nút **Kiểm tra cấu hình** (Fingerprint Inspector) trong tab này
  đánh giá cấu hình bạn đã khai trong LHM có tự mâu thuẫn không (ví
  dụ User-Agent nói một hệ điều hành, nền tảng khai một hệ khác).
  Giao diện ghi rõ: báo cáo này chỉ đánh giá cấu hình LHM, **không đo
  tín hiệu Google**.

## 2.4 Kiểm tra cấu hình trước khi chạy

Ngoài Fingerprint Inspector, ứng dụng còn kiểm tra tính nhất quán
của hồ sơ ở màn hình sức khỏe hồ sơ (kiểm tra chuỗi tín hiệu —
Signal Chain). Kết quả mỗi hồ sơ thuộc một trong ba mức:

- **error (lỗi):** cấu hình tự mâu thuẫn hoặc không hợp lệ — ví dụ
  User-Agent lệch hệ điều hành đã khai, kích thước màn hình không
  hợp lệ, proxy sai định dạng, múi giờ không phải tên IANA. Nên sửa
  trước khi chạy.
- **warning (cảnh báo):** cấu hình chạy được nhưng có điểm cần chú ý
  — ví dụ User-Agent tùy chỉnh không mô tả đúng họ trình duyệt.
- **ready (sẵn sàng):** không phát hiện lỗi/cảnh báo ở mức kiểm tra
  cấu hình ngoại tuyến này.

Lưu ý phạm vi: đây là kiểm tra **cấu hình đã khai báo**, thực hiện
ngoại tuyến. "Sẵn sàng" không có nghĩa là các giá trị trình duyệt lộ
ra khi chạy đã được đo khớp — phần đó thuộc bảng kiểm tiêu chí
(chương 4) và trạng thái của nhiều tiêu chí hiện là CHƯA ĐO.

## 2.5 Mở hồ sơ

Bấm mở hồ sơ trong bảng hồ sơ. Nếu mở không được, ứng dụng **chặn
theo thiết kế (fail-closed)** thay vì mở bằng đường khác — ví dụ cấu
hình mạng không đạt điều kiện bắt buộc sẽ báo `NETWORK_BLOCKED` kèm
lý do. Các trường hợp chặn cụ thể và cách xử lý nằm ở
[FAQ](06-faq-su-co.md). Hồ sơ đang chạy thì không sửa và không xóa
được qua giao diện lẫn API — hãy đóng trình duyệt và chờ tiến trình
thoát hẳn trước.
